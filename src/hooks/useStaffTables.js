import { useEffect, useMemo, useState } from 'react'
import { subscribeToActiveKitchenOrders } from '../services/orderService'
import { subscribeToTables } from '../services/tableService'

function timeValue(timestamp) {
  return timestamp?.toMillis?.() ?? Number.MIN_SAFE_INTEGER
}

function useStaffTables() {
  const [tables, setTables] = useState([])
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [tablesError, setTablesError] = useState('')
  const [ordersError, setOrdersError] = useState('')

  useEffect(() => {
    let completed = 0
    const done = () => { completed += 1; if (completed >= 2) setIsLoading(false) }
    const subscriptions = [
      subscribeToTables(
        (nextTables) => { setTables(nextTables); setTablesError(''); done() },
        (firebaseError) => {
          console.error('[Staff Tables] Failed to load tables:', firebaseError)
          setTablesError('We could not load the table overview right now. Please try again shortly.')
          setIsLoading(false)
        },
      ),
      subscribeToActiveKitchenOrders(
        (nextOrders) => { setOrders(nextOrders); setOrdersError(''); done() },
        (firebaseError) => {
          console.error('[Staff Tables] Failed to load active orders:', firebaseError)
          setOrdersError('We could not load the table overview right now. Please try again shortly.')
          setIsLoading(false)
        },
      ),
    ]
    return () => subscriptions.forEach((unsubscribe) => unsubscribe())
  }, [])

  const tableOverview = useMemo(() => tables.map((table) => {
    const tableNumber = String(table.tableNumber)
    const tableOrders = orders.filter((order) => String(order.tableNumber ?? order.tableId) === tableNumber)
    const latestOrder = [...tableOrders].sort((first, second) => timeValue(second.updatedAt ?? second.createdAt) - timeValue(first.updatedAt ?? first.createdAt))[0]
    const latestStatus = String(latestOrder?.status ?? '').toLowerCase()
    const status = table.isActive === false
      ? 'Inactive'
      : latestStatus === 'ready'
        ? 'Ready'
        : latestStatus === 'preparing'
          ? 'Preparing'
          : latestStatus === 'received'
            ? 'Ordering'
            : 'Available'
    return {
      ...table,
      customerCount: new Set(tableOrders.map((order) => order.sessionId || order.customerNickname).filter(Boolean)).size,
      latestOrder,
      orderCount: tableOrders.length,
      status,
    }
  }), [orders, tables])

  return { error: tablesError || ordersError, isLoading, tableOverview }
}

export default useStaffTables
