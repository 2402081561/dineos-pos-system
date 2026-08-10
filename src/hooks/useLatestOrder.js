import { useEffect, useState } from 'react'
import { subscribeToCustomerOrders } from '../services/orderService'
import useCustomerSession from './useCustomerSession'

function useLatestOrder() {
  const { session } = useCustomerSession()
  const [order, setOrder] = useState(null)
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session?.sessionId) {
      setIsLoading(false)
      return () => {}
    }

    const unsubscribe = subscribeToCustomerOrders(
      session,
      (customerOrders) => {
        setOrders(customerOrders)
        setOrder(customerOrders[0] ?? null)
        setError('')
        setIsLoading(false)
      },
      (firebaseError) => {
        console.error('[useLatestOrder] Firestore order subscription failed:', firebaseError)
        setError('We could not load your order right now. Please try again shortly.')
        setIsLoading(false)
      },
    )

    return unsubscribe
  }, [session])

  return { order, orders, isLoading, error }
}

export default useLatestOrder
