import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useCart from './useCart'
import useToast from './useToast'
import { isMenuItemOrderable } from '../services/orderService'

const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration))

function useAddToCartFeedback() {
  const { addToCart } = useCart()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [status, setStatus] = useState('idle')
  const isAddingRef = useRef(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  async function addItem(menuItem, quantity = 1, specialInstructions = '') {
    if (isAddingRef.current) return
    if (!isMenuItemOrderable(menuItem) || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
      showToast('This item is no longer available.', 'error')
      return
    }

    isAddingRef.current = true
    setStatus('adding')

    try {
      await wait(150)
      addToCart(menuItem, quantity, specialInstructions)
      if (isMountedRef.current) setStatus('added')
      showToast('✅ Added to Cart', 'success', {
        detail: `${menuItem.name} × ${quantity}`,
        action: { label: 'View Cart', onClick: () => navigate('/cart') },
      })
      await wait(1000)
    } catch (error) {
      console.error('[Cart] Failed to add item:', error)
      showToast('Unable to add item to cart.', 'error')
    } finally {
      if (isMountedRef.current) setStatus('idle')
      isAddingRef.current = false
    }
  }

  return { addItem, isAdding: status === 'adding', isAdded: status === 'added', isBusy: status !== 'idle' }
}

export default useAddToCartFeedback
