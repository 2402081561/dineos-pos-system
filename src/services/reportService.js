import { collection, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'

function mapSnapshot(snapshot) {
  return snapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .sort((first, second) => (second.createdAt?.toMillis?.() ?? 0) - (first.createdAt?.toMillis?.() ?? 0))
}

export function subscribeToReportOrders(onUpdate, onError) {
  return onSnapshot(collection(db, 'orders'), (snapshot) => onUpdate(mapSnapshot(snapshot)), onError)
}

export function subscribeToReportServiceRequests(onUpdate, onError) {
  return onSnapshot(collection(db, 'serviceRequests'), (snapshot) => onUpdate(mapSnapshot(snapshot)), onError)
}
