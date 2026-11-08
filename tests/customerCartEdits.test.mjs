import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editCartRow, cartItemFingerprint } from '../src/utils/cartItemEdit.js'
import { cartLineId } from '../src/utils/cartOrderType.js'
import { customerOrderFingerprint } from '../src/utils/customerVisitStorage.js'
import { bundleHarness, hookRuntime, memoryStorage, findElement, flush } from './helpers/hookHarness.mjs'

const session = { sessionId: '66b195a3-18e0-4f2d-a337-42797a0ba97f', tableSessionId: 'a98b5086-dff8-4aca-b8a7-f42459604745', tableNumber: '1', customerNickname: 'Guest', isSharedTable: true }
const next = { ...session, sessionId: '91d5ac84-8243-4caf-8672-180964979c59', tableSessionId: '5cf5273f-02fb-49d1-a40e-00a85648b5fa', tableNumber: '2' }
const food = { id: 'rice', name: 'Rice', price: 9, isAvailable: true, optionGroups: [] }
const configurable = { ...food, optionGroups: [{ id: 'size', name: 'Size', min: 1, max: 1, options: [{ id: 'large', label: 'Large', price: 2, isAvailable: true }] }] }
const values = { quantity: 2, specialInstructions: ' No onion ', selections: [{ groupId: 'size', optionIds: ['large'] }], orderType: 'take_away' }
function row(overrides = {}) {
  const item = { menuItemId: 'rice', name: 'Rice', cartRowId: 'stable-row', quantity: 1, unitPrice: 9, orderType: 'dine_in', specialInstructions: '', selections: [], ...overrides }
  return { ...item, cartItemId: cartLineId(item.menuItemId, item.specialInstructions, item.selections, item.orderType) }
}

test('editing atomically replaces the exact row using current options/price, keeping order and row identity', () => {
  const source = row(), other = row({ menuItemId: 'tea', cartRowId: 'tea' }), items = [source, other]
  const result = editCartRow(items, source.cartRowId, cartItemFingerprint(source), configurable, values)
  assert.equal(result.length, 2)
  assert.equal(result[0].cartRowId, 'stable-row')
  assert.equal(result[0].quantity, 2)
  assert.equal(result[0].unitPrice, 11)
  assert.equal(result[0].orderType, 'take_away')
  assert.equal(result[0].specialInstructions, 'No onion')
  assert.equal(result[1], other)
  assert.equal(source.quantity, 1)
  assert.equal(source.specialInstructions, '')
})

test('editing into an existing variant merges portions at the target position without duplicating food', () => {
  const source = row(), tea = row({ menuItemId: 'tea', cartRowId: 'tea' }), target = row({ cartRowId: 'target', orderType: 'take_away', quantity: 3 })
  const result = editCartRow([source, tea, target], source.cartRowId, cartItemFingerprint(source), food, { quantity: 2, orderType: 'take_away' })
  assert.deepEqual(result.map(item => item.cartRowId), ['tea', 'target'])
  assert.equal(result[1].quantity, 5)
  assert.throws(() => editCartRow([source, { ...target, quantity: 49 }], source.cartRowId, cartItemFingerprint(source), food, { quantity: 2, orderType: 'take_away' }), /50 items/)
})

test('stale rows, invalid quantities, sold-out food and unavailable/required options reject without mutation', () => {
  const source = row(), expected = cartItemFingerprint(source), items = [source]
  for (const [menu, edits, fingerprint] of [
    [food, { quantity: 0, orderType: 'dine_in' }, expected],
    [{ ...food, isAvailable: false }, { quantity: 1, orderType: 'dine_in' }, expected],
    [configurable, { quantity: 1, orderType: 'dine_in' }, expected],
    [{ ...configurable, optionGroups: [{ ...configurable.optionGroups[0], options: [{ ...configurable.optionGroups[0].options[0], isAvailable: false }] }] }, values, expected],
    [food, { quantity: 1, orderType: 'dine_in' }, 'obsolete'],
  ]) assert.throws(() => editCartRow(items, source.cartRowId, fingerprint, menu, edits))
  assert.deepEqual(items, [row()])
})

