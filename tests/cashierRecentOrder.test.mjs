import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canEditRecentOrder, currentRecentOrderTable, recentOrderPayment } from '../src/utils/cashierRecentOrder.js'
import { hookRuntime, bundleHarness, findElement, flush } from './helpers/hookHarness.mjs'

const order = { id: 'order-1', orderNumber: 'D001', version: 3, tableId: 'T1', tableSessionId: 'visit-1', tableSessionStatus: 'active', status: 'received', paymentStatus: 'pending', items: [{ id: 'item-1', name: 'Rice', quantity: 1, price: 9, paidQuantity: 0, fulfilledQuantity: 0 }] }
const floor = { floorTables: [{ id: 'T1', tableNumber: 1, tableSessionId: 'visit-1' }], paymentTables: [{ tableNumber: '1', orders: [order] }], error: '', isLoading: false }

test('recent-order payment and editing never attach old orders to a later visit at the same table', () => {
  assert.equal(recentOrderPayment(order, floor), floor.paymentTables[0])
  assert.equal(canEditRecentOrder(order, floor, 'cashier'), true)
  for (const badFloor of [
    { ...floor, error: 'offline' }, { ...floor, isLoading: true },
    { ...floor, floorTables: [{ id: 'T1', tableNumber: 1, tableSessionId: 'visit-2' }] },
  ]) {
    assert.equal(currentRecentOrderTable(order, badFloor), null)
    assert.equal(recentOrderPayment(order, badFloor), null)
    assert.equal(canEditRecentOrder(order, badFloor, 'admin'), false)
  }
  assert.equal(recentOrderPayment(order, { ...floor, paymentTables: [{ orders: [{ ...order, tableSessionId: 'visit-2' }] }] }), null)
  assert.equal(recentOrderPayment(order, { ...floor, paymentTables: [{ orders: [{ ...order, id: 'other-order' }] }] }), null)
  assert.equal(recentOrderPayment({ ...order, paymentStatus: 'paid' }, floor), null)
  assert.equal(canEditRecentOrder({ ...order, status: 'preparing' }, floor, 'cashier'), false)
  assert.equal(canEditRecentOrder({ ...order, status: 'preparing' }, floor, 'admin'), true)
  assert.equal(canEditRecentOrder({ ...order, items: [{ ...order.items[0], paidQuantity: 1 }] }, floor, 'admin'), false)
  assert.equal(canEditRecentOrder({ ...order, items: [{ ...order.items[0], fulfilledQuantity: 1 }] }, floor, 'admin'), false)
})

function button(tree, text) { return findElement(tree, (node) => node.props?.onClick && node.props.children === text) }
async function drawerHarness() {
  const runtime = hookRuntime()
  const module = await bundleHarness(`export {default as Drawer} from './src/components/cashier/RecentOrderDrawer.jsx';export {default as Discount} from './src/components/cashier/RecentOrderDiscount.jsx';export {recentOrderDiscountPreview as discountPreview} from './src/utils/recentOrderDiscount.js';export {fixture} from 'drawer-fixture'`, runtime, {
    'drawer-fixture': `export const fixture={order:${JSON.stringify(order)},posts:[],paused:false,actor:'cashier-A',role:'admin',fail:false}`,
    useCustomerLanguage: 'export default ()=>({t:(s)=>s,formatDate:String})',
    useAdminAuth: "import {fixture} from 'drawer-fixture';export default ()=>({authUser:{id:fixture.actor,role:fixture.role}})",
    useOrderDetails: "import {fixture} from 'drawer-fixture';export default (id,paused)=>{fixture.paused=paused;return {order:fixture.order,isLoading:false,error:'',refresh:()=>{}}}",
    SideDrawer: 'export default function SideDrawer(){return null}',
    AssignWalkInTable: 'export default function AssignWalkInTable(){return null}',
    KitchenTicketDialog: 'export default function KitchenTicketDialog(){return null}',
    adminApiService: "import {fixture} from 'drawer-fixture';export async function changeSupabaseOrder(id,body){fixture.posts.push({id,body});if(fixture.fail)throw new Error('The order changed in another window. Reload before editing.');await new Promise(resolve=>{fixture.finish=resolve})}export const getOrderIdentifiers=async()=>({});export const saveOrderIdentifiers=async()=>({})",
  })
  return { ...module, runtime, view: (props = {}) => runtime.render(module.Drawer, { orderId: order.id, floor, onClose() {}, onPay() {}, ...props }) }
}

