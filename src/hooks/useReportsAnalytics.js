import { useEffect, useMemo, useState } from 'react'
import { subscribeToCategories } from '../services/categoryService'
import { subscribeToAllMenuItems } from '../services/menuService'
import { subscribeToReportOrders, subscribeToReportServiceRequests } from '../services/reportService'
import { subscribeToTables } from '../services/tableService'
import { addDays, formatShortDate, getDateRange, isWithinRange, toDate } from '../utils/reporting'

const activeStatuses = new Set(['received', 'preparing', 'ready'])
const completedStatuses = new Set(['served'])
const cancelledStatuses = new Set(['cancelled', 'canceled'])

function number(value) {
  return Number(value) || 0
}

function startOfWeek(date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7))
  return result
}

function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
    return groups
  }, new Map())
}

function calculateAnalytics({ categories, menuItems, orders, requests, tables }, range) {
  const filteredOrders = orders.filter((order) => isWithinRange(order.createdAt, range))
  const filteredRequests = requests.filter((request) => isWithinRange(request.createdAt, range))
  const servedOrders = filteredOrders.filter((order) => completedStatuses.has(String(order.status).toLowerCase()))
  const paidOrders = filteredOrders.filter((order) => String(order.paymentStatus).toLowerCase() === 'paid')
  const validOrders = filteredOrders.filter((order) => !cancelledStatuses.has(String(order.status).toLowerCase()))
  const totalRevenue = paidOrders.reduce((sum, order) => sum + number(order.grandTotal), 0)
  const totalItems = validOrders.reduce((sum, order) => sum + (order.items ?? []).reduce((itemSum, item) => itemSum + number(item.quantity), 0), 0)
  const uniqueCustomers = new Set(validOrders.map((order) => order.sessionId || order.customerNickname).filter(Boolean)).size
  const menuById = new Map(menuItems.map((item) => [item.id, item]))
  const categoryById = new Map(categories.map((category) => [category.id, category]))

  const foodMap = new Map()
  const categoryMap = new Map()
  paidOrders.forEach((order) => {
    ;(order.items ?? []).forEach((item) => {
      const quantity = number(item.quantity)
      const revenue = number(item.price) * quantity
      const foodKey = item.menuItemId || item.name
      const currentFood = foodMap.get(foodKey) ?? { name: item.name || 'Unnamed item', quantity: 0, revenue: 0 }
      foodMap.set(foodKey, { ...currentFood, quantity: currentFood.quantity + quantity, revenue: currentFood.revenue + revenue })

      const categoryId = menuById.get(item.menuItemId)?.categoryId
      const categoryName = categoryById.get(categoryId)?.name ?? 'Uncategorised'
      const currentCategory = categoryMap.get(categoryName) ?? { name: categoryName, revenue: 0 }
      categoryMap.set(categoryName, { ...currentCategory, revenue: currentCategory.revenue + revenue })
    })
  })

  const tableGroups = groupBy(validOrders, (order) => String(order.tableNumber ?? order.tableId ?? 'Unknown'))
  const tableAnalytics = [...tableGroups.entries()]
    .map(([tableNumber, tableOrders]) => ({
      tableNumber,
      orders: tableOrders.length,
      averageSpend: tableOrders.reduce((sum, order) => sum + number(order.grandTotal), 0) / tableOrders.length,
    }))
    .sort((first, second) => second.orders - first.orders || second.averageSpend - first.averageSpend)

  const peakHours = [...groupBy(validOrders.filter((order) => toDate(order.createdAt)), (order) => toDate(order.createdAt).getHours()).entries()]
    .map(([hour, hourOrders]) => ({ label: `${String(hour).padStart(2, '0')}:00`, value: hourOrders.length }))
    .sort((first, second) => first.label.localeCompare(second.label))

  const requestCounts = { water: 0, requestBill: 0, callWaiter: 0, extraSpoon: 0 }
  filteredRequests.forEach((request) => {
    const key = String(request.requestType ?? '').replace(/[\s_-]/g, '').toLowerCase()
    if (key === 'water') requestCounts.water += 1
    if (key === 'requestbill' || key === 'bill') requestCounts.requestBill += 1
    if (key === 'callwaiter' || key === 'waiter') requestCounts.callWaiter += 1
    if (key === 'extraspoon' || key === 'spoon') requestCounts.extraSpoon += 1
  })

  const salesByDay = []
  for (let day = range.start; day < range.end; day = addDays(day, 1)) {
    const nextDay = addDays(day, 1)
    salesByDay.push({
      label: formatShortDate(day),
      value: paidOrders.filter((order) => {
        const orderDate = toDate(order.createdAt)
        return orderDate && orderDate >= day && orderDate < nextDay
      }).reduce((sum, order) => sum + number(order.grandTotal), 0),
    })
  }

  const now = new Date()
  const currentYearOrders = orders.filter((order) => toDate(order.createdAt)?.getFullYear() === now.getFullYear() && String(order.paymentStatus).toLowerCase() === 'paid')
  const revenueFor = (start, end) => currentYearOrders.filter((order) => isWithinRange(order.createdAt, { start, end })).reduce((sum, order) => sum + number(order.grandTotal), 0)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const week = startOfWeek(now)

  return {
    filteredOrders,
    recentOrders: [...filteredOrders].sort((first, second) => (toDate(second.createdAt)?.getTime() ?? 0) - (toDate(first.createdAt)?.getTime() ?? 0)).slice(0, 10),
    summary: {
      totalRevenue,
      totalOrders: filteredOrders.length,
      averageOrderValue: paidOrders.length ? totalRevenue / paidOrders.length : 0,
      activeTables: new Set(orders.filter((order) => activeStatuses.has(String(order.status).toLowerCase())).map((order) => order.tableNumber ?? order.tableId).filter(Boolean)).size,
      completedOrders: servedOrders.length,
      cancelledOrders: filteredOrders.filter((order) => cancelledStatuses.has(String(order.status).toLowerCase())).length,
      pendingRequests: requests.filter((request) => String(request.status).toLowerCase() === 'pending').length,
      uniqueCustomers,
      averageItemsPerOrder: validOrders.length ? totalItems / validOrders.length : 0,
      averageSpendPerCustomer: uniqueCustomers ? totalRevenue / uniqueCustomers : 0,
      activeTableRecords: tables.filter((table) => table.isActive !== false).length,
    },
    salesTotals: {
      daily: revenueFor(today, addDays(today, 1)),
      weekly: revenueFor(week, addDays(week, 7)),
      monthly: revenueFor(new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)),
      yearly: currentYearOrders.reduce((sum, order) => sum + number(order.grandTotal), 0),
    },
    statusCounts: ['received', 'preparing', 'ready', 'served', 'cancelled'].map((status) => ({ label: status, value: filteredOrders.filter((order) => String(order.status).toLowerCase() === status).length })),
    topFoods: [...foodMap.values()].sort((first, second) => second.quantity - first.quantity || second.revenue - first.revenue).slice(0, 10),
    categoryAnalytics: [...categoryMap.values()].sort((first, second) => second.revenue - first.revenue),
    tableAnalytics,
    peakHours,
    requestCounts,
    salesByDay,
  }
}

