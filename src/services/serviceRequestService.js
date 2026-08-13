import { collection, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { db } from './firebase'
import { logAuditEvent } from './auditLogService'

const serviceRequestsCollection = collection(db, 'serviceRequests')
const serviceRequestLocksCollection = collection(db, 'serviceRequestLocks')

export async function createServiceRequest(requestType, session, details = {}) {
  if (!session?.sessionId || !String(session.tableNumber ?? '').trim() || !String(session.customerNickname ?? '').trim() || !String(requestType ?? '').trim()) {
    throw new Error('An active table session is required to create a service request.')
  }
  const normalizedRequestType = String(requestType).trim()
  const lockReference = doc(serviceRequestLocksCollection, `${session.sessionId}-${normalizedRequestType}`)
  const requestReference = doc(serviceRequestsCollection)
  const customerRequests = await getDocs(query(serviceRequestsCollection, where('sessionId', '==', session.sessionId)))
  const existingRequest = customerRequests.docs.find((snapshot) => {
    const request = snapshot.data()
    return request.status === 'pending' && request.requestType === normalizedRequestType
  })
  if (existingRequest) return { duplicate: true, id: existingRequest.id }
  return runTransaction(db, async (transaction) => {
    const lockSnapshot = await transaction.get(lockReference)
    if (lockSnapshot.exists()) return { duplicate: true, id: lockSnapshot.data().requestId }

    transaction.set(lockReference, { requestId: requestReference.id, sessionId: session.sessionId, requestType: normalizedRequestType, updatedAt: serverTimestamp() })
    transaction.set(requestReference, {
      orderId: null,
      tableId: session.tableNumber,
      tableNumber: session.tableNumber,
      sessionId: session.sessionId,
      customerNickname: session.customerNickname,
      requestType: normalizedRequestType,
      ...details,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { duplicate: false, id: requestReference.id }
  })
}

export function subscribeToPendingServiceRequests(onRequestsUpdate, onError) {
  const pendingRequestsQuery = query(
    serviceRequestsCollection,
    where('status', '==', 'pending'),
  )

  return onSnapshot(
    pendingRequestsQuery,
    (snapshot) => {
      const requests = snapshot.docs
        .map((request) => ({ id: request.id, ...request.data() }))
        .sort((firstRequest, secondRequest) => {
          const firstTime = firstRequest.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
          const secondTime = secondRequest.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
          return firstTime - secondTime
        })

      onRequestsUpdate(requests)
    },
    onError,
  )
}

export async function completeServiceRequest(requestId) {
  let completedRequest = null
  await runTransaction(db, async (transaction) => {
    const requestReference = doc(db, 'serviceRequests', requestId)
    const requestSnapshot = await transaction.get(requestReference)
    if (!requestSnapshot.exists()) throw new Error('This service request is no longer available.')
    if (requestSnapshot.data().status !== 'pending') throw new Error('This service request was already completed by another staff user.')

    transaction.update(requestReference, {
      status: 'completed',
      updatedAt: serverTimestamp(),
    })
    const request = requestSnapshot.data()
    if (request.sessionId && request.requestType) transaction.delete(doc(serviceRequestLocksCollection, `${request.sessionId}-${request.requestType}`))
    completedRequest = request
  })
  void logAuditEvent({ action: 'COMPLETE_SERVICE_REQUEST', category: 'STAFF', targetType: 'serviceRequest', targetId: requestId, tableNumber: completedRequest?.tableNumber ?? completedRequest?.tableId, details: { requestType: completedRequest?.requestType } })
}
