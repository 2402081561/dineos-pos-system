import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hookRuntime, bundleHarness, findElement, flush } from './helpers/hookHarness.mjs'

const session = { sessionId: '66b195a3-18e0-4f2d-a337-42797a0ba97f', tableSessionId: 'a98b5086-dff8-4aca-b8a7-f42459604745', tableNumber: '1', customerNickname: 'Guest', isSharedTable: true }
const ticket = { id: 'ticket-A', orderNumber: 'A001', tableNumber: 1, status: 'received', paymentStatus: 'pending', grandTotal: 9, subtotal: 9, orderType: 'dine_in', createdAt: '2026-10-12T01:00:00Z', items: [{ id: 'item-1', name: 'Test rice', price: 9, quantity: 1, fulfilledQuantity: 0 }] }
const mocks = {
  'live-fixture': 'export const fixture={session:null,restoring:false,orders:[],readOrders:async()=>fixture.orders,readKitchen:async()=>[],api:async()=>{throw new Error("No real API allowed")},nicknameRequests:0,navigation:[]}',
  useCustomerSession: 'import {fixture} from "live-fixture";export default ()=>({session:fixture.session,isRestoring:fixture.restoring})',
  useCustomerLanguage: 'export default ()=>({t:(text)=>text,formatDate:()=>"test-date",statusLabel:text=>text})',
  useCustomerToast: 'export default ()=>({showToast(){}})',
  useCart: 'export default ()=>({addToCart:()=>true,isCartLocked:false})',
  customerApi: 'import {fixture} from "live-fixture";export const getCustomerOrders=()=>fixture.readOrders();export async function getPublicMenu(){return []} export async function getCustomerSession(){return fixture.session} export async function updateCustomerNickname(id,name){fixture.nicknameRequests++;return {...fixture.session,customerNickname:name}} export async function leaveCustomerSession(){} export async function joinCustomerTable(){throw new Error("No joining allowed")}export async function cancelCustomerOrder(){throw new Error("No cancellation allowed")}export async function placeCustomerOrder(){throw new Error("No orders allowed")}',
  supabaseAuthService: 'import {fixture} from "live-fixture";export const authenticatedApiRequest=(...args)=>fixture.api(...args)',
  adminApiService: 'import {fixture} from "live-fixture";export const getSupabaseKitchenOrders=()=>fixture.readKitchen();export function subscribeToSupabaseSettlement(data,error){fixture.closingData=data;fixture.closingError=error;return()=>{fixture.closingData=null;fixture.closingError=null}}',
}
async function harness() {
  const runtime = hookRuntime()
  const module = await bundleHarness(`
    import useLatestOrder from './src/hooks/useLatestOrder.js'; import useShiftClosing from './src/hooks/useShiftClosing.js'; import useKitchenOrders from './src/hooks/useKitchenOrders.js';
    import CustomerSessionProvider from './src/context/CustomerSessionProvider.jsx'; import OrderHistory from './src/pages/customer/OrderHistory.jsx'; import Tracking from './src/pages/customer/Tracking.jsx';
    import QuantitySelector from './src/components/customer/QuantitySelector.jsx'; import HandoffQueue from './src/components/staff/HandoffQueue.jsx'; import {fixture} from 'live-fixture';
    export {useLatestOrder,useShiftClosing,useKitchenOrders,CustomerSessionProvider,OrderHistory,Tracking,QuantitySelector,HandoffQueue,fixture};
  `, runtime, mocks)
  module.fixture.session = session
  return { ...module, runtime }
}
function fakeClock() {
  const timers = new Map(); let id = 0
  const previousSet = globalThis.setTimeout, previousClear = globalThis.clearTimeout
  globalThis.setTimeout = (callback) => { timers.set(++id, callback); return id }
  globalThis.clearTimeout = (key) => timers.delete(key)
  return { tick() { const [key, callback] = timers.entries().next().value ?? []; timers.delete(key); return callback?.() }, restore() { globalThis.setTimeout = previousSet; globalThis.clearTimeout = previousClear } }
}

test('real member provider accepts unchanged long names up to 80, validates new names and rejects 81', async () => {
  const h = await harness()
  let value = h.runtime.render(h.CustomerSessionProvider).props.value
  const name = 'Abdul Rahman Bin Muhammad Ismail'
  value.startSession('1', name, session.tableSessionId, session.sessionId, session.sessionId, false)
  value = h.runtime.render(h.CustomerSessionProvider).props.value
  assert.equal((await value.updateSessionNickname(name)).customerNickname, name)
  assert.equal(h.fixture.nicknameRequests, 0)
  assert.equal((await value.updateSessionNickname('N'.repeat(80))).customerNickname.length, 80)
  assert.equal(h.fixture.nicknameRequests, 1)
  await assert.rejects(value.updateSessionNickname('N'.repeat(81)), /80 characters/)
})

test('quantity controls disable increase at the maximum, not merely clamp the callback', async () => {
  const h = await harness()
  const increase = (quantity) => findElement(h.runtime.render(h.QuantitySelector, { quantity, onIncrease() {}, onDecrease() {} }), (node) => node.props?.['aria-label'] === 'Increase quantity')
  assert.equal(increase(49).props.disabled, false)
  assert.equal(increase(50).props.disabled, true)
})

