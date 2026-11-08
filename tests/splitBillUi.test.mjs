import assert from 'node:assert/strict'
import test from 'node:test'
import { allUnpaidQuantities, billSelections, tableForPayment } from '../src/utils/splitBill.js'
import { paymentPlan } from '../server/src/paymentSelection.js'
import { hookRuntime, bundleHarness, findElement, memoryStorage, flush } from './helpers/hookHarness.mjs'

const orderId = '66b195a3-18e0-4f2d-a337-42797a0ba97f'
const riceId = 'a98b5086-dff8-4aca-b8a7-f42459604745'
const teaId = '7aeb9f26-c012-48a8-b167-7ca991380002'
const order = { id: orderId, version: 1, tableSessionId: 'visit-1', tableNumber: 1, status: 'ready', serviceChargeRate: 0, sstRate: 0, grandTotal: 32, items: [
  { id: riceId, name: '炒饭', quantity: 3, paidQuantity: 0, price: 9, orderType: 'dine_in', notes: '少辣', optionSnapshot: [] },
  { id: teaId, name: 'Tea', quantity: 1, paidQuantity: 0, price: 5, orderType: 'take_away' },
] }
const component = (tree, name) => findElement(tree, (node) => node.type?.name === name)
const button = (tree, label) => findElement(tree, (node) => node.props?.onClick && node.props.children === label)
const input = (tree, name) => findElement(tree, (node) => node.type === 'input' && node.props['aria-label'] === `Pay quantity: ${name}`)
const language = `export default ()=>({t:(text,options={})=>text.replace(/{{(\\w+)}}/g,(match,key)=>options[key]??match),statusLabel:(s)=>s,locale:'en-MY'})`

async function cashier() {
  const runtime = hookRuntime()
  const oldWindow = globalThis.window
  globalThis.window = { sessionStorage: memoryStorage() }
  const module = await bundleHarness(`export {default as Page} from './src/pages/cashier/Dashboard.jsx';export {fixture} from 'split-fixture'`, runtime, {
    ...Object.fromEntries(['CashierOverview', 'PaymentConfirmationDialog', 'PaymentSuccessPanel', 'DiscountControl', 'MemberLookup', 'RewardRedemption'].map((name) => [name, `export default function ${name}(){return null}`])),
    useCustomerLanguage: language,
    'split-fixture': `export const fixture={actor:'cashier-split',posts:[],refreshes:0,failRefresh:false,setup:{tables:[{tableNumber:'1',tableSessionId:'visit-1',grandTotal:32,orders:[${JSON.stringify(order)}]}],floorTables:[],clearableTables:[],recentOrders:[],billRequests:[],isLoading:false,error:''}}`,
    useAdminAuth: `import {fixture} from 'split-fixture';export default ()=>({authUser:{id:fixture.actor}})`,
    useCashierTables: `import {fixture} from 'split-fixture';export default ()=>({...fixture.setup,refreshPayments:async()=>{fixture.refreshes++;if(fixture.wait)await fixture.wait;if(fixture.failRefresh)throw Error('Offline');if(fixture.after)fixture.setup.tables=fixture.after}})`,
    adminApiService: `import {fixture} from 'split-fixture';export const clearSupabaseCashierTable=async()=>{};export const getSupabasePaymentRequest=async()=>null;export async function completeSupabaseTablePayment(body){fixture.posts.push(body);return {receiptNumber:'R-split',paidAt:'2026-11-07T04:00:00Z',tableNumber:1,tableId:'table1',tableSessionId:'visit-1',amount:body.expectedAmount,paymentMethod:body.paymentMethod,cashReceived:body.cashReceived,changeAmount:body.cashReceived-body.expectedAmount}}`,
  })
  const view = () => runtime.render(module.Page)
  component(view(), 'CashierOverview').props.onOpenTable(module.fixture.setup.tables[0])
  return { ...module, view, cleanup() { runtime.cleanup(); globalThis.window = oldWindow } }
}

