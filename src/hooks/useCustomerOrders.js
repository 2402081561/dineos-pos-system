import { useEffect, useState } from 'react'
import { subscribeToCustomerOrders } from '../services/orderService'
import useCustomerSession from './useCustomerSession'

function useCustomerOrders() {
  const { session } = useCustomerSession()
  const sessionId = session?.sessionId
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!sessionId) {
      setOrders([])
      setIsLoading(false)
      return () => {}
    }

    setIsLoading(true)
    const unsubscribe = subscribeToCustomerOrders(
      { sessionId },
      (customerOrders) => {
        setOrders(customerOrders)
        setError('')
        setIsLoading(false)
      },
      (firebaseError) => {
        console.error('[useCustomerOrders] Firestore order subscription failed:', firebaseError)
        setError('We could not load your orders right now. Please try again shortly.')
        setIsLoading(false)
      },
    )

    return unsubscribe
  }, [sessionId])

  return { orders, isLoading, error }
}

export default useCustomerOrders
