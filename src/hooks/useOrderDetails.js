import { useEffect, useRef, useState } from 'react'
import { getSupabaseOrderDetails } from '../services/adminApiService'
import { watchOrderDetails } from '../utils/orderDetailsSubscription'

export default function useOrderDetails(orderId, paused = false) {
  const [state, setState] = useState({ orderId: null, order: null, isLoading: true, error: '' })
  const subscription = useRef(null)
  useEffect(() => {
    if (paused) return undefined
    const watcher = watchOrderDetails(() => getSupabaseOrderDetails(orderId), (next) => setState({ ...next, orderId }))
    subscription.current = watcher
    return () => { watcher.stop(); subscription.current = null }
  }, [orderId, paused])
  return {
    ...(state.orderId === orderId ? state : { order: null, isLoading: true, error: '' }),
    refresh: () => subscription.current?.refresh(),
  }
}
