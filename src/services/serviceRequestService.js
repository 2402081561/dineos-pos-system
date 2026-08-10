import { addDoc, collection, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { db } from './firebase'

const serviceRequestsCollection = collection(db, 'serviceRequests')

export async function createServiceRequest(requestType, session, details = {}) {
  const customerRequests = await getDocs(query(
    serviceRequestsCollection,
    where('sessionId', '==', session.sessionId),
  ))
  const existingRequest = customerRequests.docs.find((request) => {
    const requestData = request.data()
    return requestData.status === 'pending' && requestData.requestType === requestType
  })

  if (existingRequest) return { duplicate: true, id: existingRequest.id }

  const requestReference = await addDoc(serviceRequestsCollection, {
    orderId: null,
    tableId: session.tableNumber,
    tableNumber: session.tableNumber,
    sessionId: session.sessionId,
    customerNickname: session.customerNickname,
    requestType,
    ...details,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return { duplicate: false, id: requestReference.id }
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
  await runTransaction(db, async (transaction) => {
    const requestReference = doc(db, 'serviceRequests', requestId)
    const requestSnapshot = await transaction.get(requestReference)
    if (!requestSnapshot.exists()) throw new Error('This service request is no longer available.')
    if (requestSnapshot.data().status !== 'pending') throw new Error('This service request was already completed by another staff user.')

    transaction.update(requestReference, {
      status: 'completed',
      updatedAt: serverTimestamp(),
    })
  })
}
