import { useCallback, useEffect, useRef, useState } from 'react'
import { authenticatedApiRequest } from '../services/supabaseAuthService'
import { watchPoll } from '../utils/pollSubscription'

export default function useTakeAwayOrders() {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const subscription = useRef(null)
  const refresh = useCallback(() => subscription.current?.refresh(), [])
  useEffect(() => {
    const watcher = watchPoll(() => authenticatedApiRequest('/api/v1/staff/take-away-orders'), (data) => {
      setOrders(data.orders ?? []); setError(''); setIsLoading(false)
    }, () => { setError('Take-away orders could not be loaded. Please retry.'); setIsLoading(false) }, { interval: 5000 })
    subscription.current = watcher
    return () => { watcher.stop(); subscription.current = null }
  }, [])
  return { orders, error, isLoading, refresh }
}
