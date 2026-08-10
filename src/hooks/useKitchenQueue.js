import { useEffect, useState } from 'react'
import { subscribeToActiveKitchenOrders } from '../services/orderService'

function useKitchenQueue() {
  const [activeOrders, setActiveOrders] = useState([])

  useEffect(() => subscribeToActiveKitchenOrders(
    setActiveOrders,
    (error) => console.error('[Customer Tracking] Failed to load kitchen queue:', error),
  ), [])

  return activeOrders
}

export default useKitchenQueue
