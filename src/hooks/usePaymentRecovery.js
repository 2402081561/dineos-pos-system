import { useRef, useState } from 'react'
import { paymentRecoveryStorage, paymentRequestBody } from '../utils/paymentRecoveryStorage'

export default function usePaymentRecovery(actorId) {
  const [saved, setSaved] = useState(() => ({ actorId, pending: paymentRecoveryStorage.read(actorId) }))
  const currentActor = useRef(actorId)
  currentActor.current = actorId
  const pending = saved.actorId === actorId ? saved.pending : paymentRecoveryStorage.read(actorId)
  function start(confirmation, tableNumber) {
    const existing = paymentRecoveryStorage.read(actorId)
    if (existing) {
      setSaved({ actorId, pending: existing })
      if (existing.body?.requestId === confirmation.requestId) return existing.body
      throw new Error('Check the previous payment before starting another one. Refreshing does not create a new payment.')
    }
    const value = { actorId, body: paymentRequestBody(confirmation), tableNumber: String(tableNumber) }
    paymentRecoveryStorage.save(value)
    setSaved({ actorId, pending: value })
    return value.body
  }
  function clear() {
    if (currentActor.current !== actorId) return false
    paymentRecoveryStorage.clear(actorId)
    setSaved({ actorId, pending: null })
    return true
  }
  return { pending, start, clear, isCurrent: () => currentActor.current === actorId }
}
