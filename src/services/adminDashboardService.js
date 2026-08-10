import { Timestamp, collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from './firebase'

const ordersCollection = collection(db, 'orders')
const serviceRequestsCollection = collection(db, 'serviceRequests')

function getTodayBounds() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) }
}

export async function getAdminDashboardData() {
  const { start, end } = getTodayBounds()
  const todayOrdersQuery = query(
    ordersCollection,
    where('createdAt', '>=', start),
    where('createdAt', '<', end),
  )
  const activeOrdersQuery = query(
    ordersCollection,
    where('status', 'in', ['received', 'preparing', 'ready']),
  )
  const pendingRequestsQuery = query(
    serviceRequestsCollection,
    where('status', '==', 'pending'),
  )
  const recentOrdersQuery = query(ordersCollection, orderBy('createdAt', 'desc'), limit(10))

  const [todayOrdersSnapshot, activeOrdersSnapshot, pendingRequestsSnapshot, recentOrdersSnapshot] = await Promise.all([
    getDocs(todayOrdersQuery),
    getDocs(activeOrdersQuery),
    getDocs(pendingRequestsQuery),
    getDocs(recentOrdersQuery),
  ])

  const todayOrders = todayOrdersSnapshot.docs.map((order) => ({ id: order.id, ...order.data() }))
  const popularFoodCounts = new Map()

  todayOrders.forEach((order) => {
    order.items?.forEach((item) => {
      const current = popularFoodCounts.get(item.name) ?? { name: item.name, quantity: 0 }
      popularFoodCounts.set(item.name, { ...current, quantity: current.quantity + Number(item.quantity || 0) })
    })
  })

  return {
    todayOrderCount: todayOrders.length,
    todayRevenue: todayOrders
      .filter((order) => order.status === 'served')
      .reduce((total, order) => total + Number(order.grandTotal || 0), 0),
    activeOrderCount: activeOrdersSnapshot.size,
    pendingRequestCount: pendingRequestsSnapshot.size,
    popularFoods: [...popularFoodCounts.values()].sort((firstFood, secondFood) => secondFood.quantity - firstFood.quantity).slice(0, 5),
    recentOrders: recentOrdersSnapshot.docs.map((order) => ({ id: order.id, ...order.data() })),
  }
}
