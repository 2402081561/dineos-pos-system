import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { logAuditEvent } from './auditLogService'

const tablesCollection = collection(db, 'tables')
const tableNumberLocksCollection = collection(db, 'tableNumberLocks')
const activeOrderStatuses = new Set(['received', 'preparing', 'ready', 'served'])

function buildTableData(table) {
  const tableNumber = Number(table.tableNumber)
  const capacity = Number(table.capacity)
  if (!Number.isInteger(tableNumber) || tableNumber < 1) throw new Error('Table number must be a positive whole number.')
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Capacity must be a positive whole number.')
  return {
    tableNumber,
    capacity,
    isActive: Boolean(table.isActive),
  }
}

export function subscribeToTables(onTablesUpdate, onError) {
  return onSnapshot(
    query(tablesCollection, orderBy('tableNumber', 'asc')),
    (snapshot) => onTablesUpdate(snapshot.docs.map((table) => ({ id: table.id, ...table.data() }))),
    onError,
  )
}

export function subscribeToTableOperations(onUpdate, onError) {
  const sourceData = { tables: null, orders: null, tableSessions: null }
  const notify = () => onUpdate(sourceData)
  return [
    subscribeToTables((tables) => { sourceData.tables = tables; notify() }, onError),
    onSnapshot(collection(db, 'orders'), (snapshot) => {
      sourceData.orders = snapshot.docs.map((order) => ({ id: order.id, ...order.data() }))
      notify()
    }, onError),
    onSnapshot(collection(db, 'tableSessions'), (snapshot) => {
      sourceData.tableSessions = snapshot.docs.map((tableSession) => ({ id: tableSession.id, ...tableSession.data() }))
      notify()
    }, onError),
  ]
}

function hasBlockingOrder(order) {
  const status = String(order?.status ?? '').toLowerCase()
  const paymentStatus = String(order?.paymentStatus ?? 'pending').toLowerCase()
  return ['received', 'preparing', 'ready'].includes(status)
    || (status === 'served' && paymentStatus !== 'paid')
}

export async function clearCompletedTableSession(table) {
  if (!table?.id) throw new Error('This table is no longer available.')
  const tableNumber = String(table.tableNumber ?? '').trim()
  if (!tableNumber) throw new Error('This table has an invalid table number.')

  const ordersSnapshot = await getDocs(collection(db, 'orders'))
  const matchingOrderReferences = ordersSnapshot.docs
    .filter((order) => String(order.data().tableNumber ?? order.data().tableId ?? '').trim() === tableNumber)
    .map((order) => order.ref)
  const tableSessionReference = doc(db, 'tableSessions', `table-${tableNumber}`)

  await runTransaction(db, async (transaction) => {
    const [tableSnapshot, tableSessionSnapshot, ...orderSnapshots] = await Promise.all([
      transaction.get(doc(db, 'tables', table.id)),
      transaction.get(tableSessionReference),
      ...matchingOrderReferences.map((reference) => transaction.get(reference)),
    ])
    if (!tableSnapshot.exists()) throw new Error('This table is no longer available.')
    if (!tableSessionSnapshot.exists()) throw new Error('This table is already available.')

    const tableSession = tableSessionSnapshot.data()
    const participants = Array.isArray(tableSession.participants) ? tableSession.participants.filter((participant) => String(participant?.sessionId ?? '').trim()) : []
    if (tableSession.status !== 'completed' || participants.length > 0) {
      throw new Error('This table still has active participants and cannot be cleared.')
    }
    if (orderSnapshots.some((order) => order.exists() && hasBlockingOrder(order.data()))) {
      throw new Error('This table has active or unpaid orders and cannot be cleared.')
    }

    transaction.delete(tableSessionReference)
  })
  void logAuditEvent({ action: 'CLEAR_TABLE', category: 'ADMIN', targetType: 'table', targetId: table.id, tableNumber })
}

