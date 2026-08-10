import { useMemo, useState } from 'react'
import { CartContext } from './CartContext'

function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([])

  function addToCart(menuItem, quantity = 1, specialInstructions = '') {
    const safeQuantity = Math.max(1, Number(quantity) || 1)
    const normalizedInstructions = specialInstructions.trim()
    const cartItemId = `${menuItem.id}-${normalizedInstructions}`

    setCartItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.cartItemId === cartItemId)

      if (existingItem) {
        return currentItems.map((item) => item.cartItemId === cartItemId
          ? { ...item, quantity: item.quantity + safeQuantity }
          : item)
      }

      return [...currentItems, {
        cartItemId,
        menuItemId: menuItem.id,
        name: menuItem.name,
        imageUrl: menuItem.imageUrl,
        unitPrice: Number(menuItem.price),
        quantity: safeQuantity,
        specialInstructions: normalizedInstructions,
      }]
    })
  }

  function updateQuantity(cartItemId, quantity) {
    const safeQuantity = Number(quantity)

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

  const cartItemCount = useMemo(
    () => cartItems.reduce((total, item) => total + item.quantity, 0),
    [cartItems],
  )
  const value = { cartItems, cartItemCount, addToCart, updateQuantity, removeFromCart, clearCart }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export default CartProvider