test('split starts empty; select-all is explicit and never includes newly arriving dishes automatically', () => {
  const orders = [order]
  assert.deepEqual(billSelections(orders, {}, true), [])
  const selected = allUnpaidQuantities(orders)
  const next = [{ ...order, items: [...order.items, { id: 'late', quantity: 2, paidQuantity: 0, price: 6 }] }]
  assert.equal(billSelections(next, selected, true).some((item) => item.itemId === 'late'), false)
  assert.equal(billSelections(next, {}, false).length, 3)
  assert.deepEqual(allUnpaidQuantities([{ ...order, items: [{ ...order.items[0], paidQuantity: 2 }] }]), { [riceId]: 1 })
  assert.throws(() => paymentPlan(orders, [{ itemId: riceId, quantity: 4 }]), /already been paid/)
})

test('actual cashier split defaults to zero, blocks empty collection and confirms exact portions without POSTing', async () => {
  const h = await cashier()
  try {
    button(h.view(), 'Split bill').props.onClick()
    assert.equal(input(h.view(), '炒饭').props.value, 0)
    assert.equal(input(h.view(), 'Tea').props.value, 0)
    assert.equal(button(h.view(), 'Complete payment').props.disabled, true)
    button(h.view(), 'Select all').props.onClick()
    assert.equal(input(h.view(), '炒饭').props.value, 3)
    button(h.view(), 'Clear selection').props.onClick()
    input(h.view(), '炒饭').props.onChange({ target: { value: '1' } })
    component(h.view(), 'CashReceivedControl').props.onChange('10')
    button(h.view(), 'Complete payment').props.onClick()
    const dialog = component(h.view(), 'PaymentConfirmationDialog')
    assert.equal(dialog.props.total, 9)
    assert.deepEqual(dialog.props.items.map((i) => [i.name, i.quantity]), [['炒饭', 1]])
    assert.equal(dialog.props.items[0].notes, '少辣')
    assert.equal(h.fixture.posts.length, 0)
  } finally { h.cleanup() }
})

test('payment waits for a fresh balance, then next diner stays on this visit with no selection, discount or cash carried over', async () => {
  const h = await cashier()
  try {
    button(h.view(), 'Split bill').props.onClick()
    input(h.view(), '炒饭').props.onChange({ target: { value: '1' } })
    component(h.view(), 'CashReceivedControl').props.onChange('10')
    button(h.view(), 'Complete payment').props.onClick()
    let release
    h.fixture.wait = new Promise((resolve) => { release = resolve })
    h.fixture.after = [{ ...h.fixture.setup.tables[0], grandTotal: 23, orders: [{ ...order, version: 2, grandTotal: 23, items: [{ ...order.items[0], paidQuantity: 1 }, order.items[1]] }] }]
    await component(h.view(), 'PaymentConfirmationDialog').props.onConfirm()
    assert.equal(component(h.view(), 'PaymentSuccessPanel').props.remainingAmount, null, 'Never show the pre-payment balance as current')
    component(h.view(), 'PaymentSuccessPanel').props.onContinue()
    assert.ok(component(h.view(), 'PaymentSuccessPanel'), 'Cannot continue before balance is checked')
    release(); await flush()
    const success = component(h.view(), 'PaymentSuccessPanel')
    assert.equal(success.props.remainingAmount, 23)
    assert.equal(success.props.payment.total, 9)
    assert.equal(h.fixture.refreshes, 1)
    success.props.onContinue()
    assert.equal(input(h.view(), '炒饭').props.max, 2)
    assert.equal(input(h.view(), '炒饭').props.value, 0)
    assert.equal(input(h.view(), 'Tea').props.value, 0)
    assert.equal(component(h.view(), 'CashReceivedControl').props.value, '')
    assert.equal(component(h.view(), 'DiscountControl').props.discount.value, '0')
    assert.equal(button(h.view(), 'Complete payment').props.disabled, true)
    assert.equal(h.fixture.posts.length, 1)
    assert.deepEqual(Object.keys(h.fixture.posts[0]).sort(), ['cashReceived','discount','expectedAmount','orderIds','paymentMethod','requestId','selections','versions'].sort(), 'UI item snapshots do not change the payment API body')
  } finally { h.cleanup() }
})

