import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import KitchenOrderCard from '../../components/kitchen/KitchenOrderCard'
import KitchenOrderSkeleton from '../../components/kitchen/KitchenOrderSkeleton'
import useKitchenOrders from '../../hooks/useKitchenOrders'
import { updateOrderStatus } from '../../services/orderService'
import { useEffect, useRef, useState } from 'react'

function Dashboard() {
  const { orders, isLoading, error } = useKitchenOrders()
  const [updatingOrderIds, setUpdatingOrderIds] = useState(new Set())
  const [updateError, setUpdateError] = useState('')
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const updatingOrderIdsRef = useRef(new Set())
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 30000)
    return () => {
      isMountedRef.current = false
      window.clearInterval(intervalId)
    }
  }, [])

  async function handleUpdateStatus(orderId, status, expectedStatus) {
    if (updatingOrderIdsRef.current.has(orderId)) return

    try {
      updatingOrderIdsRef.current.add(orderId)
      setUpdatingOrderIds(new Set(updatingOrderIdsRef.current))
      setUpdateError('')
      await updateOrderStatus(orderId, status, expectedStatus)
    } catch (firebaseError) {
      console.error('[Kitchen Dashboard] Failed to update order status:', firebaseError)
      setUpdateError(firebaseError.message === 'This order was updated by another kitchen user.' ? 'This order was already updated by another kitchen user.' : 'We could not update this order. Please try again.')
    } finally {
      updatingOrderIdsRef.current.delete(orderId)
      if (isMountedRef.current) setUpdatingOrderIds(new Set(updatingOrderIdsRef.current))
    }
  }

  return <div className="space-y-7"><SectionHeading eyebrow="Kitchen command centre" title="Incoming orders" description="Keep every table moving with a clear, live kitchen queue." />{updateError && <StatePanel description={updateError} title="Order update failed" tone="error" />}{isLoading ? <div className="grid gap-5 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <KitchenOrderSkeleton key={index} />)}</div> : error ? <StatePanel description={error} title="Kitchen orders unavailable" tone="error" /> : orders.length === 0 ? <StatePanel description="New customer orders will appear here automatically." title="No active kitchen orders." /> : <div className="grid gap-5 lg:grid-cols-3">{orders.map((order) => <KitchenOrderCard isUpdating={updatingOrderIds.has(order.id)} key={order.id} now={currentTime} onUpdateStatus={handleUpdateStatus} order={order} />)}</div>}</div>
}

export default Dashboard
