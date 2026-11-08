import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import Module, { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import { watchPoll } from '../src/utils/pollSubscription.js'
import { watchCustomerSession } from '../src/utils/customerSessionSubscription.js'
import { createTabAuthStorage } from '../src/utils/authStorage.js'

function scheduler() {
  const timers = new Map()
  let id = 0
  return {
    options: { schedule(callback) { timers.set(++id, callback); return id }, cancel(key) { timers.delete(key) } },
    size: () => timers.size,
    tick() { const [key, callback] = timers.entries().next().value ?? []; timers.delete(key); return callback?.() },
  }
}

test('slow polling cannot overlap or reorder snapshots, and resumes after failures', async () => {
  const clock = scheduler(), events = [], errors = []
  let calls = 0, resolveFirst
  const watcher = watchPoll(() => {
    calls++
    if (calls === 1) return new Promise((resolve) => { resolveFirst = resolve })
    if (calls === 2) throw new Error('Offline')
    return { status: 'ready' }
  }, (data) => events.push(data), (error) => errors.push(error), clock.options)
  const first = watcher.refresh()
  await Promise.resolve()
  assert.equal(watcher.refresh(), first)
  assert.equal(clock.size(), 0)
  assert.equal(calls, 1)
  resolveFirst({ status: 'received' })
  await first
  await clock.tick()
  assert.equal(errors[0].message, 'Offline')
  await clock.tick()
  assert.deepEqual(events, [{ status: 'received' }, { status: 'ready' }])
  watcher.stop()
  assert.equal(clock.size(), 0)
})

test('post-mutation refresh aborts an obsolete request and publishes only a new snapshot', async () => {
  const clock = scheduler(), events = [], errors = []
  let reads = 0, oldSignal
  const watcher = watchPoll((signal) => {
    reads++
    if (reads === 1) {
      oldSignal = signal
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Obsolete read', 'AbortError')), { once: true }))
    }
    return { status: 'served' }
  }, (data) => events.push(data), (error) => errors.push(error), clock.options)
  await Promise.resolve()
  await watcher.refreshLatest()
  assert.equal(oldSignal.aborted, true)
  assert.deepEqual(events, [{ status: 'served' }])
  assert.deepEqual(errors, [])
  watcher.stop()
})

test('unmount or switching tables suppresses late successes and errors, including a queued initial read', async () => {
  for (const fail of [false, true]) {
    const clock = scheduler(), events = []
    let resolve, reject
    const watcher = watchPoll(() => new Promise((yes, no) => { resolve = yes; reject = no }), (data) => events.push(data), (error) => events.push(error), clock.options)
    const pending = watcher.refresh()
    await Promise.resolve()
    watcher.stop()
    if (fail) reject(new Error('Late failure')); else resolve({ table: 'old' })
    await pending
    assert.deepEqual(events, [])
    assert.equal(clock.size(), 0)
  }
  const watcher = watchPoll(() => assert.fail('Stopped before first read'), () => assert.fail('Must not publish'))
  const pending = watcher.refresh()
  watcher.stop()
  await pending
})

test('customer visit survives offline, timeout and server failure, then recovers; only confirmed 401 ends it', async () => {
  const clock = scheduler(), verified = []
  let error = new TypeError('Failed to fetch'), ended = 0
  const session = { sessionId: 'S1', tableSessionId: 'T1' }
  const watcher = watchCustomerSession(async () => { if (error) throw error; return session }, (data) => verified.push(data), () => { ended++ }, clock.options)
  await watcher.refresh()
  for (const failure of [new DOMException('Timeout', 'AbortError'), ...[500, 503, 403].map((status) => Object.assign(new Error('Unavailable'), { status }))]) {
    error = failure
    await clock.tick()
    assert.equal(ended, 0)
    assert.equal(clock.size(), 1)
  }
  error = null
  await clock.tick()
  assert.deepEqual(verified, [session])
  error = Object.assign(new Error('Session ended'), { status: 401 })
  await clock.tick()
  assert.equal(ended, 1)
  assert.equal(clock.size(), 0)
  await watcher.refresh()
  assert.equal(ended, 1)
})

test('old customer session verification cannot clear a newly selected visit', async () => {
  let reject
  const watcher = watchCustomerSession(() => new Promise((_resolve, no) => { reject = no }), () => assert.fail(), () => assert.fail('Old visit cleared the current visit'))
  const pending = watcher.refresh()
  await Promise.resolve()
  watcher.stop()
  reject(Object.assign(new Error('Ended'), { status: 401 }))
  await pending
})

function nativeStorage() {
  const map = new Map()
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) }
}

test('denied browser storage falls back to isolated memory with working login persistence and signout', () => {
  for (const getStorage of [() => { throw new DOMException('Denied', 'SecurityError') }, () => ({ getItem() { throw new Error('Denied') } }), () => ({ getItem: () => null, setItem() { throw new Error('Quota exceeded') } })]) {
    const first = createTabAuthStorage({ getStorage, createId: () => 'tab-1' })
    const second = createTabAuthStorage({ getStorage, createId: () => 'tab-2' })
    first.storage.setItem('session', 'test-token')
    assert.equal(first.storage.getItem('session'), 'test-token')
    assert.equal(second.storage.getItem('session'), null)
    assert.notEqual(first.tabId, second.tabId)
    first.storage.removeItem('session')
    assert.equal(first.storage.getItem('session'), null)
  }
})

