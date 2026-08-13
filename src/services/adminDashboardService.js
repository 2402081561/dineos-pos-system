import { Timestamp, collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
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

export function subscribeToAdminDashboardData(onUpdate, onError) {
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

  const snapshots = { todayOrders: null, activeOrders: null, pendingRequests: null, recentOrders: null }

  function publish() {
    if (Object.values(snapshots).some((snapshot) => snapshot === null)) return
    const todayOrders = snapshots.todayOrders.docs.map((order) => ({ id: order.id, ...order.data() }))
    const popularFoodCounts = new Map()
    todayOrders
      .filter((order) => !['cancelled', 'canceled'].includes(String(order.status ?? '').toLowerCase()))
      .forEach((order) => (Array.isArray(order.items) ? order.items : []).forEach((item) => {
        const name = String(item?.name ?? '').trim() || 'Unnamed item'
        const current = popularFoodCounts.get(name) ?? { name, quantity: 0 }
        popularFoodCounts.set(name, { ...current, quantity: current.quantity + Math.max(0, Number(item?.quantity) || 0) })
      }))

    onUpdate({
      todayOrderCount: todayOrders.length,
      todayRevenue: todayOrders
        .filter((order) => String(order.paymentStatus ?? '').toLowerCase() === 'paid')
        .reduce((total, order) => total + Math.max(0, Number(order.grandTotal) || 0), 0),
      activeOrderCount: snapshots.activeOrders.size,
      pendingRequestCount: snapshots.pendingRequests.size,
      popularFoods: [...popularFoodCounts.values()].sort((firstFood, secondFood) => secondFood.quantity - firstFood.quantity).slice(0, 5),
      recentOrders: snapshots.recentOrders.docs.map((order) => ({ id: order.id, ...order.data() })),
    })
  }

  return [
    onSnapshot(todayOrdersQuery, (snapshot) => { snapshots.todayOrders = snapshot; publish() }, onError),
    onSnapshot(activeOrdersQuery, (snapshot) => { snapshots.activeOrders = snapshot; publish() }, onError),
    onSnapshot(pendingRequestsQuery, (snapshot) => { snapshots.pendingRequests = snapshot; publish() }, onError),
    onSnapshot(recentOrdersQuery, (snapshot) => { snapshots.recentOrders = snapshot; publish() }, onError),
  ]
}
