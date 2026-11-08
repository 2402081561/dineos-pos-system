import assert from 'node:assert/strict'
import test from 'node:test'
import { hookRuntime, bundleHarness, findElement, flush, memoryStorage } from './helpers/hookHarness.mjs'
import { createCounterDraftStorage, emptyCounterDraft, counterRequestPayload } from '../src/utils/counterDraftStorage.js'
import { orderLocationLabel, paymentBillKey } from '../src/utils/orderLocation.js'
import { currentRecentOrderTable, recentOrderPayment } from '../src/utils/cashierRecentOrder.js'
import { buildKitchenTicket } from '../src/utils/kitchenTicket.js'
import { buildAndroidReceipt } from '../src/utils/androidReceiptPrint.js'

const itemId = '91d5ac84-8243-4caf-8672-180964979c59'
test('walk-in draft persists no-table intent and exact request without changing physical-table payloads', () => {
  const draft = { ...emptyCounterDraft('cashier', 'walk-in'), cart: { rice: { menuItemId: itemId, name: '饭', notes: '', selections: [], quantity: 1, orderType: 'take_away' } } }
  const payload = counterRequestPayload(draft, 1, null)
  assert.equal(payload.tableId, null); assert.equal(payload.isWalkIn, true)
  assert.equal(payload.expectedTableSessionId, null)
  draft.request = { requestId: crypto.randomUUID(), payload, uncertain: true }
  const storage = createCounterDraftStorage({ getStorage: () => memory })
  const memory = memoryStorage(); storage.save('cashier', draft)
  assert.deepEqual(storage.read('cashier').request.payload, payload)
  assert.ok(!Object.hasOwn(counterRequestPayload(emptyCounterDraft('cashier', 'physical-table'), 1, null), 'isWalkIn'))
  assert.equal(storage.read('cashier', 'physical-table').tableId, 'walk-in', 'An unfinished walk-in cannot be silently relabelled')
  storage.save('cashier', emptyCounterDraft('cashier', 'physical-table'))
  assert.equal(storage.read('cashier', 'walk-in').tableId, 'walk-in', 'An empty old draft does not override a new walk-in shortcut')
})

test('actual pending-payment hook keeps separate walk-in bills and never merges them with physical tables', async () => {
  const runtime = hookRuntime()
  const module = await bundleHarness(`import useCashierTables from './src/hooks/useCashierTables';import {fixture} from 'walkin-fixture';export {useCashierTables,fixture}`, runtime, {
    'walkin-fixture': 'export const fixture={}',
    adminApiService: "import {fixture} from 'walkin-fixture';export function watchSupabasePendingPayments(onData){fixture.onData=onData;return {stop(){},async refreshLatest(){}}}",
  })
  runtime.render(module.useCashierTables); runtime.effects()
  const first = { id: 'one', isWalkIn: true, tableId: null, tableNumber: null, tableSessionId: 'visit-one', grandTotal: 9, paymentStatus: 'pending' }
  const second = { ...first, id: 'two', tableSessionId: 'visit-two', grandTotal: 12 }
  module.fixture.onData({ orders: [first, second, { ...first, id: 'table-order', isWalkIn: false, tableId: 'table-id', tableNumber: 1, tableSessionId: 'table-visit', grandTotal: 20 }] })
  const { tables } = runtime.render(module.useCashierTables)
  assert.equal(tables.length, 3)
  assert.deepEqual(tables.map((bill) => bill.grandTotal).sort((a,b)=>a-b), [9, 12, 20])
  assert.notEqual(paymentBillKey(first), paymentBillKey(second))
  assert.equal(orderLocationLabel(first, (text) => text === 'Walk-in' ? '散客' : text), '散客')
  const active = { ...first, tableSessionStatus: 'active' }
  const floor = { paymentTables: tables, floorTables: [], isLoading: false, error: '' }
  assert.ok(currentRecentOrderTable(active, floor))
  assert.deepEqual(recentOrderPayment(active, floor).orders.map((order) => order.id), ['one'])
  assert.equal(currentRecentOrderTable({ ...active, tableSessionStatus: 'completed' }, floor), null)
  runtime.cleanup()
})

