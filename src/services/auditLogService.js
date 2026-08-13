import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'

const auditLogsCollection = collection(db, 'auditLogs')

function text(value, maximum = 160) {
  return String(value ?? '').trim().slice(0, maximum)
}

function safeDetails(details) {
  return Object.fromEntries(Object.entries(details ?? {}).flatMap(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [[key, typeof value === 'string' ? text(value, 240) : value]]
    return []
  }))
}

export async function logAuditEvent({ action, category, details, orderId, receiptNumber, tableNumber, targetId, targetType }) {
  try {
    const user = auth.currentUser
    await addDoc(auditLogsCollection, {
      action: text(action, 80),
      category: text(category, 80),
      ...(user?.uid ? { actorId: user.uid } : {}),
      ...(user?.displayName ? { actorName: text(user.displayName) } : {}),
      ...(targetType ? { targetType: text(targetType, 80) } : {}),
      ...(targetId ? { targetId: text(targetId) } : {}),
      ...(tableNumber !== undefined && tableNumber !== null ? { tableNumber: text(tableNumber, 40) } : {}),
      ...(orderId ? { orderId: text(orderId) } : {}),
      ...(receiptNumber ? { receiptNumber: text(receiptNumber) } : {}),
      details: safeDetails(details),
      createdAt: serverTimestamp(),
    })
    return true
  } catch (error) {
    console.error('[Audit Log] Failed to write audit event:', error)
    return false
  }
}

export function subscribeToAuditLogs(onUpdate, onError) {
  return onSnapshot(query(auditLogsCollection, orderBy('createdAt', 'desc'), limit(100)), (snapshot) => {
    onUpdate(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })))
  }, onError)
}
