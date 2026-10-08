import { useEffect, useMemo, useState } from 'react'
import { subscribeToSupabasePendingPayments } from '../services/adminApiService'

function timeValue(timestamp) {
  const value = timestamp?.toMillis?.() ?? new Date(timestamp).getTime()
  return Number.isFinite(value) ? value : 0
}

function useCashierTables() {
  const [orders, setOrders] = useState([])
  const [clearableTables, setClearableTables] = useState([])
  const [floorTables, setFloorTables] = useState([])
  const [floorPlan, setFloorPlan] = useState({ markers: [], revision: 0 })
  const [summary, setSummary] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const [billRequests, setBillRequests] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => subscribeToSupabasePendingPayments(
    ({ orders: pendingOrders, clearableTables: readyTables = [], floorTables: currentFloorTables = [], floorPlan: currentFloorPlan = { markers: [], revision: 0 }, summary: currentSummary = null, recentOrders: latestOrders = [], billRequests: requests = [] }) => {
      setFloorPlan(currentFloorPlan)
      setBillRequests(requests)
      setSummary(currentSummary)
      setRecentOrders(latestOrders)
      setOrders(pendingOrders)
      setClearableTables(readyTables)
      setFloorTables(currentFloorTables)
      setError('')
      setIsLoading(false)
    },
    (apiError) => {
      console.error('[Cashier] Failed to load pending payment orders:', apiError)
      setError('We could not load tables awaiting payment. Please try again shortly.')
      setIsLoading(false)
    },
  ), [])

  const tables = useMemo(() => {
    const groups = orders.reduce((result, order) => {
      const tableNumber = String(order.tableNumber ?? order.tableId ?? '—')
      const table = result.get(tableNumber) ?? { tableNumber, orders: [] }
      table.orders.push(order)
      result.set(tableNumber, table)
      return result
    }, new Map())

    return [...groups.values()]
      .map((table) => ({
        ...table,
        customerCount: new Set(table.orders.map((order) => order.sessionId || order.customerNickname).filter(Boolean)).size,
        grandTotal: table.orders.reduce((sum, order) => sum + (Number(order.grandTotal) || 0), 0),
        lastUpdatedAt: table.orders.reduce((latest, order) => timeValue(order.updatedAt) > timeValue(latest) ? order.updatedAt : latest, null),
      }))
      .sort((first, second) => timeValue(second.lastUpdatedAt) - timeValue(first.lastUpdatedAt))
  }, [orders])

  return { clearableTables, error, floorTables, floorPlan, setFloorPlan, isLoading, orders, setFloorTables, tables, summary, recentOrders, billRequests }
}

export default useCashierTables
