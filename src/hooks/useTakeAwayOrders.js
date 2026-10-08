import { useCallback, useEffect, useRef, useState } from 'react'
import { authenticatedApiRequest } from '../services/supabaseAuthService'

export default function useTakeAwayOrders() {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const mounted = useRef(false)
  const loading = useRef(false)
  const refresh = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    try {
      const data = await authenticatedApiRequest('/api/v1/staff/take-away-orders')
      if (mounted.current) { setOrders(data.orders ?? []); setError('') }
    } catch { if (mounted.current) setError('Take-away orders could not be loaded. Please retry.') }
    finally { loading.current = false; if (mounted.current) setIsLoading(false) }
  }, [])
  useEffect(() => {
    mounted.current = true
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 5000)
    return () => { mounted.current = false; window.clearInterval(timer) }
  }, [refresh])
  return { orders, error, isLoading, refresh }
}
