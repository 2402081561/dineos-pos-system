import { createTabAuthStorage } from './authStorage.js'

export const STAFF_IDLE_LIMIT = 7 * 24 * 60 * 60 * 1000
const prefix = 'dineos-staff-session-'
const tabKey = 'dineos-auth-tab-id'
const roles = ['admin', 'cashier', 'kitchen', 'staff']
const usable = (stamp, now) => Number.isFinite(stamp) && stamp > 0 && now >= stamp - 300000 && now - stamp < STAFF_IDLE_LIMIT

// Each account session has its own SDK storage/lock/BroadcastChannel key. Never
// copy a refresh token into a second key: rotation must stay coordinated.
export function listRememberedStaffSessions(store = window.localStorage, now = Date.now()) {
  try {
    const sessions = new Map()
    const keys = Array.from({ length: store.length }, (_, index) => store.key(index))
    for (const key of keys) {
      if (!key?.startsWith(prefix) || !key.endsWith(':profile')) continue
      const base = key.slice(0, -8)
      if (store.getItem(`${base}:retired`) || !usable(Number(store.getItem(`${base}:activity`)), now)) {
        store.setItem(`${base}:retired`, '1')
        for (const suffix of ['', ':activity', ':profile']) store.removeItem(base + suffix)
        continue
      }
      if (!store.getItem(base)) continue
      try {
        const profile = JSON.parse(store.getItem(key))
        if (typeof profile.id !== 'string' || !roles.includes(profile.role)) continue
        const record = { slot: base.slice(prefix.length), name: String(profile.name || profile.role).slice(0, 120), role: profile.role, lastActivity: Number(store.getItem(`${base}:activity`)) }
        if (!sessions.has(profile.id) || sessions.get(profile.id).lastActivity <= record.lastActivity) sessions.set(profile.id, record)
      } catch { /* A corrupt label is not a recoverable account. */ }
    }
    return [...sessions.values()].sort((a, b) => b.lastActivity - a.lastActivity)
  } catch { return [] }
}