function useReportsAnalytics({ customEnd, customStart, dateFilter }) {
  const [sourceData, setSourceData] = useState({ orders: [], requests: [], menuItems: [], categories: [], tables: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let completedSubscriptions = 0
    const completeLoading = () => {
      completedSubscriptions += 1
      if (completedSubscriptions >= 5) setIsLoading(false)
    }
    const reportError = (firebaseError) => {
      console.error('[Reports] Firestore query failed:', firebaseError)
      setError('We could not load reports right now. Please try again shortly.')
      setIsLoading(false)
    }
    const subscriptions = [
      subscribeToReportOrders((orders) => { setSourceData((current) => ({ ...current, orders })); completeLoading() }, reportError),
      subscribeToReportServiceRequests((requests) => { setSourceData((current) => ({ ...current, requests })); completeLoading() }, reportError),
      subscribeToAllMenuItems((menuItems) => { setSourceData((current) => ({ ...current, menuItems })); completeLoading() }, reportError),
      subscribeToCategories((categories) => { setSourceData((current) => ({ ...current, categories })); completeLoading() }, reportError),
      subscribeToTables((tables) => { setSourceData((current) => ({ ...current, tables })); completeLoading() }, reportError),
    ]
    return () => subscriptions.forEach((unsubscribe) => unsubscribe())
  }, [])

  const range = useMemo(() => getDateRange(dateFilter, customStart, customEnd), [customEnd, customStart, dateFilter])
  const analytics = useMemo(() => calculateAnalytics(sourceData, range), [range, sourceData])
  return { analytics, error, isLoading, range }
}

export default useReportsAnalytics