test('inline editor pauses polling, keeps the version/reason, and prevents duplicate saves', async () => {
  const h = await drawerHarness()
  try {
    const view = h.view()
    const content = findElement(view, (node) => node.type?.name === 'OrderDetailsPanelContent')
    button(content.props.actions, 'Edit order').props.onClick()
    let editing = h.view()
    assert.equal(h.fixture.paused, true)
    findElement(editing, (node) => node.type === 'textarea' && node.props.required).props.onChange({ target: { value: 'Customer changed quantity' } })
    findElement(editing, (node) => node.type === 'input' && node.props.type === 'number').props.onChange({ target: { value: '2' } })
    editing = h.view()
    const form = findElement(editing, (node) => node.type === 'form')
    const first = form.props.onSubmit({ preventDefault() {} })
    const second = form.props.onSubmit({ preventDefault() {} })
    assert.equal(h.fixture.posts.length, 1)
    assert.equal(h.fixture.posts[0].body.expectedVersion, 3)
    assert.equal(h.fixture.posts[0].body.reason, 'Customer changed quantity')
    assert.equal(h.fixture.posts[0].body.items[0].quantity, 2)
    h.fixture.finish(); await Promise.all([first, second])
    assert.equal(findElement(h.view(), (node) => node.type === 'form'), null)
    assert.equal(h.fixture.paused, false)
  } finally { h.runtime.cleanup() }
})

