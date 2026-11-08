import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import Module, { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import { createPaymentRecoveryStorage, paymentRequestBody } from '../src/utils/paymentRecoveryStorage.js'
import { createRefundRecoveryStorage } from '../src/utils/refundRecoveryStorage.js'
import { trackFeed, connectionSnapshot } from '../src/utils/connectionStatus.js'
import { hookRuntime, bundleHarness, findElement, memoryStorage, flush } from './helpers/hookHarness.mjs'

const orderId = '66b195a3-18e0-4f2d-a337-42797a0ba97f', itemId = 'a98b5086-dff8-4aca-b8a7-f42459604745'
const confirmation = { requestId: crypto.randomUUID(), orderIds: [orderId], selections: [{ itemId, quantity: 1 }], versions: { [orderId]: 1 }, expectedAmount: 9, paymentMethod: 'Cash', cashReceived: 20, discount: { type: 'percentage', value: '0' }, tableSnapshot: { private: 'not persisted' } }
const record = { actorId: 'cashier-A', tableNumber: '1', body: paymentRequestBody(confirmation) }

test('pending payment survives refresh per actor with exact body and no table snapshot or credentials', () => {
  const store = memoryStorage(), first = createPaymentRecoveryStorage(() => store)
  first.save(record)
  const restored = createPaymentRecoveryStorage(() => store).read(record.actorId)
  assert.deepEqual(restored, record); assert.equal(restored.body.tableSnapshot, undefined); assert.equal(first.read('cashier-B'), null)
  first.clear(record.actorId); assert.equal(first.read(record.actorId), null)
})
test('payment storage failure prevents sending; corrupted pending keys fail closed instead of starting another bill', () => {
  const denied = createPaymentRecoveryStorage(() => { throw new Error('storage denied') })
  assert.throws(() => denied.save(record), /denied/)
  const store = memoryStorage(); store.setItem('dineos-pending-payment-v1:cashier-A', '{damaged')
  assert.equal(createPaymentRecoveryStorage(() => store).read('cashier-A').damaged, true)
})
test('refund recovery saves the exact external-return confirmation, is actor-isolated and never silently drops damaged data', () => {
  const store = memoryStorage(), first = createRefundRecoveryStorage(() => store)
  const pending = { actorId: 'admin-A', receiptNumber: 'R-test', body: { requestId: crypto.randomUUID(), amount: '4.00', reason: 'Wrong item', method: 'Cash', fundsReturned: true } }
  first.save(pending); assert.deepEqual(createRefundRecoveryStorage(() => store).read('admin-A'), pending); assert.equal(first.read('admin-B'), null)
  assert.throws(() => first.save({ ...pending, body: { ...pending.body, fundsReturned: false } }))
  store.setItem('dineos-manual-refund-v1:admin-A', '{bad'); assert.equal(first.read('admin-A').damaged, true)
})
test('connection status distinguishes browser offline, initial reads, stale feeds, failures, recovery and unmounted pages', () => {
  const feed = trackFeed(5000), now = Date.now()
  assert.equal(connectionSnapshot(now).state, 'checking')
  feed.success(); assert.equal(connectionSnapshot().state, 'current')
  assert.equal(connectionSnapshot(Date.now() + 30001).state, 'stale')
  assert.equal(connectionSnapshot(Date.now(), false).state, 'offline')
  feed.failure(); assert.equal(connectionSnapshot().state, 'stale')
  feed.success(); assert.equal(connectionSnapshot().state, 'current')
  const second = trackFeed(10000); second.failure(); assert.equal(connectionSnapshot().state, 'stale')
  second.stop(); assert.equal(connectionSnapshot().state, 'current'); feed.stop(); assert.equal(connectionSnapshot().state, 'idle')
})

const language = 'export default ()=>({t:(text)=>text,formatDate:(value)=>String(value)})'
const dummyComponents = Object.fromEntries(['CashierOverview', 'PaymentConfirmationDialog', 'PaymentSuccessPanel', 'DiscountControl', 'MemberLookup', 'RewardRedemption'].map((name) => [name, `export default function ${name}(){return null}`]))
async function cashierHarness() {
  const runtime = hookRuntime()
  const module = await bundleHarness(`export {default as Page} from './src/pages/cashier/Dashboard.jsx';export {default as Recovery} from './src/components/cashier/PaymentRecoveryPanel.jsx';export {fixture} from 'payment-fixture'`, runtime, {
    ...dummyComponents,
    useCustomerLanguage: language,
    'payment-fixture': `export const fixture={actor:'cashier-A',posts:[],reads:0,committed:new Map(),lose:false,commit:true,setup:{clearableTables:[],floorTables:[],tables:[{tableNumber:'1',orders:[{id:'${orderId}',tableNumber:1,version:1,serviceChargeRate:0,sstRate:0,status:'ready',items:[{id:'${itemId}',name:'Test rice',price:9,quantity:1,paidQuantity:0}]}]}],recentOrders:[],billRequests:[],isLoading:false,error:''}}`,
    useAdminAuth: `import {fixture} from 'payment-fixture';export default ()=>({authUser:{id:fixture.actor}})`,
    useCashierTables: `import {fixture} from 'payment-fixture';export default ()=>fixture.setup`,
    adminApiService: `import {fixture} from 'payment-fixture';export const clearSupabaseCashierTable=async()=>{};export async function getSupabasePaymentRequest(id){fixture.reads++;return fixture.committed.get(id)??null}export async function completeSupabaseTablePayment(body){fixture.posts.push(body);if(fixture.commit&&!fixture.committed.has(body.requestId))fixture.committed.set(body.requestId,{receiptNumber:'R-test',paidAt:'2026-10-16T04:00:00Z',amount:9,tableId:'table1',tableNumber:1,paymentMethod:'Cash',cashReceived:20,changeAmount:11});if(fixture.lose){fixture.lose=false;throw Object.assign(new TypeError('Test lost response'),{status:fixture.failureStatus})}return fixture.committed.get(body.requestId)}`,
  })
  return { ...module, runtime, view: () => runtime.render(module.Page) }
}
function browser() { const previous = globalThis.window; const storage = memoryStorage(); globalThis.window = { sessionStorage: storage }; return { storage, cleanup() { if (previous === undefined) delete globalThis.window; else globalThis.window = previous } } }
function byName(tree, name) { return findElement(tree, (node) => node.type?.name === name) }
function button(tree, label) { return findElement(tree, (node) => node.props?.children === label && node.props?.onClick) }

test('discount from the order drawer reaches the existing payment confirmation without collecting early', async () => {
  const b = browser(), h = await cashierHarness()
  try {
    byName(h.view(), 'CashierOverview').props.onOpenTable(h.fixture.setup.tables[0], { discount: { type: 'fixed', value: '5' } })
    assert.deepEqual(byName(h.view(), 'DiscountControl').props.discount, { type: 'fixed', value: '5' })
    byName(h.view(), 'CashReceivedControl').props.onChange('10')
    button(h.view(), 'Complete payment').props.onClick()
    const confirmation = byName(h.view(), 'PaymentConfirmationDialog')
    assert.equal(confirmation.props.total, 4)
    assert.equal(h.fixture.posts.length, 0, 'only the final payment confirmation may send collection')
  } finally { h.runtime.cleanup(); b.cleanup() }
})

test('real cashier page refresh checks a lost committed payment without POSTing again, then shows its receipt', async () => {
  const b = browser(), h = await cashierHarness(); let restored
  try {
    byName(h.view(), 'CashierOverview').props.onOpenTable(h.fixture.setup.tables[0])
    byName(h.view(), 'CashReceivedControl').props.onChange('20')
    button(h.view(), 'Complete payment').props.onClick()
    h.fixture.lose = true
    await byName(h.view(), 'PaymentConfirmationDialog').props.onConfirm()
    assert.equal(h.fixture.committed.size, 1); assert.equal(h.fixture.posts.length, 1)
    assert.equal(h.view().type.name, 'PaymentRecoveryPanel')
    h.runtime.cleanup(); restored = await cashierHarness(); restored.fixture.committed = h.fixture.committed
    const panel = restored.view(); assert.equal(panel.type.name, 'PaymentRecoveryPanel')
    restored.runtime.render(restored.Recovery, panel.props); restored.runtime.effects(); await flush()
    assert.equal(restored.fixture.reads, 1); assert.equal(restored.fixture.posts.length, 0)
    assert.equal(byName(restored.view(), 'PaymentSuccessPanel').props.payment.receiptNumber, 'R-test')
    assert.equal(createPaymentRecoveryStorage(() => b.storage).read('cashier-A'), null)
  } finally { h.runtime.cleanup(); restored?.runtime.cleanup(); b.cleanup() }
})
test('database 503 after payment commit preserves recovery and resolves by read without collecting twice', async () => {
  const b = browser(), h = await cashierHarness()
  try {
    byName(h.view(), 'CashierOverview').props.onOpenTable(h.fixture.setup.tables[0])
    byName(h.view(), 'CashReceivedControl').props.onChange('20')
    button(h.view(), 'Complete payment').props.onClick()
    h.fixture.lose = true; h.fixture.failureStatus = 503
    await byName(h.view(), 'PaymentConfirmationDialog').props.onConfirm()
    const pending = createPaymentRecoveryStorage(() => b.storage).read('cashier-A')
    assert.ok(pending?.body.requestId)
    assert.equal(h.fixture.posts.length, 1)
    assert.equal(h.fixture.committed.size, 1)
    const panel = h.view()
    assert.equal(panel.type.name, 'PaymentRecoveryPanel')
    h.runtime.render(h.Recovery, panel.props); h.runtime.effects(); await flush()
    assert.equal(h.fixture.posts.length, 1)
    assert.equal(h.fixture.reads, 1)
    assert.equal(byName(h.view(), 'PaymentSuccessPanel').props.payment.receiptNumber, 'R-test')
  } finally { h.runtime.cleanup(); b.cleanup() }
})

test('pending payment with no confirmed result only sends on explicit retry, reusing exact ID and quantities', async () => {
  const b = browser(), h = await cashierHarness()
  try {
    createPaymentRecoveryStorage(() => b.storage).save(record)
    // A fresh instance is a reload of the same tab.
    const page = await cashierHarness()
    const panel = page.view(); page.runtime.render(page.Recovery, panel.props); page.runtime.effects(); await flush()
    assert.equal(page.fixture.posts.length, 0)
    const tree = page.runtime.render(page.Recovery, panel.props)
    const retry = button(tree, 'Retry same payment')
    await Promise.all([retry.props.onClick(), retry.props.onClick()])
    assert.deepEqual(page.fixture.posts, [record.body]); assert.equal(page.fixture.committed.size, 1)
    page.runtime.cleanup()
  } finally { h.runtime.cleanup(); b.cleanup() }
})
test('a prior cashier payment result cannot resolve or erase another actor’s pending payment', async () => {
  const b = browser(), h = await cashierHarness()
  try {
    createPaymentRecoveryStorage(() => b.storage).save(record)
    const next = await cashierHarness(), oldPanel = next.view()
    next.fixture.actor = 'cashier-B'; next.view()
    oldPanel.props.onResolved({ receiptNumber: 'R-test', paidAt: 'now', amount: 9 })
    assert.ok(createPaymentRecoveryStorage(() => b.storage).read('cashier-A'))
    assert.equal(next.view().type.name, undefined)
    next.runtime.cleanup()
  } finally { h.runtime.cleanup(); b.cleanup() }
})

test('a recovered historical payment cannot clear the next customer’s visit at the same table', async () => {
  const b = browser(), h = await cashierHarness()
  try {
    createPaymentRecoveryStorage(() => b.storage).save(record)
    const page = await cashierHarness()
    page.fixture.setup.clearableTables = [{ tableId: 'table1', tableNumber: 1, tableSessionId: 'new-visit' }]
    const pending = page.view()
    pending.props.onResolved({ receiptNumber: 'R-old', paidAt: '2026-10-15T04:00:00Z', amount: 9, tableId: 'table1', tableNumber: 1, tableSessionId: 'old-visit', paymentMethod: 'Cash' })
    const success = byName(page.view(), 'PaymentSuccessPanel')
    assert.equal(success.props.canClear, false)
    success.props.onClear()
    assert.equal(byName(page.view(), 'ConfirmationDialog'), null)
    page.runtime.cleanup()
  } finally { h.runtime.cleanup(); b.cleanup() }
})

test('refund-aware reports subtract refunds by their own date, including prior-period receipts and negative net receipts', async () => {
  const runtime = hookRuntime(), module = await bundleHarness(`export {calculateAnalytics} from './src/hooks/useReportsAnalytics.js'`, runtime, { adminApiService: 'export const subscribeToSupabaseReportData=()=>()=>{}' })
  const data = { orders: [], requests: [], tables: [], categories: [], menuItems: [], payments: [], refundsAvailable: true, refunds: [{ amount: '12.10', createdAt: '2026-10-16T05:00:00Z' }, { amount: 4, createdAt: '2026-10-15T05:00:00Z' }] }
  const result = module.calculateAnalytics(data, { start: new Date('2026-10-16T00:00:00Z'), end: new Date('2026-10-17T00:00:00Z') })
  assert.equal(result.summary.totalRevenue, 0); assert.equal(result.summary.refundAmount, 12.1); assert.equal(result.summary.netRevenue, -12.1)
  const unavailable = module.calculateAnalytics({ ...data, refundsAvailable: false }, { start: new Date('2026-10-16T00:00:00Z'), end: new Date('2026-10-17T00:00:00Z') })
  assert.equal(unavailable.summary.netRevenue, null)
})

test('customer service history masks old-table results immediately and serializes refresh after completion', async () => {
  const runtime = hookRuntime(), module = await bundleHarness(`export {default as useRequests} from './src/hooks/useCustomerServiceRequests.js';export {fixture} from 'requests-fixture'`, runtime, {
    'requests-fixture': 'export const fixture={reads:[],waiting:[]}',
    customerApi: `import {fixture} from 'requests-fixture';export function getCustomerServiceRequests(id){fixture.reads.push(id);return new Promise(resolve=>fixture.waiting.push(resolve))}`,
  })
  function old() { return module.useRequests('old-visit') }
  function next() { return module.useRequests('next-visit') }
  try {
    runtime.render(old); runtime.effects(); await flush()
    const before = runtime.render(old); assert.equal(before.requests.length, 0)
    module.fixture.waiting.shift()([{ id: 'old-request', status: 'pending' }]); await flush()
    assert.equal(runtime.render(old).requests[0].id, 'old-request')
    runtime.cleanup(); assert.equal(runtime.render(next).requests.length, 0)
    runtime.effects(); await flush(); module.fixture.waiting.shift()([{ id: 'new-request', status: 'completed' }]); await flush()
    assert.equal(runtime.render(next).requests[0].status, 'completed')
  } finally { runtime.cleanup() }
})

test('a failed first read on a new table cannot relabel the prior table’s request history', async () => {
  const runtime = hookRuntime(), module = await bundleHarness(`export {default as useRequests} from './src/hooks/useCustomerServiceRequests.js';export const fixture={}`, runtime, {
    customerApi: `export async function getCustomerServiceRequests(id){if(id==='new-visit')throw new Error('test offline');return [{id:'private-old-table-request'}]}`,
  })
  let session = 'old-visit'
  function sameComponent() { return module.useRequests(session) }
  try {
    runtime.render(sameComponent); runtime.effects(); await flush()
    assert.equal(runtime.render(sameComponent).requests[0].id, 'private-old-table-request')
    session = 'new-visit'; assert.deepEqual(runtime.render(sameComponent).requests, [])
    runtime.effects(); await flush()
    const failed = runtime.render(sameComponent); assert.ok(failed.error); assert.deepEqual(failed.requests, [])
  } finally { runtime.cleanup() }
})

test('payment recovery detects an existing persisted request again before sending a different bill', async () => {
  const b = browser(), runtime = hookRuntime(), module = await bundleHarness(`export {default as useRecovery} from './src/hooks/usePaymentRecovery.js'`, runtime)
  function hook() { return module.useRecovery('cashier-A') }
  try {
    runtime.render(hook)
    createPaymentRecoveryStorage(() => b.storage).save(record)
    assert.throws(() => runtime.render(hook).start({ ...confirmation, requestId: crypto.randomUUID() }, '2'), /previous payment/)
    assert.deepEqual(runtime.render(hook).pending.body, record.body)
    assert.deepEqual(createPaymentRecoveryStorage(() => b.storage).read('cashier-A'), record)
  } finally { runtime.cleanup(); b.cleanup() }
})

test('render-error fallback is bilingual and reloads without clearing stored recovery data; pages are lazy-loaded', () => {
  const root = path.resolve(import.meta.dirname, '..'), result = buildSync({ stdin: { contents: `export {AppErrorBoundary} from './src/components/common/PageErrorBoundary.jsx'`, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic' })
  const filename = path.join(root, 'tests', '__boundary-memory.cjs'), module = new Module(filename)
  module.filename = filename; module.paths = Module._nodeModulePaths(root); module.require = createRequire(filename); module._compile(result.outputFiles[0].text, filename)
  const previous = globalThis.localStorage, previousWindow = globalThis.window
  let reloads = 0
  try {
    globalThis.window = { location: { reload() { reloads++ } } }
    for (const language of ['en', 'zh']) {
      globalThis.localStorage = { getItem: () => language, removeItem() { throw new Error('must not clear recovery') } }
      const boundary = new module.exports.AppErrorBoundary({ children: 'healthy content' }); assert.equal(boundary.render(), 'healthy content')
      boundary.state = { failed: true }; const tree = boundary.render()
      assert.equal(tree.props.role, 'alert')
      const reload = findElement(tree, (node) => node.type === 'button'); reload.props.onClick()
      assert.equal(reload.props.children, language === 'zh' ? '重新加载页面' : 'Reload page')
    }
    assert.equal(reloads, 2)
    const source = fs.readFileSync(path.join(root, 'src/routes/AppRoutes.jsx'), 'utf8')
    assert.doesNotMatch(source, /^import .+ from ['"]\.\.\/pages\//m)
    assert.match(source, /lazy\(\(\) => import\('\.\.\/pages\/cashier\/Dashboard'\)\)/)
  } finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow }
})