test('failed balance refresh preserves the paid receipt and blocks continuing until a successful read-only retry', async () => {
  const h = await cashier()
  try {
    component(h.view(), 'CashReceivedControl').props.onChange('50')
    button(h.view(), 'Complete payment').props.onClick()
    h.fixture.failRefresh = true
    await component(h.view(), 'PaymentConfirmationDialog').props.onConfirm(); await flush()
    const failed = component(h.view(), 'PaymentSuccessPanel')
    assert.equal(failed.props.balanceError, true)
    assert.equal(failed.props.remainingAmount, null)
    assert.equal(failed.props.payment.receiptNumber, 'R-split')
    failed.props.onContinue()
    assert.ok(component(h.view(), 'PaymentSuccessPanel'))
    h.fixture.failRefresh = false; h.fixture.after = []
    failed.props.onRefreshBalance(); await flush()
    assert.equal(component(h.view(), 'PaymentSuccessPanel').props.remainingAmount, 0)
    assert.equal(h.fixture.posts.length, 1, 'Refreshing a balance must not collect again')
  } finally { h.cleanup() }
})

test('confirmation rejects a changed order even if its amount is unchanged', async () => {
  const h = await cashier()
  try {
    component(h.view(), 'CashReceivedControl').props.onChange('50')
    button(h.view(), 'Complete payment').props.onClick()
    h.fixture.setup.tables[0].orders = [{ ...order, version: 2 }]
    const dialog = component(h.view(), 'PaymentConfirmationDialog')
    assert.match(dialog.props.error, /bill has changed/)
    await dialog.props.onConfirm()
    assert.equal(h.fixture.posts.length, 0)
  } finally { h.cleanup() }
})

test('balance lookup isolates physical visits and independent no-table walk-ins', () => {
  const tables = [{ tableNumber: '1', tableSessionId: 'new-visit', grandTotal: 99 }, { isWalkIn: true, tableSessionId: 'walkin-A', grandTotal: 9 }, { isWalkIn: true, tableSessionId: 'walkin-B', grandTotal: 5 }]
  assert.equal(tableForPayment(tables, { tableNumber: 1, tableSessionId: 'old-visit' }), undefined)
  assert.equal(tableForPayment(tables, { tableSessionId: 'walkin-A' }).grandTotal, 9)
  assert.equal(tableForPayment(tables, { tableNumber: 1 }), null)
})

