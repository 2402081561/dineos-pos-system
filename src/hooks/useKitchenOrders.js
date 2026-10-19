import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseKitchenOrders } from '../services/adminApiService'
import { watchPoll } from '../utils/pollSubscription'

const acknowledgedAlertsKey = 'dineos.kitchenAcknowledgedOrderAlerts'

function readAcknowledgedOrderIds() {
  try {
    const value = JSON.parse(localStorage.getItem(acknowledgedAlertsKey) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter((id) => typeof id === 'string').slice(-500) : [])
  } catch {
    return new Set()
  }
}

function saveAcknowledgedOrderIds(orderIds) {
  try { localStorage.setItem(acknowledgedAlertsKey, JSON.stringify([...orderIds].slice(-500))) } catch { /* Alert acknowledgement is optional UX state. */ }
}

function useKitchenOrders() {
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [newOrderIds, setNewOrderIds] = useState(new Set())
  const hasLoadedInitialSnapshotRef = useRef(false)
  const knownReceivedOrderIdsRef = useRef(new Set())
  const acknowledgedOrderIdsRef = useRef(null)
  const subscription = useRef(null)

  const applyOrders = useCallback((activeOrders) => {
    const receivedOrderIds = new Set(activeOrders
      .filter((order) => String(order?.status ?? '').toLowerCase() === 'received')
      .map((order) => String(order.id ?? ''))
      .filter(Boolean))
    if (!acknowledgedOrderIdsRef.current) acknowledgedOrderIdsRef.current = readAcknowledgedOrderIds()
    if (!hasLoadedInitialSnapshotRef.current) {
      knownReceivedOrderIdsRef.current = receivedOrderIds
      hasLoadedInitialSnapshotRef.current = true
    } else {
      const newlyReceivedIds = [...receivedOrderIds].filter((orderId) => !knownReceivedOrderIdsRef.current.has(orderId)
        && !acknowledgedOrderIdsRef.current.has(orderId))
      if (newlyReceivedIds.length > 0) {
        newlyReceivedIds.forEach((orderId) => acknowledgedOrderIdsRef.current.add(orderId))
        saveAcknowledgedOrderIds(acknowledgedOrderIdsRef.current)
        setNewOrderIds((currentIds) => new Set([...currentIds, ...newlyReceivedIds]))
      }
      knownReceivedOrderIdsRef.current = receivedOrderIds
    }
    setNewOrderIds((currentIds) => new Set([...currentIds].filter((orderId) => receivedOrderIds.has(orderId))))
    setOrders(activeOrders)
    setError('')
    setIsLoading(false)
  }, [])

  const refresh = useCallback(() => subscription.current?.refreshLatest(), [])

  useEffect(() => {
    const watcher = watchPoll(
      getSupabaseKitchenOrders,
      applyOrders,
      (apiError) => {
        console.error('[useKitchenOrders] API kitchen subscription failed:', apiError)
        const message = apiError instanceof Error && apiError.message
          ? apiError.message
          : 'We could not load kitchen orders right now. Please try again shortly.'
        setError(message)
        setIsLoading(false)
      },
      { interval: 5000 },
    )
    subscription.current = watcher

    return () => { watcher.stop(); subscription.current = null }
  }, [applyOrders])

  return { orders, isLoading, error, newOrderIds, refresh }
}

export default useKitchenOrders