test('normal tab storage survives reload; denial after initialization preserves refreshed session in memory', () => {
  const browser = nativeStorage()
  const first = createTabAuthStorage({ getStorage: () => browser, createId: () => 'tab-1' })
  first.storage.setItem('session', 'old-token')
  const reloaded = createTabAuthStorage({ getStorage: () => browser, createId: () => 'unused-id' })
  assert.equal(reloaded.tabId, 'tab-1')
  assert.equal(reloaded.storage.getItem('session'), 'old-token')
  browser.setItem = () => { throw new DOMException('Denied', 'SecurityError') }
  reloaded.storage.setItem('session', 'refreshed-token')
  assert.equal(reloaded.storage.getItem('session'), 'refreshed-token')
  reloaded.storage.removeItem('session')
  assert.equal(reloaded.storage.getItem('session'), null)
})

const root = path.resolve(import.meta.dirname, '..')
function bundle(entry, requireOverride) {
  const result = buildSync({ entryPoints: [path.join(root, entry)], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'https://auth.example.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-only', VITE_API_URL: 'https://api.example.test' }) } })
  const filename = path.join(root, 'tests', '__reliability-memory.cjs')
  const module = new Module(filename)
  module.filename = filename
  module.paths = Module._nodeModulePaths(root)
  const require = createRequire(filename)
  module.require = (name) => requireOverride?.(name) ?? require(name)
  module._compile(result.outputFiles[0].text, filename)
  return module.exports
}

test('real customer API errors include HTTP status, so network/500 and ended visits are distinguishable', async () => {
  const previous = globalThis.fetch
  try {
    const api = bundle('src/services/customerApi.js')
    for (const status of [401, 403, 500, 503]) {
      globalThis.fetch = async () => ({ ok: false, status, json: async () => ({ error: 'test failure' }) })
      await assert.rejects(api.getCustomerSession('test-session'), (error) => error.status === status)
    }
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
    await assert.rejects(api.getCustomerSession('test-session'), (error) => error instanceof TypeError && error.status === undefined)
  } finally { globalThis.fetch = previous }
})

test('a malformed successful order response is not treated as a confirmed submission', async () => {
  const previous = globalThis.fetch
  try {
    const api = bundle('src/services/customerApi.js')
    for (const body of [{}, { order: null }, { order: { id: 1 } }]) {
      globalThis.fetch = async () => ({ ok: true, status: 201, json: async () => body })
      await assert.rejects(api.placeCustomerOrder('test-session', [], 'test-request'), (error) => error.status === undefined && error.message.includes('could not confirm'))
    }
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ order: { id: 'confirmed-order' } }) })
    assert.equal((await api.placeCustomerOrder('test-session', [], 'test-request')).id, 'confirmed-order')
  } finally { globalThis.fetch = previous }
})

test('real staff auth initializes with denied sessionStorage and server failures never refresh or sign out', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousFetch = globalThis.fetch
  let options, refreshed = 0, signedOut = 0
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { get sessionStorage() { throw new DOMException('Denied', 'SecurityError') } } })
    const api = bundle('src/services/supabaseAuthService.js', (name) => name === '@supabase/supabase-js' ? {
      createClient(_url, _key, config) {
        options = config.auth
        return { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }), refreshSession: async () => { refreshed++; return { data: { session: { access_token: 'new-test-token' } } } }, signOut: async () => { signedOut++ } } }
      },
    } : undefined)
    assert.equal(options.persistSession, true)
    options.storage.setItem(options.storageKey, 'test-only')
    assert.equal(options.storage.getItem(options.storageKey), 'test-only')
    for (const status of [500, 503]) {
      globalThis.fetch = async () => ({ ok: false, status, json: async () => ({ error: 'Temporarily unavailable' }) })
      await assert.rejects(api.authenticatedApiRequest('/api/v1/me'), (error) => error.status === status)
      await assert.rejects(api.restoreSupabaseUser({ access_token: 'test-token' }), /Temporarily unavailable/)
    }
    assert.equal(refreshed, 0)
    assert.equal(signedOut, 0)
    let attempts = 0
    globalThis.fetch = async () => ++attempts === 1 ? { ok: false, status: 401, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ result: 'ok' }) }
    assert.deepEqual(await api.authenticatedApiRequest('/api/v1/me'), { result: 'ok' })
    assert.equal(refreshed, 1)
    assert.equal(attempts, 2)
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else delete globalThis.window
    globalThis.fetch = previousFetch
  }
})

test('explicit staff sign-in submits credentials once, announces verification and keeps the session after an API timeout', async () => {
  const previousFetch = globalThis.fetch
  let credentials = 0, verifying = 0, signedOut = 0, reads = 0
  try {
    const api = bundle('src/services/supabaseAuthService.js', (name) => name === '@supabase/supabase-js' ? {
      createClient() { return { auth: {
        signInWithPassword: async () => { credentials++; return { data: { session: { access_token: 'fake-test-token' } } } },
        signOut: async () => { signedOut++ },
      } } },
    } : undefined)
    globalThis.fetch = async () => { reads++; throw new DOMException('signal timed out', 'TimeoutError') }
    await assert.rejects(api.signInSupabaseUser('test@example.test', 'fake-password', { onVerifying: () => { verifying++ } }), error => error.code === 'STAFF_SERVER_UNAVAILABLE')
    assert.equal(credentials, 1); assert.equal(reads, 1); assert.equal(verifying, 1); assert.equal(signedOut, 0)
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ user: { id: 'test-staff', role: 'cashier' } }) })
    assert.equal((await api.restoreSupabaseUser({ access_token: 'fake-test-token' })).id, 'test-staff')
    assert.equal(credentials, 1, 'Recovery reuses the saved session rather than resubmitting credentials')
  } finally { globalThis.fetch = previousFetch }
})
