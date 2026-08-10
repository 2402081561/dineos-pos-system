import { useEffect, useState } from 'react'
import { subscribeToActiveKitchenOrders } from '../services/orderService'

function useKitchenOrders() {
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsubscribe = subscribeToActiveKitchenOrders(
      (activeOrders) => {
        setOrders(activeOrders)
        setError('')
        setIsLoading(false)
      },
      (firebaseError) => {
        console.error('[useKitchenOrders] Firestore kitchen subscription failed:', firebaseError)
        setError('We could not load kitchen orders right now. Please try again shortly.')
        setIsLoading(false)
      },
    )

    return unsubscribe
  }, [])

  return { orders, isLoading, error }
}

export default useKitchenOrders
