import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from './firebase'

const ordersCollection = collection(db, 'orders')

function mapSnapshot(snapshot) {
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))
}

function timeValue(timestamp) {
  return timestamp?.toMillis?.() ?? 0
}

function summarizeReceipt(receiptNumber, orders) {
  const latestOrder = [...orders].sort((first, second) => timeValue(second.paidAt) - timeValue(first.paidAt))[0]
  return {
    receiptNumber,
    orders,
    tableNumber: latestOrder?.tableNumber ?? latestOrder?.tableId ?? '—',
    paidAt: latestOrder?.paidAt ?? null,
    paymentMethod: latestOrder?.paymentMethod ?? '—',
    cashierId: latestOrder?.cashierId ?? '—',
    grandTotal: orders.reduce((sum, order) => sum + (Number(order.grandTotal) || 0), 0),
  }
}

export function subscribeToReceipt(receiptNumber, onUpdate, onError) {
  return onSnapshot(
    query(ordersCollection, where('receiptNumber', '==', receiptNumber)),
    (snapshot) => onUpdate(snapshot.empty ? null : summarizeReceipt(receiptNumber, mapSnapshot(snapshot))),
    onError,
  )
}

export function subscribeToReceiptHistory(onUpdate, onError) {
  return onSnapshot(
    query(ordersCollection, where('paymentStatus', '==', 'paid')),
    (snapshot) => {
      const receiptGroups = mapSnapshot(snapshot).reduce((groups, order) => {
        if (!order.receiptNumber) return groups
        groups.set(order.receiptNumber, [...(groups.get(order.receiptNumber) ?? []), order])
        return groups
      }, new Map())
      onUpdate([...receiptGroups.entries()]
        .map(([receiptNumber, orders]) => summarizeReceipt(receiptNumber, orders))
        .sort((first, second) => timeValue(second.paidAt) - timeValue(first.paidAt)))
    },
    onError,
  )
}