test('actual counter page offers no-table walk-in, sends correct intent and hides it on older databases', async () => {
  const previous = globalThis.window
  globalThis.window = { sessionStorage: memoryStorage() }
  const runtime = hookRuntime()
  try {
    const h = await bundleHarness(`import NewOrder from './src/pages/cashier/NewOrder';import {fixture} from 'walkin-fixture';export {NewOrder,fixture}`, runtime, {
      'walkin-fixture': `export const fixture={requests:[],setup:{walkInEnabled:true,tables:[],items:[{id:'${itemId}',name:'Test rice',price:9,isAvailable:true}],settings:{serviceChargeRate:0,sstRate:0},settingsRevision:1}}`,
      useCustomerLanguage: 'export default ()=>({t:(text,options={})=>text.replace(/{{(\\w+)}}/g,(match,key)=>options[key]??match)})',
      useAdminAuth: "export default ()=>({authUser:{id:'walkin-cashier'}})",
      deploymentFeatures: 'export const hasSavedTableVisitTools=false',
      'react-router-dom': "export const useSearchParams=()=>[new URLSearchParams('walkIn=1')];export const Link=()=>null",
      adminApiService: "import {fixture} from 'walkin-fixture';export async function getSupabaseCashierOrderSetup(){return fixture.setup}export async function createSupabaseCashierOrder(body){fixture.requests.push(body);return {order:{id:'saved',isWalkIn:true,tableSessionId:'saved-visit',grandTotal:9}}}export function updateSupabaseMenuFlags(){}export async function getTableVisits(){return[]}",
    })
    const page = () => runtime.render(h.NewOrder)
    page(); runtime.effects(); await flush()
    assert.ok(findElement(page(), (node) => node.type === 'option' && node.props.value === 'walk-in'))
    h.fixture.setup.walkInEnabled = false
    assert.equal(findElement(page(), (node) => node.type === 'option' && node.props.value === 'walk-in')?.props.disabled, true, 'A restored selection must not become a selectable walk-in on an older database')
    h.fixture.setup.walkInEnabled = true
    findElement(page(), (node) => node.props?.['aria-label'] === 'Add one Test rice').props.onClick()
    await findElement(page(), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
    assert.equal(h.fixture.requests[0].isWalkIn, true)
    assert.equal(h.fixture.requests[0].tableId, null)
    assert.equal(h.fixture.requests[0].expectedTableSessionId, null)
    assert.ok(findElement(page(), (node) => node.props?.state?.orderId === 'saved'))
  } finally { runtime.cleanup(); globalThis.window = previous }
})

test('real API service preserves the explicit walk-in flag and original idempotency key', async () => {
  const runtime = hookRuntime()
  const module = await bundleHarness(`import {createSupabaseCashierOrder} from './src/services/adminApiService';import {fixture} from 'walkin-fixture';export {createSupabaseCashierOrder,fixture}`, runtime, {
    'walkin-fixture': 'export const fixture={}',
    supabaseAuthService: "import {fixture} from 'walkin-fixture';export async function authenticatedApiRequest(path,options){fixture.path=path;fixture.options=options;return {}}",
  })
  const key = crypto.randomUUID()
  await module.createSupabaseCashierOrder({ isWalkIn: true, tableId: null, expectedTableSessionId: null, items: [], requestId: key })
  assert.equal(module.fixture.options.body.isWalkIn, true)
  assert.equal(module.fixture.options.body.tableId, null)
  assert.equal(module.fixture.options.headers['Idempotency-Key'], key)
})

test('kitchen and receipt printer payloads label no-table bills as walk-in', () => {
  const ticket = buildKitchenTicket({ isWalkIn: true, tableNumber: null, orderNumber: 'TEST-1', status: 'received', createdAt: new Date().toISOString(), orderType: 'take_away', items: [{ name: '饭', kitchenName: '饭', quantity: 1 }] })
  assert.ok(ticket.rows.some((row) => row.left === 'Walk-in'))
  const receipt = buildAndroidReceipt({ isWalkIn: true, tableNumber: null, receiptNumber: 'R-TEST', paidAt: new Date().toISOString(), grandTotal: 9, paymentMethod: 'Cash', orders: [{ subtotal: 9, grandTotal: 9, orderType: 'take_away', items: [{ name: '饭', price: 9, quantity: 1 }] }] })
  assert.ok(receipt.rows.some((row) => row.left === 'Walk-in'))
  assert.ok(!receipt.rows.some((row) => row.left === 'TABLE —'))
})