test('inline editing keeps conflict errors visible and blocks saving after the current visit changes', async () => {
  const h = await drawerHarness()
  try {
    button(findElement(h.view(), (node) => node.type?.name === 'OrderDetailsPanelContent').props.actions, 'Edit order').props.onClick()
    findElement(h.view(), (node) => node.type === 'textarea' && node.props.required).props.onChange({ target: { value: 'Test change' } })
    h.fixture.fail = true
    await findElement(h.view(), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
    assert.ok(findElement(h.view(), (node) => node.props?.role === 'alert'))
    const changed = { ...floor, floorTables: [{ id: 'T1', tableSessionId: 'new-visit' }] }
    await findElement(h.view({ floor: changed }), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
    assert.equal(h.fixture.posts.length, 1)
  } finally { h.runtime.cleanup() }
})

test('pausing the actual detail hook ignores late reads and resumes with a fresh server read', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as useDetails} from './src/hooks/useOrderDetails.js';export {fixture} from 'hook-fixture'`, runtime, {
    'hook-fixture': 'export const fixture={reads:0,resolvers:[]}',
    adminApiService: "import {fixture} from 'hook-fixture';export function getSupabaseOrderDetails(){fixture.reads++;return new Promise(resolve=>fixture.resolvers.push(resolve))}",
  })
  let paused = false
  function Hook() { return h.useDetails('order-1', paused) }
  try {
    runtime.render(Hook); runtime.effects(); await flush()
    paused = true; runtime.render(Hook); runtime.effects()
    h.fixture.resolvers.shift()({ id: 'order-1', version: 1 }); await flush()
    assert.equal(runtime.render(Hook).order, null)
    paused = false; runtime.render(Hook); runtime.effects(); await flush()
    h.fixture.resolvers.shift()({ id: 'order-1', version: 2 }); await flush()
    assert.equal(runtime.render(Hook).order.version, 2)
    assert.equal(h.fixture.reads, 2)
  } finally { runtime.cleanup() }
})

test('voiding needs an explicit reason and confirmation, sends only this order once, and keeps its version', async () => {
  const h = await drawerHarness()
  try {
    const actions = findElement(h.view(), (node) => node.type?.name === 'OrderDetailsPanelContent').props.actions
    const more = findElement(actions, (node) => node.type === 'details')
    assert.equal(more.props.open, undefined, 'more actions start collapsed')
    button(more, 'Void order').props.onClick()
    assert.equal(h.fixture.posts.length, 0, 'opening confirmation does not mutate the order')
    let form = findElement(h.view(), (node) => node.type === 'form')
    await form.props.onSubmit({ preventDefault() {} })
    assert.equal(h.fixture.posts.length, 0, 'a reason is required')
    findElement(form, (node) => node.type === 'textarea').props.onChange({ target: { value: 'Customer cancelled' } })
    form = findElement(h.view(), (node) => node.type === 'form')
    assert.equal(h.fixture.paused, true)
    const pending = form.props.onSubmit({ preventDefault() {} })
    await form.props.onSubmit({ preventDefault() {} })
    assert.deepEqual(h.fixture.posts, [{ id: 'order-1', body: { expectedVersion: 3, reason: 'Customer cancelled', items: [{ id: 'item-1', quantity: 0, notes: '' }] } }])
    h.fixture.finish(); await pending
    assert.equal(findElement(h.view(), (node) => node.type === 'form'), null)
    assert.equal(h.fixture.paused, false)
  } finally { h.runtime.cleanup() }
})

test('void remains unavailable for paid/handed-over orders and ordinary cashiers after preparation starts', async () => {
  const h = await drawerHarness()
  try {
    for (const change of [{ paymentStatus: 'paid' }, { items: [{ ...order.items[0], fulfilledQuantity: 1 }] }, { status: 'cancelled' }]) {
      h.fixture.order = { ...order, ...change }
      assert.equal(button(h.view(), 'Void order'), null)
    }
    h.fixture.role = 'cashier'; h.fixture.order = { ...order, status: 'preparing' }
    assert.equal(button(h.view(), 'Void order'), null)
    h.fixture.role = 'admin'; h.fixture.order = order
    button(findElement(h.view(), (node) => node.type?.name === 'OrderDetailsPanelContent').props.actions, 'Void order').props.onClick()
    findElement(h.view(), (node) => node.type === 'textarea').props.onChange({ target: { value: 'Test reason' } })
    const changedFloor = { ...floor, floorTables: [{ id: 'T1', tableSessionId: 'new-visit' }] }
    await findElement(h.view({ floor: changedFloor }), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
    assert.equal(h.fixture.posts.length, 0)
  } finally { h.runtime.cleanup() }
})

test('discount uses only remaining table items, recalculates charges and passes a draft to payment without writing', async () => {
  const h = await drawerHarness()
  try {
    const first = { ...order, serviceChargeRate: 10, sstRate: 6, items: [{ ...order.items[0], quantity: 2, paidQuantity: 1, price: 10 }] }
    const second = { ...first, id: 'order-2', serviceChargeRate: 0, sstRate: 0, items: [{ ...first.items[0], id: 'item-2', quantity: 1, paidQuantity: 0 }] }
    const data = { ...floor, paymentTables: [{ tableNumber: '1', orders: [first, second] }] }
    const preview = h.discountPreview(first, data, { type: 'fixed', value: '5' })
    assert.equal(preview.original.subtotal, 20)
    assert.equal(preview.preview.amount, 5)
    assert.equal(preview.discounted.grandTotal, 16.2)
    assert.throws(() => h.discountPreview(first, data, { type: 'fixed', value: '21' }))
    assert.throws(() => h.discountPreview(first, data, { type: 'percentage', value: '101' }))
    const passed = []
    const props = { order: first, floor: data, onContinue: (...args) => passed.push(args), onCancel() {} }
    let form = h.runtime.render(h.Discount, props)
    findElement(form, (node) => node.type?.name === 'DiscountControl').props.onChange({ type: 'fixed', value: '5' })
    form = h.runtime.render(h.Discount, props)
    form.props.onSubmit({ preventDefault() {} })
    assert.deepEqual(passed, [[data.paymentTables[0], { discount: { type: 'fixed', value: '5' } }]])
    assert.equal(h.fixture.posts.length, 0)
    const stale = h.runtime.render(h.Discount, { ...props, floor: { ...data, error: 'offline' } })
    stale.props.onSubmit({ preventDefault() {} })
    assert.equal(passed.length, 1, 'stale data cannot start payment with the discount')
  } finally { h.runtime.cleanup() }
})
