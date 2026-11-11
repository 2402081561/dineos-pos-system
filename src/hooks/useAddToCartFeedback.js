import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useCart from './useCart'
import useToast from './useCustomerToast'
import { isMenuItemOrderable } from '../services/orderService'

function useAddToCartFeedback() {
  const { addToCart, isCartLocked, getLastCartError } = useCart()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [status, setStatus] = useState('idle')
  const isAddingRef = useRef(false)
  const isMountedRef = useRef(true)
  const feedbackTimer = useRef(null)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      clearTimeout(feedbackTimer.current)
    }
  }, [])

  async function addItem(menuItem, quantity = 1, specialInstructions = '', selections = [], orderType = 'dine_in') {
    if (isAddingRef.current) return
    if (isCartLocked) { showToast('Your previous order is not confirmed yet. Retry it before changing your cart.', 'error'); return }
    if (!isMenuItemOrderable(menuItem) || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
      showToast('This item is no longer available.', 'error')
      return
    }

    isAddingRef.current = true
    setStatus('adding')

    try {
      if (!addToCart(menuItem, quantity, specialInstructions, selections, orderType)) throw new Error(getLastCartError?.() || 'Please review the dish options and quantity.')
      if (isMountedRef.current) setStatus('added')
      showToast('✅ Added to Cart', 'success', {
        detail: `${menuItem.name} × ${quantity}`,
        action: { label: 'View Cart', onClick: () => navigate('/cart') },
      })
      clearTimeout(feedbackTimer.current)
      // Display feedback without delaying the mutation or locking repeat taps.
      feedbackTimer.current = setTimeout(() => { if (isMountedRef.current) setStatus('idle') }, 1000)
    } catch (error) {
      console.error('[Cart] Failed to add item:', error)
      showToast(error.message || 'Unable to add item to cart.', 'error')
      if (isMountedRef.current) setStatus('idle')
    } finally {
      isAddingRef.current = false
    }
  }

  return { addItem, isAdding: status === 'adding', isAdded: status === 'added', isBusy: status === 'adding' || Boolean(isCartLocked) }
}

export default useAddToCartFeedback
