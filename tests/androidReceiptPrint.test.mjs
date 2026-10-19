import assert from 'node:assert/strict'
import { test } from 'node:test'
import { androidReceiptIntent, buildAndroidReceipt, isAndroidPrintDevice } from '../src/utils/androidReceiptPrint.js'
import { createCustomerI18n, translateCustomerText } from '../src/i18n/customerLanguage.js'
import { bundleHarness, hookRuntime, findElement, flush } from './helpers/hookHarness.mjs'

const receipt = {
  receiptNumber: 'R-20261019-001', paidAt: '2026-10-19T04:30:00Z', tableNumber: 3,
  restaurantName: '新🐔煮炒 Sinma', shopSnapshot: { address: 'Kuching\nSarawak', phone: '0123456789', receiptFooter: '谢谢光临！\nPlease come again.' },
  paymentMethod: 'Cash', cashReceived: 20, changeAmount: 11, grandTotal: 9, cashierName: 'JJ',
  orders: [{ subtotal: 9, discountAmount: 0, serviceCharge: 0, sst: 0, orderType: 'mixed', items: [{ name: '炒面', price: 9, quantity: 1, orderType: 'take_away', notes: '少辣\n不要葱', optionSnapshot: [{ groupName: '加料', options: [{ label: '鸡蛋', price: 1 }] }] }] }],
}
const decode = (intent) => JSON.parse(Buffer.from(intent.match(/payload=([^#]+)/)[1], 'base64url').toString('utf8'))

test('Android handoff preserves Unicode, cash tender, mixed-item takeaway and immutable paid quantities', () => {
  const original = structuredClone(receipt)
  const payload = buildAndroidReceipt(receipt)
  const intent = androidReceiptIntent(payload)
  assert.deepEqual(decode(intent), payload)
  assert.equal(payload.rows.find((row) => row.style === 'heading').left, receipt.restaurantName)
  for (const value of ['1× 炒面', 'TAKE AWAY', '少辣', '不要葱']) assert.ok(payload.rows.some((row) => row.left === value), value)
  assert.ok(payload.rows.some((row) => row.left === '加料: 鸡蛋 (+RM 1.00)'))
  assert.equal(payload.rows.find((row) => row.left === 'Cash received').right, 'RM 20.00')
  assert.equal(payload.rows.find((row) => row.left === 'Change').right, 'RM 11.00')
  assert.deepEqual(receipt, original)
  assert.ok(intent.endsWith(';scheme=dineosprint;package=com.dineos.printtest;end'))
  assert.ok(!intent.includes('https:') && !intent.includes('token') && !intent.includes('browser_fallback_url'))
})

test('zero charges disappear; positive paid snapshot charges and discount remain bilingual', () => {
  const i18n = createCustomerI18n('zh')
  const options = { language: 'zh', t: (text) => translateCustomerText(i18n, text) }
  const zero = buildAndroidReceipt(receipt, options)
  assert.ok(!zero.rows.some((row) => ['服务费', 'SST'].includes(row.left)))
  const paid = structuredClone(receipt)
  paid.orders[0] = { ...paid.orders[0], discountAmount: 1, serviceCharge: 0.8, sst: 0.48 }
  paid.grandTotal = 9.28; paid.changeAmount = 10.72
  const rows = buildAndroidReceipt(paid, options).rows
  assert.equal(rows.find((row) => row.left === options.t('Service charge')).right, 'RM 0.80')
  assert.equal(rows.find((row) => row.left === options.t('SST')).right, 'RM 0.48')
  assert.equal(rows.find((row) => row.left === options.t('Discount')).right, '−RM 1.00')
  assert.ok(rows.some((row) => row.left === options.t('TAKE AWAY')))
})

test('unpaid/empty/invalid financial payloads and oversized receipts fail closed', () => {
  for (const values of [{ paidAt: null }, { paidAt: 'invalid' }, { orders: [] }, { grandTotal: -1 }, { grandTotal: NaN }, { orders: [{ items: [] }] }, { orders: [{ items: [{ name: 'x', price: 9, quantity: 0 }] }] }]) assert.throws(() => buildAndroidReceipt({ ...receipt, ...values }))
  assert.throws(() => buildAndroidReceipt({ ...receipt, restaurantName: 'x'.repeat(1001) }), /too large/)
  const huge = structuredClone(receipt)
  huge.orders[0].items = Array.from({ length: 100 }, () => ({ ...receipt.orders[0].items[0], notes: '长'.repeat(400) }))
  assert.throws(() => buildAndroidReceipt(huge), /too large/)
  assert.throws(() => androidReceiptIntent({ text: 'x'.repeat(32001) }), /too large/)
  const dirty = structuredClone(receipt); dirty.orders[0].items[0].notes = '\x1b\x40Cash\x00'
  const sanitized = buildAndroidReceipt(dirty)
  assert.ok(!sanitized.rows.some((row) => /[\x00-\x1f]/.test(row.left)))
  const inconsistent = buildAndroidReceipt({ ...receipt, changeAmount: 0 })
  assert.ok(!inconsistent.rows.some((row) => row.left === 'Cash received'))
})

test('Android detection does not redirect desktop or iOS printing', () => {
  assert.equal(isAndroidPrintDevice('Mozilla/5.0 (Linux; Android 14) Chrome/130'), true)
  for (const ua of ['iPhone', 'Macintosh', '', 'Windows']) assert.equal(isAndroidPrintDevice(ua), false)
})

async function pageFixture(android = true, paid = true) {
  const runtime = hookRuntime()
  const result = await bundleHarness(`import Receipt from './src/pages/cashier/Receipt.jsx';export {fixture} from 'receipt-fixture';export {Receipt};`, runtime, {
    'receipt-fixture': `export const fixture={receipt:${JSON.stringify(paid ? receipt : { ...receipt, paidAt: null })},events:[]};`,
    'react-router-dom': `export const Link='a';export const useParams=()=>({receiptNumber:'R-20261019-001'});export const useLocation=()=>({});export const useSearchParams=()=>[new URLSearchParams('print=1')];`,
    useReceipt: `import {fixture} from 'receipt-fixture';export default ()=>({receipt:fixture.receipt,isLoading:false,error:''});`,
    useShopSettings: `export default ()=>({name:'Shop',isLoading:false,error:''});`,
    useCustomerLanguage: `export default ()=>({language:'en',t:(v)=>v});`,
    ReceiptRefundSummary: `export default function ReceiptRefundSummary(){return null}`,
    ReceiptPaper: `export default function ReceiptPaper(){return null}`,
    adminApiService: `import {fixture} from 'receipt-fixture';export const reprintSupabaseReceipt=async(n)=>{fixture.events.push(['audit',n])};`,
    receiptPrint: `export const waitForReceiptAssets=async()=>{};`,
  })
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), previousWindow = globalThis.window
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: android ? 'Android Chrome' : 'Macintosh Chrome' } })
  globalThis.window = { print: () => result.fixture.events.push(['browser']), location: { assign: (url) => result.fixture.events.push(['intent', url]) } }
  return { ...result, runtime, render: () => runtime.render(result.Receipt), restore() { runtime.cleanup(); if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator); else delete globalThis.navigator; globalThis.window = previousWindow } }
}

