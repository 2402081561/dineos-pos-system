import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from './firebase'

const ordersCollection = collection(db, 'orders')

export function subscribeToTableOrders(tableNumber, onOrdersUpdate, onError) {
  if (!tableNumber) {
    onOrdersUpdate([])
    return () => {}
  }

  return onSnapshot(
    query(ordersCollection, where('tableNumber', '==', String(tableNumber))),
    (snapshot) => {
      const orders = snapshot.docs
        .map((order) => ({ id: order.id, ...order.data() }))
        .sort((firstOrder, secondOrder) => (secondOrder.createdAt?.toMillis?.() ?? 0) - (firstOrder.createdAt?.toMillis?.() ?? 0))
      onOrdersUpdate(orders)
    },
    onError,
  )
}
