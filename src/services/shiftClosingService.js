import { collection, doc, getDocs, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { db } from './firebase'
import { logAuditEvent } from './auditLogService'

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

const methodKeys = { Cash: 'cash', 'Credit/Debit Card': 'card', "Touch 'n Go": 'touchNGo', GrabPay: 'grabPay', FPX: 'fpx', Other: 'other' }

function summarizePaidOrders(orders) {
  const breakdown = { cash: 0, card: 0, touchNGo: 0, grabPay: 0, fpx: 0, other: 0 }
  const bills = orders.map((order) => Math.max(0, Number(order.grandTotal) || 0))
  orders.forEach((order, index) => { breakdown[methodKeys[order.paymentMethod] ?? 'other'] += bills[index] })
  const grandTotal = Object.values(breakdown).reduce((sum, amount) => sum + amount, 0)
  return { ...breakdown, grandTotal, transactionCount: orders.length, averageBill: orders.length ? grandTotal / orders.length : 0, highestBill: bills.length ? Math.max(...bills) : 0, lowestBill: bills.length ? Math.min(...bills) : 0 }
}

function legacyClosingSequence(snapshot, prefix) {
  const expression = new RegExp(`^CL-${prefix}-(\\d+)$`)
  return snapshot.docs.reduce((highest, document) => {
    const match = String(document.data().closingId ?? '').match(expression)
    return match ? Math.max(highest, Number(match[1]) || 0) : highest
  }, 0)
}

export async function createShiftClosing({ cashierId, cashierName, shiftStartTime }) {
  if (!cashierId) throw new Error('A cashier is required to close a shift.')
  const prefix = datePrefix()
  const closingReference = doc(db, 'shiftClosings', `daily-${prefix}`)
  const counterReference = doc(db, 'counters', `closing-${prefix}`)
  const [existingClosings, paidSnapshot] = await Promise.all([
    getDocs(closingsCollection),
    getDocs(query(ordersCollection, where('paymentStatus', '==', 'paid'))),
  ])
  if (existingClosings.docs.some((document) => document.data().shiftDate === prefix || document.data().closingId?.startsWith(`CL-${prefix}-`))) throw new Error('Today’s shift has already been closed.')
  const summary = summarizePaidOrders(paidSnapshot.docs.map((document) => document.data()).filter((order) => sameLocalDay(order.paidAt)))
  const legacySequence = legacyClosingSequence(existingClosings, prefix)
  const result = await runTransaction(db, async (transaction) => {
    if ((await transaction.get(closingReference)).exists()) throw new Error('This cashier shift has already been closed today.')
    const counterSnapshot = await transaction.get(counterReference)
    const sequence = (counterSnapshot.exists() ? Number(counterSnapshot.data().lastNumber) || 0 : legacySequence) + 1
    const closingId = `CL-${prefix}-${String(sequence).padStart(4, '0')}`
    transaction.set(counterReference, { lastNumber: sequence, updatedAt: serverTimestamp() }, { merge: true })
    transaction.set(closingReference, { closingId, cashierId, cashierName: cashierName || 'Cashier', shiftStartTime, shiftDate: prefix, closedAt: serverTimestamp(), ...summary })
    return { closingId, summary }
  })
  void logAuditEvent({ action: 'CLOSE_SHIFT', category: 'CASHIER', targetType: 'shiftClosing', targetId: result.closingId, details: { grandTotal: result.summary.grandTotal, transactionCount: result.summary.transactionCount } })
  return result
}