test('tracking masks the old visit immediately on clear, table change, and restoration before effects run', async () => {
  const h = await harness()
  try {
    h.fixture.orders = [ticket]
    h.runtime.render(h.useLatestOrder); h.runtime.effects(); await flush()
    assert.equal(h.runtime.render(h.useLatestOrder).order.id, ticket.id)
    h.fixture.session = null
    assert.equal(h.runtime.render(h.useLatestOrder).order, null)
    h.fixture.session = { ...session, sessionId: '91d5ac84-8243-4caf-8672-180964979c59' }
    const next = h.runtime.render(h.useLatestOrder)
    assert.equal(next.order, null); assert.equal(next.isLoading, true)
    h.fixture.orders = [{ ...ticket, id: 'ticket-B' }]
    h.runtime.effects(); await flush()
    assert.equal(h.runtime.render(h.useLatestOrder).order.id, 'ticket-B')
    h.fixture.restoring = true
    assert.equal(h.runtime.render(h.useLatestOrder).order, null)
  } finally { h.runtime.cleanup() }
})

for (const pageName of ['OrderHistory', 'Tracking']) test(`open ${pageName} detail follows live payment/handoff updates and disappears if removed`, async () => {
  const h = await harness(), clock = fakeClock()
  try {
    h.fixture.orders = [ticket]
    h.runtime.render(h[pageName]); h.runtime.effects(); await flush()
    const page = h.runtime.render(h[pageName])
    const button = findElement(page, (node) => node.props?.children === (pageName === 'Tracking' ? 'View Order Details' : 'View details'))
    assert.ok(button, 'Details action exists')
    button.props.onClick()
    const selected = () => findElement(h.runtime.render(h[pageName]), (node) => node.type?.name === 'CustomerOrderDetailsModal')
    assert.equal(selected().props.order.paymentStatus, 'pending')
    h.fixture.orders = [{ ...ticket, status: 'ready', paymentStatus: 'paid', paidAmount: 9 }]
    await clock.tick(); await flush()
    assert.equal(selected().props.order.status, 'ready')
    assert.equal(selected().props.order.paymentStatus, 'paid')
    h.fixture.orders = []
    await clock.tick(); await flush()
    assert.equal(selected(), null)
  } finally { h.runtime.cleanup(); clock.restore() }
})

test('settlement clears a transient offline error after a successful snapshot', async () => {
  const h = await harness()
  try {
    h.runtime.render(h.useShiftClosing); h.runtime.effects()
    h.fixture.closingError(new Error('test offline'))
    assert.ok(h.runtime.render(h.useShiftClosing).error)
    h.fixture.closingData({ paidPayments: [{ amount: 9, paymentMethod: 'Cash' }], todayOrders: [], closings: [] })
    const recovered = h.runtime.render(h.useShiftClosing)
    assert.equal(recovered.error, '')
    assert.equal(recovered.summary.grandTotal, 9)
  } finally { h.runtime.cleanup() }
})

test('handoff serializes polling and double clicks; pre-mutation reads cannot restore served items', async () => {
  const h = await harness(), clock = fakeClock(), calls = []
  h.fixture.api = (url, options = {}) => new Promise((resolve) => calls.push({ url, ...options, resolve }))
  const ready = { ...ticket, tableId: 'table-1', version: 2 }
  try {
    h.runtime.render(h.HandoffQueue); h.runtime.effects(); await flush()
    calls[0].resolve({ orders: [ready] }); await flush()
    void clock.tick(); await flush() // old automatic read begins before handoff
    const button = findElement(h.runtime.render(h.HandoffQueue), (node) => node.props?.children === 'Mark served')
    assert.ok(button)
    button.props.onClick(); button.props.onClick()
    assert.equal(calls.filter((call) => call.method === 'PATCH').length, 1)
    assert.equal(calls[2].body.expectedVersion, 2)
    calls[2].resolve({}); await flush()
    // The stale response is ignored; a new serialized read confirms the write.
    calls[1].resolve({ orders: [ready] }); await flush()
    assert.equal(calls.length, 4)
    calls[3].resolve({ orders: [] }); await flush()
    assert.equal(findElement(h.runtime.render(h.HandoffQueue), (node) => node.props?.children === 'Mark served'), null)
  } finally { h.runtime.cleanup(); clock.restore() }
})

test('kitchen manual refresh invalidates old polls and shares the same serialized reader', async () => {
  const h = await harness(), clock = fakeClock(), reads = []
  h.fixture.readKitchen = () => new Promise((resolve) => reads.push(resolve))
  try {
    h.runtime.render(h.useKitchenOrders); h.runtime.effects(); await flush()
    reads[0]([ticket]); await flush()
    void clock.tick(); await flush()
    const refreshed = h.runtime.render(h.useKitchenOrders).refresh()
    reads[1]([{ ...ticket, status: 'received' }]); await flush()
    assert.equal(reads.length, 3)
    reads[2]([{ ...ticket, status: 'ready' }]); await refreshed
    assert.equal(h.runtime.render(h.useKitchenOrders).orders[0].status, 'ready')
  } finally { h.runtime.cleanup(); clock.restore() }
})
