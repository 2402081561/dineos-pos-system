import { useEffect, useState } from 'react'
import { subscribeToCustomerOrders } from '../services/orderService'
import useCustomerSession from './useCustomerSession'

function useCustomerOrders() {
  const { session, isRestoring } = useCustomerSession()
  const sessionId = session?.sessionId
  const [snapshot, setSnapshot] = useState({ sessionId, orders: [], isLoading: Boolean(sessionId), error: '' })

  useEffect(() => {
    if (!sessionId || isRestoring) {
      setSnapshot({ sessionId, orders: [], isLoading: Boolean(sessionId && isRestoring), error: '' })
      return () => {}
    }

    setSnapshot({ sessionId, orders: [], isLoading: true, error: '' })
    const unsubscribe = subscribeToCustomerOrders(
      { sessionId },
      (customerOrders) => {
        setSnapshot({ sessionId, orders: customerOrders, error: '', isLoading: false })
      },
      (firebaseError) => {
        console.error('[useCustomerOrders] Firestore order subscription failed:', firebaseError)
        setSnapshot((current) => ({ ...current, sessionId, error: 'We could not load your orders right now. Please try again shortly.', isLoading: false }))
      },
    )

    return unsubscribe
  }, [sessionId, isRestoring])

  // Mask the previous visit immediately, before the effect's cleanup runs.
  return sessionId && !isRestoring && snapshot.sessionId === sessionId ? snapshot : { orders: [], isLoading: Boolean(sessionId), error: '' }
}

export default useCustomerOrders