async function withCart(run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window'), native = memoryStorage(), runtime = hookRuntime()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { sessionStorage: native } })
  try {
    const h = await bundleHarness(`export {default as Provider} from './src/context/CartProvider.jsx';export {default as Cart} from './src/pages/customer/Cart.jsx';export {customerVisitStorage} from './src/utils/customerVisitStorage.js';export {fixture} from 'edit-fixture'`, runtime, {
      'edit-fixture': 'export const fixture={session:null,cart:null,menu:[],toasts:[],navigation:[]}',
      useCustomerSession: 'import {fixture} from "edit-fixture";export default ()=>({session:fixture.session})',
      useCart: 'import {fixture} from "edit-fixture";export default ()=>fixture.cart',
      useCustomerLanguage: 'export default ()=>({t:text=>text})',
      useCustomerToast: 'import {fixture} from "edit-fixture";export default ()=>({showToast:(...args)=>fixture.toasts.push(args)})',
      useShopSettings: 'export default ()=>({config:{serviceChargeRate:0,sstRate:0},settings:{revision:1,isAcceptingOrders:true},isLoading:false,error:""})',
      customerApi: 'import {fixture} from "edit-fixture";export async function getPublicMenu(){return fixture.menu} export async function placeCustomerOrder(){throw new Error("No real orders")} export async function cancelCustomerOrder(){throw new Error("No real cancellations")} export async function getCustomerOrders(){return []}',
    })
    h.fixture.session = session; h.fixture.menu = [food]; h.customerVisitStorage.saveSession(session)
    const cart = () => (h.fixture.cart = runtime.render(h.Provider).props.value)
    await run({ ...h, cart, runtime })
  } finally { runtime.cleanup(); if (previous) Object.defineProperty(globalThis, 'window', previous); else delete globalThis.window }
}

test('real cart edits persist immediately; stale saves fail; uncertain submissions freeze edit/remove/undo/clear', () => withCart(async h => {
  h.cart().addToCart(food)
  const original = h.cart().cartItems[0]
  assert.equal(h.cart().editCartItem(original.cartRowId, cartItemFingerprint(original), configurable, values), true)
  const updated = h.cart().cartItems[0]
  assert.equal(updated.quantity, 2)
  assert.equal(h.customerVisitStorage.readDraft(session).items[0].orderType, 'take_away')
  assert.equal(h.cart().editCartItem(original.cartRowId, cartItemFingerprint(original), food, { quantity: 1, orderType: 'dine_in' }), false)
  const id = h.cart().prepareOrderRequest(3)
  assert.equal(h.cart().editCartItem(updated.cartRowId, cartItemFingerprint(updated), configurable, values), false)
  assert.equal(h.cart().removeWithUndo(updated.cartItemId), null)
  assert.equal(h.cart().undoRemoval('old'), false)
  assert.equal(h.cart().clearCart(customerOrderFingerprint([updated], session)), false)
  assert.equal(h.cart().prepareOrderRequest(9), id)
  assert.equal(h.cart().cartItemCount, 2)
}))

test('undo restores even the last removed item exactly once and preserves its original position', () => withCart(async h => {
  h.cart().addToCart(food); h.cart().addToCart({ ...food, id: 'tea', name: 'Tea' })
  const before = h.cart().cartItems
  const token = h.cart().removeWithUndo(before[0].cartItemId)
  assert.equal(h.cart().cartItemCount, 1)
  assert.equal(h.cart().undoRemoval(token), true)
  assert.deepEqual(h.cart().cartItems, before)
  assert.equal(h.cart().undoRemoval(token), false)
  h.cart().clearCart()
  h.cart().addToCart(food)
  const last = h.cart().cartItems[0], finalToken = h.cart().removeWithUndo(last.cartItemId)
  assert.equal(h.cart().cartItemCount, 0)
  assert.equal(h.cart().undoRemoval(finalToken), true)
  assert.equal(h.cart().cartItems[0].cartRowId, last.cartRowId)
}))