test('customer shared bill and table summary do not label shared totals as personal balances', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as Bill} from './src/pages/customer/Bill.jsx';export {default as Summary} from './src/pages/customer/TableSummary.jsx';export {fixture} from 'split-fixture'`, runtime, {
    useCustomerLanguage: language,
    'split-fixture': `export const fixture={requests:[],toasts:[]}`,
    useCustomerSession: `export default ()=>({session:{sessionId:'shared',tableSessionId:'visit-1',isSharedTable:true}})`,
    useTableSummary: `export default ()=>({currentSessionId:'shared',grandTotal:32,hasSession:true,hasTableSession:true,participants:[{sessionId:'shared',customerNickname:'Shared Table',grandTotal:32,paymentStatus:'pending',orders:[]}]})`,
    useCustomerToast: `import {fixture} from 'split-fixture';export default ()=>({showToast:(...a)=>fixture.toasts.push(a)})`,
    customerApi: `import {fixture} from 'split-fixture';export async function createCustomerServiceRequest(...args){fixture.requests.push(args);return {duplicate:false}}`,
  })
  const allText = (tree) => JSON.stringify(tree, (_key, value) => typeof value === 'function' ? value.name : value)
  const bill = () => runtime.render(h.Bill)
  assert.match(allText(bill()), /whole table’s unpaid amount/)
  assert.equal(allText(bill()).includes('Shared session total'), false)
  const split = findElement(bill(), (node) => node.type === 'button' && allText(node).includes('Select dishes and quantities with the cashier.'))
  split.props.onClick()
  await button(bill(), 'Request split bill').props.onClick()
  assert.deepEqual(h.fixture.requests[0], ['shared', 'requestBill', { billMode: 'split', requestedAmount: null, tableSessionId: 'visit-1' }])
  const summary = runtime.render(h.Summary)
  assert.equal(findElement(summary, (node) => node.props?.children === 'You'), null)
  assert.equal(findElement(summary, (node) => node.props?.children === 'Individual total'), null)
  runtime.cleanup()
})

test('actual confirmation lists exact dishes, and success keeps next-diner action hidden while balance is unknown', async () => {
  const runtime = hookRuntime(), oldDocument = globalThis.document
  globalThis.document = { body: {} }
  try {
    const h = await bundleHarness(`export {default as Confirmation} from './src/components/cashier/PaymentConfirmationDialog.jsx';export {default as Success} from './src/components/cashier/PaymentSuccessPanel.jsx'`, runtime, {
      useCustomerLanguage: language,
      useShopSettings: 'export default ()=>({config:{requireHandoffConfirmation:false}})',
      'react-dom': 'export const createPortal=(node)=>node',
    })
    const confirm = runtime.render(h.Confirmation, { total: 9, method: 'Cash', items: [{ ...order.items[0], quantity: 1 }] })
    const list = findElement(confirm, (node) => node.type === 'ul')
    assert.ok(list)
    assert.ok(findElement(list, (node) => node.type === 'li'))
    assert.match(JSON.stringify(list), /炒饭/)
    assert.match(JSON.stringify(list), /少辣/)
    assert.equal(JSON.stringify(list).includes('Tea'), false)
    const props = { payment: { receiptNumber: 'R-split', paidTime: '2026-11-07T04:00:00Z', total: 9, method: 'Cash' }, onContinue() {} }
    const unknown = runtime.render(h.Success, props)
    assert.equal(button(unknown, 'Continue with next diner'), null)
    const ready = runtime.render(h.Success, { ...props, remainingAmount: 23 })
    assert.ok(button(ready, 'Continue with next diner'))
    const done = runtime.render(h.Success, { ...props, remainingAmount: 0 })
    assert.equal(button(done, 'Continue with next diner'), null)
    assert.ok(findElement(done, (node) => node.props?.children === 'All items are paid.'))
    const failed = runtime.render(h.Success, { ...props, balanceError: true })
    assert.equal(button(failed, 'Continue with next diner'), null)
    assert.ok(findElement(failed, (node) => node.props?.children === 'Refresh remaining bill'))
  } finally { runtime.cleanup(); globalThis.document = oldDocument }
})

test('actual cashier feed invalidates pre-payment reads and reports refresh failure instead of exposing stale balances', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as useTables} from './src/hooks/useCashierTables';export {fixture} from 'split-fixture'`, runtime, {
    'split-fixture': `export const fixture={reads:0,stopped:false,fail:false}`,
    adminApiService: `import {fixture} from 'split-fixture';export function watchSupabasePendingPayments(onData,onError){fixture.data=onData;return {stop(){fixture.stopped=true},async refreshLatest(){fixture.reads++;if(fixture.fail)onError(Error('offline'));else onData({orders:[]})}}}`,
  })
  runtime.render(h.useTables); runtime.effects()
  h.fixture.data({ orders: [{ ...order, tableSessionId: 'visit-1' }] })
  assert.equal(runtime.render(h.useTables).tables.length, 1)
  await runtime.render(h.useTables).refreshPayments()
  assert.equal(runtime.render(h.useTables).tables.length, 0)
  h.fixture.fail = true
  await assert.rejects(runtime.render(h.useTables).refreshPayments(), /offline/)
  assert.ok(runtime.render(h.useTables).error)
  runtime.cleanup()
  assert.equal(h.fixture.stopped, true)
})
