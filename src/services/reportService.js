import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from './firebase'

function mapSnapshot(snapshot) {
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))
}

export function subscribeToReportOrders(onUpdate, onError) {
  return onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snapshot) => onUpdate(mapSnapshot(snapshot)), onError)
}

export function subscribeToReportServiceRequests(onUpdate, onError) {
  return onSnapshot(query(collection(db, 'serviceRequests'), orderBy('createdAt', 'desc')), (snapshot) => onUpdate(mapSnapshot(snapshot)), onError)
}
