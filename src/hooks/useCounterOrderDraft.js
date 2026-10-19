import { useRef, useState } from 'react'
import { counterDraftStorage, counterRequestPayload, emptyCounterDraft } from '../utils/counterDraftStorage'

export default function useCounterOrderDraft(actorId, initialTableId = '') {
  const [stored, setStored] = useState(() => counterDraftStorage.read(actorId, initialTableId))
  const ref = useRef(stored)
  const current = stored.actorId === (actorId ?? '') ? stored : counterDraftStorage.read(actorId, initialTableId)
  const [storageWarning, setStorageWarning] = useState(false)
  function latest() { return ref.current.actorId === (actorId ?? '') ? ref.current : current }
  function save(next) {
    if (!actorId) return false
    const persisted = counterDraftStorage.save(actorId, next)
    ref.current = next
    setStored(next)
    setStorageWarning(!persisted)
    return persisted
  }
  function updateDraft(update) {
    const draft = latest()
    if (!actorId || draft.request || draft.recoveryRequired) return false
    save(typeof update === 'function' ? update(draft) : update)
    return true
  }
  function prepareRequest(settingsRevision, tableSessionId) {
    const draft = latest()
    if (!actorId || draft.recoveryRequired) throw new Error('Review your saved counter order before continuing.')
    const next = draft.request ? draft : { ...draft, request: { requestId: crypto.randomUUID(), payload: counterRequestPayload(draft, settingsRevision, tableSessionId), uncertain: false } }
    if (!save(next)) throw new Error('Your browser could not save this order safely. Enable session storage before sending.')
    return next.request
  }
  function markUncertain(id) {
    const draft = latest()
    if (draft.request?.requestId === id) save({ ...draft, request: { ...draft.request, uncertain: true } })
  }
  function rejectRequest(id) {
    const draft = latest()
    if (draft.request?.requestId === id && !draft.request.uncertain) save({ ...draft, request: null })
  }
  function completeRequest(id) {
    const draft = latest()
    if (draft.request?.requestId !== id) return false
    save({ ...emptyCounterDraft(actorId, draft.tableId), tableNumber: draft.tableNumber })
    return true
  }
  function discardDamagedDraft() {
    if (latest().recoveryRequired) save(emptyCounterDraft(actorId))
  }
  return { draft: current, isLocked: Boolean(current.request || current.recoveryRequired), storageWarning, updateDraft, prepareRequest, markUncertain, rejectRequest, completeRequest, discardDamagedDraft }
}
