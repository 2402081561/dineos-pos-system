import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hookRuntime, bundleHarness, findElement, memoryStorage, flush } from './helpers/hookHarness.mjs'
import { isDefinitiveOrderRejection } from '../src/utils/orderSubmission.js'

const session = { sessionId: '66b195a3-18e0-4f2d-a337-42797a0ba97f', tableSessionId: 'a98b5086-dff8-4aca-b8a7-f42459604745', tableNumber: '1', customerNickname: 'Shared Table', isSharedTable: true }
const food = { id: 'test-rice', name: 'Test rice', price: 9, isAvailable: true, optionGroups: [] }
const mocks = {
  'safety-fixture': 'export const fixture={session:null,cart:null,menu:[],shop:{config:{serviceChargeRate:0,sstRate:0},settings:{revision:1,isAcceptingOrders:true},isLoading:false,error:""},navigation:[],place:async()=>{throw new Error("No API writes allowed")}}',
  useCustomerSession: 'import {fixture} from "safety-fixture";export default ()=>({session:fixture.session,updateSessionNickname:async()=>fixture.session})',
  useCustomerLanguage: 'export default ()=>({t:(text)=>text,formatDate:()=>"test-date",statusLabel:text=>text})',
  useCustomerToast: 'export default ()=>({showToast(){}})',
  useShopSettings: 'import {fixture} from "safety-fixture";export default ()=>fixture.shop',
  useCart: 'import {fixture} from "safety-fixture";export default ()=>fixture.cart',
  customerApi: 'import {fixture} from "safety-fixture";export async function getPublicMenu(){return fixture.menu} export const placeCustomerOrder=(...args)=>fixture.place(...args);export async function cancelCustomerOrder(){throw new Error("No cancellation allowed")} export async function getCustomerOrders(){return []}',
}
async function harness(native) {
  const runtime = hookRuntime()
  const module = await bundleHarness('import CartProvider from "./src/context/CartProvider.jsx";import Cart from "./src/pages/customer/Cart.jsx";import {customerVisitStorage} from "./src/utils/customerVisitStorage.js";import {fixture} from "safety-fixture";export {CartProvider,Cart,customerVisitStorage,fixture}', runtime, mocks)
  module.fixture.session = session; module.fixture.menu = [food]
  module.customerVisitStorage.saveSession(session)
  const renderCart = () => (module.fixture.cart = runtime.render(module.CartProvider).props.value)
  return { ...module, runtime, renderCart, native }
}
async function withStorage(fn) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window'), native = memoryStorage()
  try { Object.defineProperty(globalThis, 'window', { configurable: true, value: { sessionStorage: native } }); await fn(native) }
  finally { if (previous) Object.defineProperty(globalThis, 'window', previous); else delete globalThis.window }
}

test('real cart rejects overflow without partial additions or falsely reporting success', async () => withStorage(async (native) => {
  const h = await harness(native)
  let cart = h.renderCart()
  assert.equal(cart.addToCart(food, 49), true)
  cart = h.renderCart()
  assert.equal(cart.addToCart(food, 2), false)
  assert.equal(h.renderCart().cartItemCount, 49)
  assert.match(cart.getLastCartError(), /50 items/)
  assert.equal(cart.addToCart(food, 1), true)
  cart = h.renderCart()
  assert.equal(cart.updateQuantity(cart.cartItems[0].cartItemId, 51), false)
  assert.equal(h.renderCart().cartItemCount, 50)
  assert.equal(cart.addToCart(food, 1), false)
  assert.equal(h.customerVisitStorage.readDraft(session).items[0].quantity, 50)
}))

test('pending submissions freeze every mutation and preserve ID/revision through refresh; confirmed rejection unlocks', async () => withStorage(async (native) => {
  const h = await harness(native)
  h.renderCart().addToCart(food, 1)
  let cart = h.renderCart(), row = cart.cartItems[0]
  const first = cart.prepareOrderRequest(4)
  cart = h.renderCart()
  assert.equal(cart.isCartLocked, true)
  assert.equal(cart.updateQuantity(row.cartItemId, 2), false)
  assert.equal(cart.updateQuantity(row.cartItemId, 1), false)
  assert.equal(cart.addToCart(food, 1), false)
  assert.equal(cart.removeFromCart(row.cartItemId), false)
  assert.equal(cart.clearCart(), false)
  assert.match(cart.changeItemOrderType(row.cartItemId, 'take_away'), /not confirmed/)
  assert.equal(cart.prepareOrderRequest(9), first)
  assert.equal(cart.getOrderRequest().settingsRevision, 4)
  const reload = await harness(native)
  cart = reload.renderCart()
  assert.equal(cart.isCartLocked, true)
  assert.equal(cart.prepareOrderRequest(10), first)
  assert.equal(cart.rejectOrderRequest('wrong-request'), false)
  assert.equal(cart.rejectOrderRequest(first), true)
  cart = reload.renderCart()
  assert.equal(cart.updateQuantity(row.cartItemId, 2), true)
  cart = reload.renderCart()
  const next = cart.prepareOrderRequest(10)
  assert.notEqual(next, first)
  assert.equal(cart.completeOrderRequest(next), true)
  assert.equal(reload.renderCart().cartItemCount, 0)
  assert.equal(reload.customerVisitStorage.readDraft(session).orderRequest, null)
}))

test('lost committed response then retry from the real cart page uses original ID and creates exactly one mock order', async () => withStorage(async (native) => {
  const h = await harness(native), records = new Map(), calls = []
  try {
  h.renderCart().addToCart(food, 1); h.renderCart()
  h.fixture.place = async (_sessionId, items, id, revision) => {
    calls.push({ id, revision, items })
    if (!records.has(id)) { records.set(id, { id: 'saved-order' }); throw new TypeError('Response lost after mock commit') }
    return records.get(id)
  }
  h.runtime.render(h.Cart); h.runtime.effects(); await flush()
  let page = h.runtime.render(h.Cart)
  const place = findElement(page, (node) => node.props?.children === 'Place order')
  assert.equal(place.props.disabled, false)
  await place.props.onClick()
  assert.equal(h.renderCart().isCartLocked, true)
  // A later menu/settings failure must not prevent resolving an already-sent ID.
  h.fixture.shop = { ...h.fixture.shop, settings: { revision: 99, isAcceptingOrders: false }, error: 'temporarily unavailable' }
  page = h.runtime.render(h.Cart)
  const retry = findElement(page, (node) => node.props?.children === 'Retry previous order')
  assert.equal(retry.props.disabled, false)
  assert.equal(findElement(page, (node) => node.type === 'button' && node.props?.children === 'Clear cart').props.disabled, true)
  await retry.props.onClick()
  assert.equal(records.size, 1)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].id, calls[1].id)
  assert.equal(calls[1].revision, 1)
  assert.equal(h.renderCart().cartItemCount, 0)
  assert.equal(h.fixture.navigation.at(-1)[0], '/tracking')
  } finally { h.runtime.cleanup() }
}))

test('definite validation failures permit edits; network/timeouts/5xx keep the request locked', () => {
  for (const status of [400, 401, 403, 404, 409, 413, 422]) assert.equal(isDefinitiveOrderRejection({ status }), true)
  for (const error of [new TypeError('Failed to fetch'), { status: 500 }, { status: 503 }, new DOMException('Timeout', 'AbortError')]) assert.equal(isDefinitiveOrderRejection(error), false)
})
