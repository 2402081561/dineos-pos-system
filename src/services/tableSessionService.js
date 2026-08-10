import { Timestamp, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

export async function joinTableSession({ customerNickname, sessionId, tableNumber }) {
  const normalizedTableNumber = String(tableNumber).trim()
  const participant = { sessionId, customerNickname, joinedAt: Timestamp.now() }
  const tableSessionReference = doc(db, 'tableSessions', `table-${normalizedTableNumber}`)

  return runTransaction(db, async (transaction) => {
    const tableSessionSnapshot = await transaction.get(tableSessionReference)

    if (tableSessionSnapshot.exists() && tableSessionSnapshot.data().status === 'active') {
      const currentParticipants = Array.isArray(tableSessionSnapshot.data().participants) ? tableSessionSnapshot.data().participants : []
      const hasJoined = currentParticipants.some((currentParticipant) => currentParticipant.sessionId === sessionId)
      if (!hasJoined) {
        transaction.update(tableSessionReference, {
          participants: [...currentParticipants, participant],
          updatedAt: serverTimestamp(),
        })
      }
      return { id: tableSessionSnapshot.id, ...tableSessionSnapshot.data(), participants: hasJoined ? currentParticipants : [...currentParticipants, participant] }
    }

    const tableSession = {
      tableNumber: normalizedTableNumber,
      status: 'active',
      participants: [participant],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    transaction.set(tableSessionReference, tableSession)
    return { id: tableSessionReference.id, ...tableSession }
  })
}

export async function leaveTableSession({ sessionId, tableSessionId }) {
  if (!tableSessionId || !sessionId) return

  await runTransaction(db, async (transaction) => {
    const tableSessionReference = doc(db, 'tableSessions', tableSessionId)
    const tableSessionSnapshot = await transaction.get(tableSessionReference)
    if (!tableSessionSnapshot.exists()) return

    const currentParticipants = Array.isArray(tableSessionSnapshot.data().participants) ? tableSessionSnapshot.data().participants : []
    const remainingParticipants = currentParticipants.filter((participant) => participant.sessionId !== sessionId)
    transaction.update(tableSessionReference, {
      participants: remainingParticipants,
      status: remainingParticipants.length === 0 ? 'completed' : 'active',
      updatedAt: serverTimestamp(),
    })
  })
}

export function subscribeToTableSession(tableSessionId, onSessionUpdate, onError) {
  if (!tableSessionId) {
    onSessionUpdate(null)
    return () => {}
  }

  return onSnapshot(
    doc(db, 'tableSessions', tableSessionId),
    (snapshot) => onSessionUpdate(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    onError,
  )
}
