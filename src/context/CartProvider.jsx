import { useMemo, useState } from 'react'
import { CartContext } from './CartContext'
import { isMenuItemOrderable } from '../services/orderService'
import { cartLineId, moveCartQuantity } from '../utils/cartOrderType'
import { resolveOptions, roundMoney } from '../../server/src/posRules'

function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([])

  function addToCart(menuItem, quantity = 1, specialInstructions = '', selections = [], orderType = 'dine_in') {
    const safeQuantity = Number(quantity)
    if (!isMenuItemOrderable(menuItem) || !Number.isInteger(safeQuantity) || safeQuantity < 1 || safeQuantity > 50) return false
    let options
    try { options = resolveOptions(menuItem.optionGroups ?? [], selections) } catch { return false }
    const normalizedInstructions = String(specialInstructions ?? '').trim()
    const cartItemId = cartLineId(menuItem.id, normalizedInstructions, options.selections, orderType)
    if (cartItems.length >= 30 && !cartItems.some((item) => item.cartItemId === cartItemId)) return false

    setCartItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.cartItemId === cartItemId)

      if (existingItem) {
        return currentItems.map((item) => item.cartItemId === cartItemId
          ? { ...item, quantity: Math.min(50, item.quantity + safeQuantity) }
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
    const safeQuantity = Math.min(50, Number(quantity))
    if (!Number.isInteger(safeQuantity) || safeQuantity < 0) return

    setCartItems((currentItems) => currentItems
      .map((item) => item.cartItemId === cartItemId ? { ...item, quantity: safeQuantity } : item)
      .filter((item) => item.quantity > 0))
  }

  function removeFromCart(cartItemId) {
    setCartItems((currentItems) => currentItems.filter((item) => item.cartItemId !== cartItemId))
  }

  function clearCart() {
    setCartItems([])
  }

  function changeItemOrderType(cartItemId, orderType, quantity) {
    const source = cartItems.find((item) => item.cartItemId === cartItemId)
    const result = moveCartQuantity(cartItems, cartItemId, quantity ?? source?.quantity, orderType)
    if (!result.error) setCartItems(result.items)
    return result.error
  }

  const cartItemCount = useMemo(
    () => cartItems.reduce((total, item) => total + item.quantity, 0),
    [cartItems],
  )
  const value = { cartItems, cartItemCount, addToCart, updateQuantity, removeFromCart, clearCart, changeItemOrderType }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export default CartProvider