export async function getActiveTableByNumber(tableNumber) {
  const normalizedTableNumber = String(tableNumber ?? '').trim()
  if (!normalizedTableNumber) return null

  // Older manually created table documents may store the table number as text,
  // while tables created in the admin panel store it as a number. Comparing the
  // normalized display value keeps both formats usable during the migration.
  const snapshot = await getDocs(tablesCollection)
  const matchingDocument = snapshot.docs.find((tableDocument) => (
    String(tableDocument.data().tableNumber ?? '').trim() === normalizedTableNumber
  ))
  const table = matchingDocument ? { id: matchingDocument.id, ...matchingDocument.data() } : null
  return table?.isActive !== false ? table : null
}

export async function createTable(table) {
  const tableData = buildTableData(table)
  const tableReference = doc(tablesCollection)
  const lockReference = doc(tableNumberLocksCollection, String(tableData.tableNumber))
  const tablesSnapshot = await getDocs(tablesCollection)
  if (tablesSnapshot.docs.some((snapshot) => Number(snapshot.data().tableNumber) === tableData.tableNumber)) throw new Error('A table with this number already exists.')
  return runTransaction(db, async (transaction) => {
    const lockSnapshot = await transaction.get(lockReference)
    if (lockSnapshot.exists()) {
      throw new Error('A table with this number already exists.')
    }
    transaction.set(lockReference, { tableId: tableReference.id, tableNumber: tableData.tableNumber, updatedAt: serverTimestamp() })
    transaction.set(tableReference, { ...tableData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    return tableReference
  })
}

export async function updateTable(tableId, table) {
  const tableData = buildTableData(table)
  const tableReference = doc(db, 'tables', tableId)
  const lockReference = doc(tableNumberLocksCollection, String(tableData.tableNumber))
  const tablesSnapshot = await getDocs(tablesCollection)
  if (tablesSnapshot.docs.some((snapshot) => snapshot.id !== tableId && Number(snapshot.data().tableNumber) === tableData.tableNumber)) throw new Error('A table with this number already exists.')
  await runTransaction(db, async (transaction) => {
    const [tableSnapshot, lockSnapshot] = await Promise.all([transaction.get(tableReference), transaction.get(lockReference)])
    if (!tableSnapshot.exists()) throw new Error('This table is no longer available.')
    if (lockSnapshot.exists() && lockSnapshot.data().tableId !== tableId) {
      throw new Error('A table with this number already exists.')
    }
    const previousNumber = Number(tableSnapshot.data().tableNumber)
    if (previousNumber !== tableData.tableNumber) {
      const previousLockReference = doc(tableNumberLocksCollection, String(previousNumber))
      const previousLockSnapshot = await transaction.get(previousLockReference)
      if (previousLockSnapshot.data()?.tableId === tableId) transaction.delete(previousLockReference)
      transaction.set(lockReference, { tableId, tableNumber: tableData.tableNumber, updatedAt: serverTimestamp() })
    }
    transaction.update(tableReference, { ...tableData, updatedAt: serverTimestamp() })
  })
}

export async function deleteTable(table) {
  if (!table?.id) throw new Error('This table is no longer available.')

  const tableNumber = String(table.tableNumber ?? '').trim()
  const ordersSnapshot = await getDocs(collection(db, 'orders'))
  const hasActiveOrders = ordersSnapshot.docs.some((order) => {
    const data = order.data()
    const orderTable = String(data.tableNumber ?? data.tableId ?? '').trim()
    return (orderTable === tableNumber || String(data.tableId ?? '') === table.id)
      && activeOrderStatuses.has(String(data.status ?? '').toLowerCase())
      && String(data.paymentStatus ?? 'pending').toLowerCase() !== 'paid'
  })
  if (hasActiveOrders) throw new Error('This table currently has active or unpaid orders.')
  await runTransaction(db, async (transaction) => {
    const tableReference = doc(db, 'tables', table.id)
    if (!(await transaction.get(tableReference)).exists()) throw new Error('This table is no longer available.')

    const lockReference = doc(tableNumberLocksCollection, tableNumber)
    const lockSnapshot = await transaction.get(lockReference)
    if (lockSnapshot.data()?.tableId === table.id) transaction.delete(lockReference)
    transaction.delete(tableReference)
  })
}
