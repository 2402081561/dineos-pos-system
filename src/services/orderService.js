import { addDoc, collection, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { db } from './firebase'

const ordersCollection = collection(db, 'orders')
export async function createOrder({ cartItems, session, subtotal, serviceCharge, sst, grandTotal }) {
  const order = {
    tableId: session.tableNumber,
    tableNumber: session.tableNumber,
    sessionId: session.sessionId,
    customerNickname: session.customerNickname,
    items: cartItems.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      price: item.unitPrice,
      quantity: item.quantity,
      notes: item.specialInstructions,
    })),
    subtotal,
    serviceCharge,
    sst,
    grandTotal,
    status: 'received',
    paymentStatus: 'pending',
    paymentMethod: null,
    paidAt: null,
    cashierId: null,
    receiptNumber: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  return addDoc(ordersCollection, order)
}

export function subscribeToCustomerOrders(session, onOrdersUpdate, onError) {
  if (!session?.sessionId) {
    onOrdersUpdate([])
    return () => {}
  }

  const latestOrderQuery = query(
    ordersCollection,
    where('sessionId', '==', session.sessionId),
  )

  return onSnapshot(
    latestOrderQuery,
    (snapshot) => {
      const orders = snapshot.docs
        .map((order) => ({ id: order.id, ...order.data() }))
        .sort((firstOrder, secondOrder) => (secondOrder.createdAt?.toMillis?.() ?? 0) - (firstOrder.createdAt?.toMillis?.() ?? 0))
      onOrdersUpdate(orders)
    },
    onError,
  )
}

export function subscribeToLatestCustomerOrder(session, onOrderUpdate, onError) {
  return subscribeToCustomerOrders(
    session,
    (orders) => onOrderUpdate(orders[0] ?? null),
    onError,
  )
}

export function subscribeToActiveKitchenOrders(onOrdersUpdate, onError) {
  const activeOrdersQuery = query(
    ordersCollection,
    where('status', 'in', ['received', 'preparing', 'ready']),
  )

  return onSnapshot(
    activeOrdersQuery,
    (snapshot) => {
      const orders = snapshot.docs
        .map((order) => ({ id: order.id, ...order.data() }))
        .sort((firstOrder, secondOrder) => {
          const firstTime = firstOrder.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
          const secondTime = secondOrder.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
          return firstTime - secondTime
        })

      onOrdersUpdate(orders)
    },
    onError,
  )
}

const nextKitchenStatuses = {
  received: 'preparing',
  preparing: 'ready',
  ready: 'served',
}

export async function updateOrderStatus(orderId, status, expectedStatus) {
  const normalizedExpectedStatus = String(expectedStatus ?? '').toLowerCase()
  const normalizedNextStatus = String(status ?? '').toLowerCase()

  if (nextKitchenStatuses[normalizedExpectedStatus] !== normalizedNextStatus) {
    throw new Error('This status update is not valid.')
  }

  await runTransaction(db, async (transaction) => {
    const orderReference = doc(db, 'orders', orderId)
    const orderSnapshot = await transaction.get(orderReference)
    if (!orderSnapshot.exists()) throw new Error('This order is no longer available.')

    const currentStatus = String(orderSnapshot.data().status ?? '').toLowerCase()
    if (currentStatus !== normalizedExpectedStatus) {
      throw new Error('This order was updated by another kitchen user.')
    }

    transaction.update(orderReference, {
      status: normalizedNextStatus,
      updatedAt: serverTimestamp(),
    })
  })
}

export function subscribeToPendingPaymentOrders(onOrdersUpdate, onError) {
  return onSnapshot(
    query(ordersCollection, where('status', '==', 'served')),
    (snapshot) => onOrdersUpdate(snapshot.docs
      .map((order) => ({ id: order.id, ...order.data() }))
      .filter((order) => String(order.paymentStatus ?? 'pending').toLowerCase() !== 'paid')),
    onError,
  )
}

function receiptDatePrefix(date = new Date()) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
}

function isPaidToday(order, prefix) {
  const paidDate = order.paidAt?.toDate?.()
  return order.paymentStatus === 'paid' && paidDate && receiptDatePrefix(paidDate) === prefix
}

async function generateReceiptNumber() {
  const prefix = receiptDatePrefix()
  const snapshot = await getDocs(query(ordersCollection, where('paymentStatus', '==', 'paid')))
  const receiptNumbers = new Set(snapshot.docs
    .map((order) => order.data())
    .filter((order) => isPaidToday(order, prefix))
    .map((order) => order.receiptNumber)
    .filter(Boolean))

  return `R-${prefix}-${String(receiptNumbers.size + 1).padStart(4, '0')}`
}

export async function completeTablePayment({ cashierId, orders, paymentMethod }) {
  const unpaidOrders = orders.filter((order) => String(order.paymentStatus ?? 'pending').toLowerCase() !== 'paid')
  if (unpaidOrders.length === 0) throw new Error('This table does not have any unpaid orders.')

  const receiptNumber = await generateReceiptNumber()
  const batch = writeBatch(db)
  unpaidOrders.forEach((order) => {
    batch.update(doc(db, 'orders', order.id), {
      paymentStatus: 'paid',
      paymentMethod,
      paidAt: serverTimestamp(),
      cashierId,
      receiptNumber,
      updatedAt: serverTimestamp(),
    })
  })
  await batch.commit()
  return receiptNumber
}