test('actual Android receipt page never auto launches; explicit tap sends receipt, browser fallback stays available', async () => {
  const fixture = await pageFixture()
  try {
    const page = fixture.render(); fixture.runtime.effects(); await flush()
    assert.deepEqual(fixture.fixture.events, [])
    findElement(page, (node) => node.props?.children === 'Print with Bluetooth helper').props.onClick()
    assert.equal(decode(fixture.fixture.events.find(([type]) => type === 'intent')[1]).receiptNumber, receipt.receiptNumber)
    assert.ok(!fixture.fixture.events.some(([type]) => type === 'browser'))
    await findElement(page, (node) => node.props?.children === 'Print / Save PDF').props.onClick()
    assert.ok(fixture.fixture.events.some(([type]) => type === 'browser'))
  } finally { fixture.restore() }
})

test('actual unpaid page exposes neither print action; desktop retains automatic browser printing', async () => {
  const unpaid = await pageFixture(true, false)
  try { assert.equal(findElement(unpaid.render(), (node) => node.props?.children === 'Print with Bluetooth helper'), null) } finally { unpaid.restore() }
  const desktop = await pageFixture(false)
  try {
    const page = desktop.render(); desktop.runtime.effects(); await flush()
    assert.equal(findElement(page, (node) => node.props?.children === 'Print with Bluetooth helper'), null)
    assert.ok(desktop.fixture.events.some(([type]) => type === 'browser'))
    assert.ok(!desktop.fixture.events.some(([type]) => type === 'intent'))
  } finally { desktop.restore() }
})

test('actual page reports invalid/oversized handoff without navigating or marking paper printed', async () => {
  const fixture = await pageFixture()
  try {
    fixture.fixture.receipt = { ...receipt, restaurantName: 'x'.repeat(1001) }
    findElement(fixture.render(), (node) => node.props?.children === 'Print with Bluetooth helper').props.onClick()
    assert.deepEqual(fixture.fixture.events, [])
    assert.match(findElement(fixture.render(), (node) => node.props?.role === 'alert').props.children, /too large/)
  } finally { fixture.restore() }
})
