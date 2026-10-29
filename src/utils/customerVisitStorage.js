import { cartLineId } from './cartOrderType.js'

const sessionKey = 'dineos-customer-visit-v1'
const cartKey = 'dineos-customer-cart-v1'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const shortText = (value, max) => typeof value === 'string' && value.length <= max

export function sameCustomerVisit(first, second) {
  return Boolean(first?.sessionId && second?.sessionId && first.sessionId === second.sessionId && first.tableSessionId === second.tableSessionId)
}

function validSession(value) {
  if (!value || !uuid.test(value.sessionId) || !uuid.test(value.tableSessionId) || !/^[1-9]\d*$/.test(String(value.tableNumber)) || !shortText(value.customerNickname, 80)) return null
  return {
    sessionId: value.sessionId, tableSessionId: value.tableSessionId,
    tableNumber: String(value.tableNumber), customerNickname: value.customerNickname,
    isSharedTable: value.isSharedTable === true,
    ...(uuid.test(value.memberId) ? { memberId: value.memberId } : {}),
  }
}

function validItems(items) {
  if (!Array.isArray(items) || items.length > 30) return null
  const ids = new Set(), rowIds = new Set()
  const result = []
  for (const item of items) {
    if (!item || !shortText(item.menuItemId, 100) || !item.menuItemId || !shortText(item.name, 300) || !shortText(item.specialInstructions ?? '', 300) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0 || !['dine_in', 'take_away'].includes(item.orderType) || !Array.isArray(item.selections) || item.selections.length > 10) return null
    const selections = []
    const groups = new Set()
    for (const selection of item.selections) {
      if (!shortText(selection?.groupId, 64) || !selection.groupId || groups.has(selection.groupId) || !Array.isArray(selection.optionIds) || selection.optionIds.length > 20 || selection.optionIds.some((id) => !shortText(id, 64) || !id) || new Set(selection.optionIds).size !== selection.optionIds.length) return null
      groups.add(selection.groupId)
      selections.push({ groupId: selection.groupId, optionIds: [...selection.optionIds] })
    }
    const cartItemId = cartLineId(item.menuItemId, item.specialInstructions ?? '', selections, item.orderType)
    if (ids.has(cartItemId) || !shortText(item.cartRowId, 200) || !item.cartRowId || rowIds.has(item.cartRowId)) return null
    ids.add(cartItemId); rowIds.add(item.cartRowId)
    result.push({ cartItemId, cartRowId: item.cartRowId, menuItemId: item.menuItemId, name: item.name, imageUrl: shortText(item.imageUrl, 2000) ? item.imageUrl : '', unitPrice: item.unitPrice, quantity: item.quantity, orderType: item.orderType, specialInstructions: item.specialInstructions ?? '', selections })
  }
  return result
}

export function emptyCustomerDraft(session) {
  return { sessionId: session?.sessionId ?? '', tableSessionId: session?.tableSessionId ?? '', items: [], orderRequest: null }
}

// Use only fields sent to the API. Display names, current price/revision, and
// object key order must not mint a new request after an uncertain submission.
export function customerOrderFingerprint(items, session) {
  return JSON.stringify([session.sessionId, session.tableSessionId, items.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity, orderType: item.orderType ?? 'dine_in', notes: item.specialInstructions ?? '', selections: item.selections ?? [] }))])
}

export function createCustomerVisitStorage({ getStorage = () => window.sessionStorage } = {}) {
  const memory = new Map()
  let storageFailed = false
  function read(key) {
    try { if (!storageFailed) {
      const value = getStorage().getItem(key)
      if (value === null) memory.delete(key); else memory.set(key, value)
    } } catch { storageFailed = true }
    try { return JSON.parse(memory.get(key) ?? 'null') } catch { return null }
  }
  function write(key, value) {
    const serialized = JSON.stringify(value)
    memory.set(key, serialized)
    try { if (!storageFailed) getStorage().setItem(key, serialized) } catch { storageFailed = true }
  }
  function remove(key) {
    memory.delete(key)
    try { if (!storageFailed) getStorage().removeItem(key) } catch { storageFailed = true }
  }
  return {
    readSession() {
      const record = read(sessionKey)
      const session = record?.version === 1 ? validSession(record.session) : null
      if (!session) { remove(sessionKey); remove(cartKey) }
      return session
    },
    saveSession(session) {
      const safe = validSession(session)
      if (!safe) return
      const previous = read(sessionKey)?.session
      if (!sameCustomerVisit(previous, safe)) {
        // Only an API-verified merge can rebase a cart. A normal new visit still
        // clears it. Retain the original uncertain request ID and frozen items.
        const draft = read(cartKey)
        if (previous?.sessionId === safe.sessionId && Array.isArray(session.previousTableSessionIds) && session.previousTableSessionIds.includes(previous.tableSessionId) && sameCustomerVisit(draft,previous) && validItems(draft.items)) {
          const items=validItems(draft.items)
          const old=draft.orderRequest
          const request=old && uuid.test(old.id) && old.signature===customerOrderFingerprint(items,previous) ? {...old,signature:customerOrderFingerprint(items,safe)} : null
          write(cartKey,{...draft,tableSessionId:safe.tableSessionId,items,orderRequest:request})
        } else remove(cartKey)
      }
      write(sessionKey, { version: 1, session: safe })
    },
    clearSession() { remove(sessionKey); remove(cartKey) },
    readDraft(session) {
      const record = read(cartKey)
      if (!session || record?.version !== 1 || !sameCustomerVisit(record, session)) return emptyCustomerDraft(session)
      const items = validItems(record.items)
      if (!items) { remove(cartKey); return emptyCustomerDraft(session) }
      const request = record.orderRequest
      const orderRequest = uuid.test(request?.id) && request?.signature === customerOrderFingerprint(items, session) ? { id: request.id, signature: request.signature, ...(Number.isInteger(request.settingsRevision) && request.settingsRevision >= 0 ? { settingsRevision: request.settingsRevision } : {}) } : null
      return { sessionId: session.sessionId, tableSessionId: session.tableSessionId, items, orderRequest }
    },
    saveDraft(session, draft) {
      if (!session || !sameCustomerVisit(session, draft)) return
      // Ignore a late action from an old page after leaving or changing tables.
      if (!sameCustomerVisit(read(sessionKey)?.session, session)) return
      if (!draft.items.length) { remove(cartKey); return }
      write(cartKey, { version: 1, ...draft })
    },
  }
}

export const customerVisitStorage = createCustomerVisitStorage()
