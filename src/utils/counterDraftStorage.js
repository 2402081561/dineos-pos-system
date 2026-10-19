const prefix = 'dineos-counter-draft-v1:'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const text = (value, max) => typeof value === 'string' && value.length <= max
const selectionsValid = (value) => Array.isArray(value) && value.length <= 10 && value.every((group) => text(group?.groupId, 64) && group.groupId && Array.isArray(group.optionIds) && group.optionIds.length <= 20 && group.optionIds.every((id) => text(id, 64) && id))

export function emptyCounterDraft(actorId, tableId = '') {
  return { actorId: actorId ?? '', tableId, customerNickname: '', cart: {}, request: null, recoveryRequired: false }
}
export function counterRequestPayload(draft, settingsRevision, tableSessionId) {
  return {
    tableId: draft.tableId,
    expectedTableSessionId: Object.hasOwn(draft, 'expectedTableSessionId') ? draft.expectedTableSessionId : tableSessionId,
    customerNickname: draft.customerNickname,
    items: Object.entries(draft.cart).map(([id, line]) => ({ menuItemId: line.menuItemId ?? id, quantity: line.quantity, orderType: line.orderType ?? 'dine_in', notes: line.notes ?? '', selections: line.selections ?? [] })),
    settingsRevision,
  }
}
function validDraft(value, actorId) {
  if (!value || value.actorId !== actorId || !text(value.tableId, 100) || !text(value.customerNickname, 80) || !value.cart || typeof value.cart !== 'object' || Array.isArray(value.cart) || Object.keys(value.cart).length > 30) return false
  if (Object.hasOwn(value, 'expectedTableSessionId') && value.expectedTableSessionId !== null && !text(value.expectedTableSessionId, 100)) return false
  return Object.entries(value.cart).every(([id, line]) => text(id, 20000) && line && text(line.menuItemId, 100) && line.menuItemId && Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 50 && ['dine_in', 'take_away'].includes(line.orderType) && text(line.notes, 500) && text(line.name, 300) && selectionsValid(line.selections))
}
function validRequest(draft) {
  const request = draft.request
  if (!request) return true
  if (!uuid.test(request.requestId) || !request.payload || !Number.isInteger(request.payload.settingsRevision) || request.payload.settingsRevision < 0 || !Object.hasOwn(request.payload, 'expectedTableSessionId')) return false
  const expected = counterRequestPayload(draft, request.payload.settingsRevision, request.payload.expectedTableSessionId)
  return JSON.stringify(expected) === JSON.stringify(request.payload) && Object.keys(draft.cart).length > 0
}

// One tab, one namespace per authenticated database user. No shared localStorage,
// auth credentials, prices or another cashier's draft are restored here.
export function createCounterDraftStorage({ getStorage = () => window.sessionStorage } = {}) {
  const memory = new Map()
  return {
    read(actorId, tableId = '') {
      const empty = emptyCounterDraft(actorId, tableId)
      if (!actorId) return empty
      const key = prefix + encodeURIComponent(actorId)
      let raw = memory.get(key)
      try { raw = getStorage().getItem(key); if (raw === null) memory.delete(key); else memory.set(key, raw) } catch { /* Keep this actor's in-memory copy only. */ }
      if (!raw) return empty
      try {
        const record = JSON.parse(raw)
        if (record.version !== 1 || !validDraft(record.draft, actorId) || !validRequest(record.draft)) throw new Error('Damaged draft')
        const draft = record.draft
        return { ...draft, recoveryRequired: false, request: draft.request ? { ...draft.request, uncertain: true } : null }
      } catch {
        // Never silently discard an unreadable pending request and mint a new ID.
        return { ...empty, recoveryRequired: true }
      }
    },
    save(actorId, draft) {
      if (!actorId || draft.actorId !== actorId) return false
      const key = prefix + encodeURIComponent(actorId), raw = JSON.stringify({ version: 1, draft })
      memory.set(key, raw)
      try { getStorage().setItem(key, raw); return true } catch { return false }
    },
  }
}
export const counterDraftStorage = createCounterDraftStorage()
