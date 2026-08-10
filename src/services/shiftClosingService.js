import { addDoc, collection, getDocs, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

const ordersCollection = collection(db, 'orders')
const closingsCollection = collection(db, 'shiftClosings')

function sameLocalDay(timestamp, date = new Date()) {
  const value = timestamp?.toDate?.()
  return value && value.getFullYear() === date.getFullYear() && value.getMonth() === date.getMonth() && value.getDate() === date.getDate()
}

function datePrefix(date = new Date()) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
}

export function subscribeToTodayPaidOrders(onUpdate, onError) {
  return onSnapshot(query(ordersCollection), (snapshot) => onUpdate(snapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .filter((order) => order.paymentStatus === 'paid' && sameLocalDay(order.paidAt))), onError)
}

export function subscribeToTodayOrderStatuses(onUpdate, onError) {
  return onSnapshot(query(ordersCollection), (snapshot) => onUpdate(snapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .filter((order) => sameLocalDay(order.createdAt))), onError)
}

export function subscribeToShiftClosings(onUpdate, onError) {
  return onSnapshot(query(closingsCollection, orderBy('closedAt', 'desc')), (snapshot) => onUpdate(snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))), onError)
}

export function subscribeToShiftClosing(closingId, onUpdate, onError) {
  return onSnapshot(query(closingsCollection, orderBy('closedAt', 'desc')), (snapshot) => {
    const closing = snapshot.docs.map((document) => ({ id: document.id, ...document.data() })).find((item) => item.closingId === closingId) ?? null
    onUpdate(closing)
  }, onError)
}

export async function createShiftClosing({ cashierId, cashierName, summary, shiftStartTime }) {
  const prefix = datePrefix()
  const existingClosings = await getDocs(closingsCollection)
  const todaysClosings = existingClosings.docs.filter((document) => document.data().closingId?.startsWith(`CL-${prefix}-`)).length
  const closingId = `CL-${prefix}-${String(todaysClosings + 1).padStart(4, '0')}`
  await addDoc(closingsCollection, {
    closingId,
    cashierId,
    cashierName,
    shiftStartTime,
    closedAt: serverTimestamp(),
    cash: summary.cash,
    card: summary.card,
    touchNGo: summary.touchNGo,
    grabPay: summary.grabPay,
    fpx: summary.fpx,
    other: summary.other,
    grandTotal: summary.grandTotal,
    transactionCount: summary.transactionCount,
    averageBill: summary.averageBill,
    highestBill: summary.highestBill,
    lowestBill: summary.lowestBill,
  })
  return closingId
}
