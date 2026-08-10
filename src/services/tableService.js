import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'

const tablesCollection = collection(db, 'tables')
const activeOrderStatuses = new Set(['received', 'preparing', 'ready'])

function buildTableData(table) {
  return {
    tableNumber: Number(table.tableNumber),
    capacity: Number(table.capacity),
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
  return addDoc(tablesCollection, {
    ...buildTableData(table),
    status: 'available',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateTable(tableId, table) {
  await updateDoc(doc(db, 'tables', tableId), {
    ...buildTableData(table),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteTable(tableId) {
  await deleteDoc(doc(db, 'tables', tableId))
}

export async function hasActiveOrdersForTable(tableId) {
  const snapshot = await getDocs(query(collection(db, 'orders'), where('tableId', '==', tableId)))
  return snapshot.docs.some((order) => activeOrderStatuses.has(String(order.data().status).toLowerCase()))
}
