import { cancelCustomerOrder as cancelCustomerOrderRequest, getCustomerOrders, placeCustomerOrder } from './customerApi'
import { resolveOptions } from '../../server/src/posRules'
import { subscribePoll } from '../utils/pollSubscription'

function finiteNonNegative(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function roundMoney(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : Number.NaN
}

export function calculateTableDiscount(subtotal, discount = {}) {
  const safeSubtotal = finiteNonNegative(subtotal)
  if (safeSubtotal === null) throw new Error('The table subtotal is invalid.')
  const type = String(discount?.type ?? 'percentage').toLowerCase()
  const value = Number(discount?.value ?? 0)
  if (!Number.isFinite(value) || value < 0) throw new Error('Enter a valid non-negative discount.')
  if (type === 'percentage') {
    if (value > 100) throw new Error('Percentage discount cannot exceed 100%.')
    const amount = roundMoney(safeSubtotal * (value / 100))
    if (!Number.isFinite(amount)) throw new Error('The discount amount is invalid.')
    return { type, value, amount }
  }
  if (type === 'fixed') {
    if (value > safeSubtotal) throw new Error('Fixed discount cannot exceed the table subtotal.')
    const amount = roundMoney(value)
    if (!Number.isFinite(amount)) throw new Error('The discount amount is invalid.')
    return { type, value: amount, amount }
  }
  throw new Error('Select a valid discount type.')
}

export function isMenuItemOrderable(menuItem) {
  return Boolean(menuItem?.id) && Boolean(String(menuItem.name ?? '').trim()) && menuItem.isAvailable === true && finiteNonNegative(menuItem.price) !== null
}

export function getCartValidationIssues(cartItems, menuItems) {
  const currentMenuById = new Map((Array.isArray(menuItems) ? menuItems : []).map((menuItem) => [menuItem.id, menuItem]))
  return (Array.isArray(cartItems) ? cartItems : []).flatMap((cartItem) => {
    const label = String(cartItem?.name ?? 'This item').trim() || 'This item'
    const quantity = Number(cartItem?.quantity)
    const currentMenuItem = currentMenuById.get(cartItem?.menuItemId)
    if (!cartItem?.menuItemId || !currentMenuItem) return [{ cartItemId: cartItem?.cartItemId, message: `${label} is no longer on the menu.` }]
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) return [{ cartItemId: cartItem.cartItemId, message: `${label} has an invalid quantity.` }]
    if (!String(currentMenuItem.name ?? '').trim()) return [{ cartItemId: cartItem.cartItemId, message: `${label} has incomplete menu information.` }]
    if (currentMenuItem.isAvailable !== true) return [{ cartItemId: cartItem.cartItemId, message: `${currentMenuItem.name} is no longer available.` }]
    if (finiteNonNegative(currentMenuItem.price) === null) return [{ cartItemId: cartItem.cartItemId, message: `${currentMenuItem.name} has an invalid price and cannot be ordered.` }]
    try { resolveOptions(currentMenuItem.optionGroups ?? [], cartItem.selections ?? []) }
    catch (error) { return [{ cartItemId: cartItem.cartItemId, message: `${label}: ${error.message}` }] }
    return []
  })
}

export async function createOrder({ cartItems, session, requestId, settingsRevision, orderType }) {
  if (!session?.sessionId) throw new Error('Join an active table session before placing an order.')
  const items = (cartItems ?? []).map((item) => ({ menuItemId: item?.menuItemId, quantity: item?.quantity, orderType: item?.orderType ?? 'dine_in', notes: item?.specialInstructions, selections: item?.selections ?? [] }))
  return placeCustomerOrder(session.sessionId, items, requestId, settingsRevision, orderType)
}

export function subscribeToCustomerOrders(session, onOrdersUpdate, onError) {
  if (!session?.sessionId) { onOrdersUpdate([]); return () => {} }
  return subscribePoll(() => getCustomerOrders(session.sessionId), onOrdersUpdate, onError)
}

export function subscribeToLatestCustomerOrder(session, onOrderUpdate, onError) {
  return subscribeToCustomerOrders(session, (orders) => onOrderUpdate(orders[0] ?? null), onError)
}

export async function cancelCustomerOrder({ orderId, sessionId }) {
  if (!orderId || !sessionId) throw new Error('This order cannot be cancelled without an active customer session.')
  return cancelCustomerOrderRequest(sessionId, orderId)
}
