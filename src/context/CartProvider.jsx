import { useMemo, useRef, useState } from 'react'
import { CartContext } from './CartContext'
import { isMenuItemOrderable } from '../services/orderService'
import { cartLineId, moveCartQuantity } from '../utils/cartOrderType'
import { resolveOptions, roundMoney } from '../../server/src/posRules'
import useCustomerSession from '../hooks/useCustomerSession'
import { customerVisitStorage, sameCustomerVisit, customerOrderFingerprint } from '../utils/customerVisitStorage'

function CartProvider({ children }) {
  const { session } = useCustomerSession()
  const [draft, setDraft] = useState(() => customerVisitStorage.readDraft(session))
  const draftRef = useRef(draft)
  const mutationError = useRef('')
  const currentDraft = sameCustomerVisit(draft, session) ? draft : customerVisitStorage.readDraft(session)
  const cartItems = currentDraft.items
  const isCartLocked = Boolean(currentDraft.orderRequest)
  const getLastCartError = () => mutationError.current
  function rejectMutation(message) { mutationError.current = message; return false }

  function latestDraft() {
    return sameCustomerVisit(draftRef.current, session) ? draftRef.current : currentDraft
  }
  function saveDraft(next) {
    draftRef.current = next
    // Write before returning from the action: an immediate refresh must not
    // restore a cleared/submitted cart or lose the last quantity adjustment.
    customerVisitStorage.saveDraft(session, next)
    setDraft(next)
  }
  function setCartItems(update) {
    const current = latestDraft()
    if (current.orderRequest) return rejectMutation('Your previous order is not confirmed yet. Retry it before changing your cart.')
    const items = typeof update === 'function' ? update(current.items) : update
    saveDraft({ ...current, items, orderRequest: null })
    return true
  }
  function prepareOrderRequest(settingsRevision) {
    const current = latestDraft()
    if (!session || !current.items.length) throw new Error('Join an active table session before placing an order.')
    const signature = customerOrderFingerprint(current.items, session)
    if (current.orderRequest) {
      if (current.orderRequest.signature !== signature) throw new Error('Your previous order is not confirmed yet. Retry it before changing your cart.')
      return current.orderRequest.id
    }
    const id = crypto.randomUUID()
    saveDraft({ ...current, orderRequest: { id, signature, ...(Number.isInteger(settingsRevision) ? { settingsRevision } : {}) } })
    return id
  }
  function getOrderRequest() { return latestDraft().orderRequest }
  function completeOrderRequest(requestId) {
    const current = latestDraft()
    if (current.orderRequest?.id !== requestId) return false
    saveDraft({ ...current, items: [], orderRequest: null })
    return true
  }
  function rejectOrderRequest(requestId) {
    const current = latestDraft()
    if (current.orderRequest?.id !== requestId) return false
    saveDraft({ ...current, orderRequest: null })
    return true
  }

  function addToCart(menuItem, quantity = 1, specialInstructions = '', selections = [], orderType = 'dine_in') {
    if (!session) return false
    if (latestDraft().orderRequest) return rejectMutation('Your previous order is not confirmed yet. Retry it before changing your cart.')
    const safeQuantity = Number(quantity)
    if (!isMenuItemOrderable(menuItem) || !Number.isInteger(safeQuantity) || safeQuantity < 1 || safeQuantity > 50) return rejectMutation('Please review the dish options and quantity.')
    let options
    try { options = resolveOptions(menuItem.optionGroups ?? [], selections) } catch (error) { return rejectMutation(error.message) }
    const normalizedInstructions = String(specialInstructions ?? '').trim()
    const cartItemId = cartLineId(menuItem.id, normalizedInstructions, options.selections, orderType)
    const items = latestDraft().items
    const existing = items.find((item) => item.cartItemId === cartItemId)
    if (existing && existing.quantity + safeQuantity > 50) return rejectMutation('Each item line can contain at most 50 items.')
    if (items.length >= 30 && !existing) return rejectMutation('Your cart can contain at most 30 item lines.')
    mutationError.current = ''

    setCartItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.cartItemId === cartItemId)

      if (existingItem) {
        return currentItems.map((item) => item.cartItemId === cartItemId
          ? { ...item, quantity: item.quantity + safeQuantity }
          : item)
      }

      if (currentItems.length >= 30) return currentItems
      return [...currentItems, {
        cartItemId,
        cartRowId: crypto.randomUUID(),
        orderType,
        menuItemId: menuItem.id,
        name: menuItem.name,
        imageUrl: menuItem.imageUrl,
        unitPrice: roundMoney(Number(menuItem.price) + options.extraPrice),
        selections: options.selections,
        optionSnapshot: options.optionSnapshot,
        quantity: safeQuantity,
        specialInstructions: normalizedInstructions,
      }]
    })
    return true
  }

  function updateQuantity(cartItemId, quantity) {
    const safeQuantity = Number(quantity)
    if (!Number.isInteger(safeQuantity) || safeQuantity < 0 || safeQuantity > 50) return rejectMutation('Each item line can contain at most 50 items.')

    return setCartItems((currentItems) => currentItems
      .map((item) => item.cartItemId === cartItemId ? { ...item, quantity: safeQuantity } : item)
      .filter((item) => item.quantity > 0))
  }

  function removeFromCart(cartItemId) {
    return setCartItems((currentItems) => currentItems.filter((item) => item.cartItemId !== cartItemId))
  }

  function clearCart() {
    return setCartItems([])
  }

  function changeItemOrderType(cartItemId, orderType, quantity) {
    const items = latestDraft().items
    if (latestDraft().orderRequest) return 'Your previous order is not confirmed yet. Retry it before changing your cart.'
    const source = items.find((item) => item.cartItemId === cartItemId)
    const result = moveCartQuantity(items, cartItemId, quantity ?? source?.quantity, orderType)
    if (!result.error) setCartItems(result.items)
    return result.error
  }

  const cartItemCount = useMemo(
    () => cartItems.reduce((total, item) => total + item.quantity, 0),
    [cartItems],
  )
  const value = { cartItems, cartItemCount, isCartLocked, getLastCartError, addToCart, updateQuantity, removeFromCart, clearCart, changeItemOrderType, prepareOrderRequest, getOrderRequest, completeOrderRequest, rejectOrderRequest }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export default CartProvider