export function createRememberedStaffStorage({ getStorage = () => window.sessionStorage, getPersistentStorage = () => window.localStorage, createId = () => crypto.randomUUID(), now = Date.now, forceNew = false } = {}) {
  let tab, durable
  try { tab = getStorage(); tab.getItem(tabKey) } catch { tab = null }
  const fallback = () => {
    const base = createTabAuthStorage({ getStorage, createId })
    const baseKey = `${prefix}${base.tabId}`
    let activity = now(), retired = false
    const expired = () => {
      if (!retired && base.storage.getItem(baseKey) && !usable(activity, now())) { retired = true; base.storage.removeItem(baseKey) }
      return retired
    }
    return { ...base, persistent: false, expired, saveProfile() {},
      touch() { if (!expired() && base.storage.getItem(baseKey)) activity = now() },
      storage: {
        getItem(name) { return name === baseKey && expired() ? null : base.storage.getItem(name) },
        setItem(name, value) { if (name !== baseKey || !expired()) base.storage.setItem(name, value) },
        removeItem(name) { if (name === baseKey) retired = true; base.storage.removeItem(name) },
      },
    }
  }
  try {
    if (tab) {
      durable = getPersistentStorage()
      const probe = `${prefix}probe-${createId()}`
      durable.setItem(probe, '1'); durable.removeItem(probe)
    }
  } catch { durable = null }
  if (!durable) {
    if (forceNew) { try { tab?.removeItem(tabKey) } catch { /* isolated memory remains available */ } }
    return fallback()
  }
  let id = forceNew ? null : tab.getItem(tabKey)
  if (!id && !forceNew) {
    const saved = listRememberedStaffSessions(durable, now())
    // Several identities require an explicit choice; never guess an employee.
    if (saved.length === 1) id = saved[0].slot
  }
  id ||= createId()
  try { tab.setItem(tabKey, id) } catch { return fallback() }
  const key = `${prefix}${id}`
  const memory = new Map()
  let retired = false
  const read = name => {
    if (durable) {
      try {
        const value = durable.getItem(name)
        if (value === null) memory.delete(name)
        else memory.set(name, value)
        return value
      } catch { durable = null }
    }
    return memory.get(name) ?? null
  }
  const write = (name, value) => { memory.set(name, String(value)); try { durable?.setItem(name, String(value)) } catch { durable = null } }
  const remove = name => { memory.delete(name); try { durable?.removeItem(name) } catch { durable = null } }
  const retire = () => {
    retired = true
    try { write(`${key}:retired`, '1') } catch { /* Keep in-memory tombstone. */ }
    for (const suffix of ['', ':activity', ':profile']) remove(key + suffix)
    try { tab.removeItem(key) } catch { /* Legacy copy must not be used again. */ }
  }
  const expired = () => {
    if (retired || read(`${key}:retired`)) { retired = true; return true }
    if (read(key) && !usable(Number(read(`${key}:activity`)), now())) { retire(); return true }
    return false
  }
  // Migrate only this tab's legacy session, once. It stays under the same SDK
  // key so existing refresh-token coordination and actor identity are retained.
  if (!forceNew && !read(key) && !read(`${key}:retired`)) {
    const legacy = tab.getItem(key)
    if (legacy) {
      try { write(`${key}:activity`, now()); write(key, legacy); tab.removeItem(key) }
      catch { return fallback() }
    }
  }
  return {
    tabId: id, persistent: true, expired,
    storage: {
      getItem(name) {
        if (name !== key) return read(name)
        return expired() ? null : read(key)
      },
      setItem(name, value) {
        if (name !== key) { try { write(name, value) } catch { memory.set(name, String(value)) }; return }
        if (expired()) return // Late refresh responses cannot resurrect a retired session.
        if (!read(key)) { try { write(`${key}:activity`, now()) } catch { memory.set(`${key}:activity`, String(now())) } }
        try { write(key, value) } catch { memory.set(key, String(value)) }
      },
      removeItem(name) { if (name === key) retire(); else remove(name) },
    },
    touch() {
      if (expired() || !read(key)) return
      // Only explicit visible use calls this, never token refresh or API polling.
      try { write(`${key}:activity`, now()) } catch { memory.set(`${key}:activity`, String(now())) }
    },
    saveProfile(user) {
      if (expired() || !read(key) || !roles.includes(user?.role)) return
      try { write(`${key}:profile`, JSON.stringify({ id: user.id, role: user.role, name: user.displayName || user.email || user.role })) } catch { /* Persistence is optional. */ }
    },
  }
}

export function selectRememberedStaffSession(slot, { store = window.localStorage, tab = window.sessionStorage, now = Date.now() } = {}) {
  const saved = listRememberedStaffSessions(store, now).find(item => item.slot === slot)
  if (!saved) return null
  tab.setItem(tabKey, saved.slot)
  return saved // Profile is a navigation hint, NOT authorization; /me still verifies it.
}

export function watchStaffActivity(getSession, onExpired, { target = window, documentTarget = document, now = Date.now, interval = setInterval, cancel = clearInterval } = {}) {
  let lastWrite = 0
  const check = (activity = false) => {
    const session = getSession()
    if (session.expired()) { onExpired(); return }
    const staffPage = /^\/(admin|cashier|kitchen|staff)(?:\/|$)/.test(target.location?.pathname || '')
    if (activity && staffPage && documentTarget.visibilityState === 'visible' && now() - lastWrite >= 30000) {
      session.touch(); lastWrite = now()
    }
  }
  const activity = event => { if (event.isTrusted) check(true) }
  const visibility = () => check(documentTarget.visibilityState === 'visible')
  for (const event of ['pointerdown', 'keydown', 'scroll']) target.addEventListener(event, activity, { passive: true })
  documentTarget.addEventListener('visibilitychange', visibility)
  const timer = interval(() => check(), 30000)
  check(documentTarget.visibilityState === 'visible')
  return () => {
    cancel(timer)
    for (const event of ['pointerdown', 'keydown', 'scroll']) target.removeEventListener(event, activity)
    documentTarget.removeEventListener('visibilitychange', visibility)
  }
}
