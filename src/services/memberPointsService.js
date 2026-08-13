import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from './firebase'

const transactions = collection(db, 'memberPointTransactions')

export function subscribeToMemberPointTransactions(memberId, onUpdate, onError) {
  const normalizedMemberId = String(memberId ?? '').trim().toUpperCase()
  if (!normalizedMemberId) { onUpdate([]); return () => {} }
  return onSnapshot(query(transactions, where('memberId', '==', normalizedMemberId), orderBy('createdAt', 'desc'), limit(50)), (snapshot) => onUpdate(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), onError)
}