test('later mutations, expiry and table switches invalidate undo without overwriting the latest draft', () => withCart(async h => {
  h.cart().addToCart(food); h.cart().addToCart({ ...food, id: 'tea', name: 'Tea' })
  let token = h.cart().removeWithUndo(h.cart().cartItems[0].cartItemId)
  h.cart().updateQuantity(h.cart().cartItems[0].cartItemId, 3)
  assert.equal(h.cart().undoRemoval(token), false)
  assert.equal(h.cart().cartItemCount, 3)
  token = h.cart().removeWithUndo(h.cart().cartItems[0].cartItemId)
  const now = Date.now
  try { Date.now = () => now() + 9000; assert.equal(h.cart().undoRemoval(token), false) } finally { Date.now = now }
  h.cart().addToCart(food)
  const oldCart = h.cart(), oldRow = oldCart.cartItems[0]
  token = oldCart.removeWithUndo(oldRow.cartItemId)
  h.customerVisitStorage.saveSession(next); h.fixture.session = next
  h.cart().addToCart(food, 2)
  assert.equal(oldCart.undoRemoval(token), false)
  assert.equal(oldCart.editCartItem(oldRow.cartRowId, cartItemFingerprint(oldRow), food, { quantity: 3, orderType: 'dine_in' }), false)
  assert.equal(h.cart().cartItemCount, 2)
  assert.equal(h.customerVisitStorage.readDraft(next).items[0].quantity, 2)
}))

test('clear cart waits for confirmation, cancel is harmless, and a changed draft cannot be silently cleared', () => withCart(async h => {
  h.cart().addToCart(food); h.cart()
  const page = () => h.runtime.render(h.Cart)
  page(); h.runtime.effects(); await flush()
  const open = () => findElement(page(), node => node.type === 'button' && node.props.children === 'Clear cart').props.onClick()
  const prompt = () => findElement(page(), node => node.type?.name === 'ConfirmationDialog')
  open(); assert.equal(h.cart().cartItemCount, 1); prompt().props.onCancel(); assert.equal(prompt(), null)
  open(); const obsolete = prompt().props.onConfirm
  h.cart().updateQuantity(h.cart().cartItems[0].cartItemId, 2); h.cart(); obsolete()
  assert.equal(h.cart().cartItemCount, 2)
  open(); prompt().props.onConfirm()
  assert.equal(h.cart().cartItemCount, 0)
}))

test('toast dismisses the undo message before action so a failure toast remains visible', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as View} from './src/components/common/ToastViewport.jsx';export {fixture} from 'toast-fixture'`, runtime, {
    'toast-fixture': 'export const fixture={toast:{message:"removed",action:{label:"Undo",onClick:()=>{fixture.toast={message:"expired"}}}}}',
    useCustomerLanguage: 'export default ()=>({t:text=>text})',
    useToast: 'import {fixture} from "toast-fixture";export default ()=>({toast:fixture.toast,dismissToast:()=>{fixture.toast=null}})',
  })
  findElement(runtime.render(h.View), node => node.type === 'button' && node.props.children === 'Undo').props.onClick()
  assert.equal(h.fixture.toast.message, 'expired')
})

test('real editor resets removed/unavailable options, refuses stale saves and updates through the exact-row callback', async () => {
  const runtime = hookRuntime(), previous = Object.getOwnPropertyDescriptor(globalThis, 'document'), calls = []
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: {} } })
  try {
    const h = await bundleHarness(`export {default as Editor} from './src/components/customer/CartItemEditor.jsx'`, runtime, {
      'react-dom': 'export const createPortal=children=>children',
      useCustomerLanguage: 'export default ()=>({t:text=>text})',
    })
    const item = row({ selections: [{ groupId: 'removed', optionIds: ['old'] }] })
    const props = { item, currentItem: item, food, onSave: value => { calls.push(value); return '' }, onClose() {} }
    const view = updates => runtime.render(h.Editor, { ...props, ...updates })
    const save = updates => findElement(view(updates), node => node.type?.name === 'Button' && node.props.children === 'Save changes')
    assert.equal(save().props.disabled, true)
    findElement(view(), node => node.type === 'button' && node.props.children === 'Reset options').props.onClick()
    assert.equal(save().props.disabled, false)
    save().props.onClick()
    assert.deepEqual(calls[0].selections, [])
    assert.equal(save({ currentItem: { ...item, quantity: 2 } }).props.disabled, true)
    save({ currentItem: { ...item, quantity: 2 } }).props.onClick()
    assert.equal(calls.length, 1)
    assert.equal(save({ locked: true }).props.disabled, true)
  } finally { if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document }
})
