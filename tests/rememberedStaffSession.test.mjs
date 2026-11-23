import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRememberedStaffStorage, listRememberedStaffSessions, selectRememberedStaffSession, STAFF_IDLE_LIMIT, watchStaffActivity } from '../src/utils/rememberedStaffSession.js'

function storage() {
  const map = new Map()
  return { get length() { return map.size }, key: index => [...map.keys()][index] ?? null, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) }
}
const key = session => `dineos-staff-session-${session.tabId}`
function fixture() {
  const durable = storage()
  let time = 1800000000000, serial = 0
  const open = (tab = storage(), forceNew = false) => createRememberedStaffStorage({ getStorage: () => tab, getPersistentStorage: () => durable, now: () => time, createId: () => `slot-${++serial}`, forceNew })
  const login = (role, tab = storage()) => {
    const session = open(tab, true)
    session.storage.setItem(key(session), `test-${role}`)
    session.saveProfile({ id: role, role, displayName: role })
    return session
  }
  return { durable, open, login, now: () => time, advance: ms => { time += ms } }
}

test('closing and reopening restores the sole saved session without copying rotating tokens', () => {
  const f = fixture(), first = f.login('admin')
  f.advance(3 * 86400000)
  const reopened = f.open()
  assert.equal(reopened.tabId, first.tabId)
  assert.equal(reopened.storage.getItem(key(reopened)), 'test-admin')
  first.storage.setItem(key(first), 'refreshed')
  assert.equal(reopened.storage.getItem(key(reopened)), 'refreshed')
})

test('repeated password logins for one account do not create duplicate account choices', () => {
  const f = fixture()
  const old = f.login('admin')
  f.advance(1000)
  const recent = f.login('admin')
  assert.equal(listRememberedStaffSessions(f.durable, f.now()).length, 1)
  assert.equal(f.open().tabId, recent.tabId)
  assert.equal(old.storage.getItem(key(old)), 'test-admin', 'existing independent tab is not deleted')
})

test('separate employee accounts require a choice and never overwrite/sign out each other', () => {
  const f = fixture(), admin = f.login('admin'), cashier = f.login('cashier')
  const newTab = storage(), blank = f.open(newTab)
  assert.equal(blank.storage.getItem(key(blank)), null)
  const saved = listRememberedStaffSessions(f.durable, f.now())
  assert.deepEqual(saved.map(item => item.role).sort(), ['admin', 'cashier'])
  assert(saved.every(item => !Object.keys(item).some(name => /token|password|session/i.test(name))))
  assert(selectRememberedStaffSession(cashier.tabId, { store: f.durable, tab: newTab, now: f.now() }))
  const resumed = f.open(newTab)
  assert.equal(resumed.storage.getItem(key(resumed)), 'test-cashier')
  // Explicitly signing in on that tab creates a third independent SDK key.
  const kitchen = f.login('kitchen', newTab)
  assert.notEqual(kitchen.tabId, resumed.tabId)
  assert.equal(resumed.storage.getItem(key(resumed)), 'test-cashier')
  kitchen.storage.removeItem(key(kitchen))
  assert.equal(admin.storage.getItem(key(admin)), 'test-admin')
  assert.equal(cashier.storage.getItem(key(cashier)), 'test-cashier')
})

test('background refresh cannot extend seven-day inactivity or resurrect expired/revoked slots', () => {
  const f = fixture(), session = f.login('admin')
  f.advance(STAFF_IDLE_LIMIT - 1)
  session.storage.setItem(key(session), 'new-token')
  assert.equal(session.storage.getItem(key(session)), 'new-token')
  f.advance(1)
  assert.equal(session.storage.getItem(key(session)), null)
  session.storage.setItem(key(session), 'late-response')
  assert.equal(session.storage.getItem(key(session)), null)
  assert.deepEqual(listRememberedStaffSessions(f.durable, f.now()), [])
  assert.equal(selectRememberedStaffSession(session.tabId, { store: f.durable, tab: storage(), now: f.now() }), null)
})

test('real activity extends only its own account, with an exact seven-day boundary', () => {
  const f = fixture(), active = f.login('admin'), idle = f.login('cashier')
  f.advance(6 * 86400000)
  active.touch()
  f.advance(86400000)
  assert.equal(idle.expired(), true)
  assert.equal(active.expired(), false)
  f.advance(6 * 86400000)
  assert.equal(active.expired(), true)
})

test('legacy same-tab session migrates once and a deleted slot cannot fall back to legacy credentials', () => {
  const f = fixture(), tab = storage()
  tab.setItem('dineos-auth-tab-id', 'legacy')
  tab.setItem('dineos-staff-session-legacy', 'legacy-token')
  const session = f.open(tab)
  assert.equal(session.storage.getItem(key(session)), 'legacy-token')
  assert.equal(tab.getItem(key(session)), null)
  session.storage.removeItem(key(session))
  assert.equal(f.open(tab).storage.getItem(key(session)), null)
})

test('blocked storage stays isolated and a denial mid-session keeps updated credentials in memory', () => {
  const f = fixture(), denied = () => { throw new Error('Denied') }
  const first = createRememberedStaffStorage({ getStorage: denied, getPersistentStorage: () => f.durable, createId: () => 'one' })
  const second = createRememberedStaffStorage({ getStorage: denied, getPersistentStorage: () => f.durable, createId: () => 'two' })
  first.storage.setItem(key(first), 'test-only')
  assert.equal(second.storage.getItem(key(second)), null)
  assert.equal(first.persistent, false)
  const normal = f.login('staff')
  f.durable.setItem = denied
  normal.storage.setItem(key(normal), 'refreshed-in-memory')
  assert.equal(normal.storage.getItem(key(normal)), 'refreshed-in-memory')
})

test('only visible trusted staff activity extends idle retention; background checks expire and detach', () => {
  const f = fixture(), session = f.login('admin')
  const events = new Map(), docs = new Map()
  let tick, expired = 0, cancelled = false
  const target = { location: { pathname: '/admin/dashboard' }, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) }
  const documentTarget = { visibilityState: 'visible', addEventListener: (name, fn) => docs.set(name, fn), removeEventListener: name => docs.delete(name) }
  const stop = watchStaffActivity(() => session, () => { expired++ }, { target, documentTarget, now: f.now, interval: fn => { tick = fn; return 1 }, cancel: () => { cancelled = true } })
  const stampKey = `${key(session)}:activity`, initial = f.durable.getItem(stampKey)
  f.advance(86400000); tick()
  assert.equal(f.durable.getItem(stampKey), initial)
  events.get('pointerdown')({ isTrusted: false })
  assert.equal(f.durable.getItem(stampKey), initial)
  documentTarget.visibilityState = 'hidden'
  events.get('keydown')({ isTrusted: true })
  assert.equal(f.durable.getItem(stampKey), initial)
  documentTarget.visibilityState = 'visible'
  target.location.pathname = '/menu'
  events.get('scroll')({ isTrusted: true })
  assert.equal(f.durable.getItem(stampKey), initial)
  target.location.pathname = '/cashier'
  events.get('pointerdown')({ isTrusted: true })
  assert.equal(Number(f.durable.getItem(stampKey)), f.now())
  f.advance(STAFF_IDLE_LIMIT); docs.get('visibilitychange')()
  assert.equal(expired, 1)
  assert.equal(session.storage.getItem(key(session)), null)
  stop(); assert.equal(events.size, 0); assert.equal(docs.size, 0); assert(cancelled)
})
