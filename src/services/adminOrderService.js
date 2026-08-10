import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from './firebase'

const ordersCollection = collection(db, 'orders')

export function subscribeToAdminOrders(onOrdersUpdate, onError) {
  return onSnapshot(
    query(ordersCollection, orderBy('createdAt', 'desc')),
    (snapshot) => onOrdersUpdate(snapshot.docs.map((order) => ({ id: order.id, ...order.data() }))),
    onError,
  )
}

export async function cancelOrder(orderId) {
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  })
}
