import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCustomerVisitStorage, customerOrderFingerprint, emptyCustomerDraft } from '../src/utils/customerVisitStorage.js'
import { cartLineId } from '../src/utils/cartOrderType.js'
import { watchCustomerSession } from '../src/utils/customerSessionSubscription.js'

const session = { sessionId: '66b195a3-18e0-4f2d-a337-42797a0ba97f', tableSessionId: 'a98b5086-dff8-4aca-b8a7-f42459604745', tableNumber: '1', customerNickname: 'Shared Table', isSharedTable: true }
const next = { ...session, sessionId: '91d5ac84-8243-4caf-8672-180964979c59', tableSessionId: '5cf5273f-02fb-49d1-a40e-00a85648b5fa', tableNumber: '2' }
function browserStorage() {
  const values = new Map()
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
}
function items() {
  const selections = [{ groupId: 'spice', optionIds: ['less'] }]
  const specialInstructions = 'No onion'
  return [{ cartItemId: cartLineId('mee', specialInstructions, selections, 'take_away'), cartRowId: 'row-1', menuItemId: 'mee', name: 'Fried mee', quantity: 2, unitPrice: 9, orderType: 'take_away', specialInstructions, selections, imageUrl: '' }]
}
function draft(sessionValue = session) { return { ...emptyCustomerDraft(sessionValue), items: items() } }
const requestId = 'd01be883-6c4e-468a-9d22-1006dfe622b4'

test('a fresh page restores the same shared visit, quantities, notes, options and dining type without joining again', () => {
  const native = browserStorage()
  const firstPage = createCustomerVisitStorage({ getStorage: () => native })
  firstPage.saveSession(session)
  firstPage.saveDraft(session, draft())
  // New JS memory; only the browser tab survives the reload.
  const refreshed = createCustomerVisitStorage({ getStorage: () => native })
  assert.deepEqual(refreshed.readSession(), session)
  assert.deepEqual(refreshed.readDraft(refreshed.readSession()), draft())
  assert.equal(refreshed.readDraft(next).items.length, 0)
})

test('member association is retained in this tab but another browser tab starts empty', () => {
  const native = browserStorage()
  const cache = createCustomerVisitStorage({ getStorage: () => native })
  cache.saveSession({ ...session, isSharedTable: false, memberId: next.sessionId })
  assert.equal(createCustomerVisitStorage({ getStorage: () => native }).readSession().memberId, next.sessionId)
  assert.equal(createCustomerVisitStorage({ getStorage: browserStorage }).readSession(), null)
})

test('cleared visits and changed tables cannot carry drafts across visits or accept late writes', () => {
  const native = browserStorage()
  const cache = createCustomerVisitStorage({ getStorage: () => native })
  cache.saveSession(session); cache.saveDraft(session, draft())
  cache.saveSession({ ...session, customerNickname: 'JJ' })
  assert.equal(cache.readDraft(session).items.length, 1)
  cache.saveSession(next)
  assert.equal(cache.readDraft(next).items.length, 0)
  cache.saveDraft(next, draft(next))
  cache.saveDraft(session, { ...draft(), items: [] })
  assert.equal(cache.readDraft(next).items.length, 1)
  cache.clearSession()
  cache.saveDraft(next, draft(next))
  assert.equal(cache.readSession(), null)
  assert.deepEqual(cache.readDraft(next), emptyCustomerDraft(next))
})

test('successful submit or explicit clear synchronously removes the stored cart and request key', () => {
  const native = browserStorage()
  const cache = createCustomerVisitStorage({ getStorage: () => native })
  cache.saveSession(session)
  const initial = draft()
  initial.orderRequest = { id: requestId, signature: customerOrderFingerprint(initial.items, session) }
  cache.saveDraft(session, initial)
  cache.saveDraft(session, emptyCustomerDraft(session))
  const refreshed = createCustomerVisitStorage({ getStorage: () => native })
  assert.equal(refreshed.readDraft(session).items.length, 0)
  assert.equal(refreshed.readDraft(session).orderRequest, null)
  assert.deepEqual(refreshed.readSession(), session)
})

test('uncertain submissions preserve the API request ID across refresh, display changes and rate changes', () => {
  const native = browserStorage()
  const cache = createCustomerVisitStorage({ getStorage: () => native })
  cache.saveSession(session)
  const initial = draft()
  initial.orderRequest = { id: requestId, signature: customerOrderFingerprint(initial.items, session) }
  cache.saveDraft(session, initial)
  const restored = createCustomerVisitStorage({ getStorage: () => native }).readDraft(session)
  assert.equal(restored.orderRequest.id, requestId)
  assert.equal(customerOrderFingerprint(restored.items.map((item) => ({ ...item, unitPrice: 12, name: 'New display name' })), { ...session, customerNickname: 'JJ', settingsRevision: 20 }), initial.orderRequest.signature)
  cache.saveDraft(session, { ...restored, items: restored.items.map((item) => ({ ...item, quantity: 3 })) })
  assert.equal(cache.readDraft(session).orderRequest, null)
})

test('corrupt or oversized cache never crashes and cannot create a customer identity or invalid item lines', () => {
  const native = browserStorage()
  const cache = createCustomerVisitStorage({ getStorage: () => native })
  cache.saveSession(session)
  const key = [...native.values.keys()][0]
  for (const bad of ['not JSON', JSON.stringify({ version: 9, session }), JSON.stringify({ version: 1, session: { ...session, sessionId: 'bad' } })]) {
    native.setItem(key, bad)
    assert.equal(cache.readSession(), null)
  }
  for (const badItems of [Array(31).fill(items()[0]), [{ ...items()[0], quantity: 51 }], [{ ...items()[0], orderType: 'unknown' }], [{ ...items()[0], selections: [{ groupId: 'a', optionIds: ['x', 'x'] }] }]]) {
    cache.saveSession(session)
    cache.saveDraft(session, { ...draft(), items: badItems })
    assert.equal(cache.readDraft(session).items.length, 0)
  }
})

test('denied storage remains safe in memory and does not promise persistence after a page reload', () => {
  const getStorage = () => { throw new DOMException('Denied', 'SecurityError') }
  const cache = createCustomerVisitStorage({ getStorage })
  cache.saveSession(session); cache.saveDraft(session, draft())
  assert.deepEqual(cache.readSession(), session)
  assert.equal(cache.readDraft(session).items.length, 1)
  cache.clearSession()
  assert.equal(cache.readSession(), null)
  assert.equal(createCustomerVisitStorage({ getStorage }).readSession(), null)
})

test('restoration outages keep saved data; confirmed ended visit removes both session and cart', async () => {
  const native = browserStorage()
  const cache = createCustomerVisitStorage({ getStorage: () => native })
  cache.saveSession(session); cache.saveDraft(session, draft())
  let failure = new TypeError('Failed to fetch'), notices = 0
  const watcher = watchCustomerSession(async () => { throw failure }, () => assert.fail(), () => cache.clearSession(), { onUnavailable: () => { notices++ } })
  await watcher.refresh()
  assert.equal(notices, 1)
  assert.deepEqual(cache.readSession(), session)
  assert.equal(cache.readDraft(session).items.length, 1)
  failure = Object.assign(new Error('Ended'), { status: 401 })
  await watcher.refresh()
  assert.equal(cache.readSession(), null)
  assert.equal(cache.readDraft(session).items.length, 0)
})
