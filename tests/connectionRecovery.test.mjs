import { test } from 'node:test'
import assert from 'node:assert/strict'
import { watchPoll } from '../src/utils/pollSubscription.js'
import { recoverStaffSession } from '../src/utils/staffSessionRecovery.js'
import { bundleHarness, hookRuntime, flush, findElement } from './helpers/hookHarness.mjs'

function scheduling() {
  const timers = new Map(), events = new EventTarget()
  let id = 0
  return { events, timers, options: { eventTarget: events, schedule(callback) { timers.set(++id, callback); return id }, cancel(key) { timers.delete(key) } }, tick() { const [key, callback] = timers.entries().next().value ?? []; timers.delete(key); return callback?.() } }
}
test('online event refreshes only serialized reads, recovers after repeated failures and is detached on unmount', async () => {
  const clock = scheduling(), data = [], errors = []
  let calls = 0, resolve
  const watcher = watchPoll(() => { calls++; if (calls <= 2) throw Object.assign(new Error('Unavailable'), { status: 503 }); return new Promise((done) => { resolve = done }) }, (value) => data.push(value), (error) => errors.push(error), clock.options)
  await watcher.refresh()
  assert.equal(calls, 1)
  await clock.tick()
  assert.equal(calls, 2)
  clock.events.dispatchEvent(new Event('online')); await Promise.resolve()
  clock.events.dispatchEvent(new Event('online')); await Promise.resolve()
  assert.equal(calls, 3)
  resolve('latest'); await watcher.refresh()
  assert.deepEqual(data, ['latest']); assert.equal(errors.length, 2)
  watcher.stop(); clock.events.dispatchEvent(new Event('online')); await flush()
  assert.equal(calls, 3); assert.equal(clock.timers.size, 0)
})
test('existing staff identity retries only transient reads, stops on success and rejects real 401/403', async () => {
  const clock = scheduling(), users = [], unavailable = []
  let fail = true, calls = 0
  const watcher = recoverStaffSession(() => { calls++; if (fail) throw Object.assign(new Error('503'), { status: 503 }); return { id: 'staff-A' } }, (user) => users.push(user), (error) => unavailable.push(error), () => assert.fail(), clock.options)
  await watcher.refresh(); assert.equal(unavailable.length, 1)
  fail = false; clock.events.dispatchEvent(new Event('online')); await flush()
  assert.deepEqual(users, [{ id: 'staff-A' }]); assert.equal(clock.timers.size, 0)
  clock.events.dispatchEvent(new Event('online')); await flush(); assert.equal(calls, 2)
  for (const status of [401, 403]) {
    let rejected = 0
    const next = recoverStaffSession(() => { throw Object.assign(new Error('Denied'), { status }) }, () => assert.fail(), () => assert.fail(), () => rejected++, clock.options)
    await next.refresh(); assert.equal(rejected, 1); assert.equal(clock.timers.size, 0)
  }
})
test('switching accounts or unmounting suppresses late identity responses', async () => {
  let resolve, reject
  const old = recoverStaffSession(() => new Promise((yes) => { resolve = yes }), () => assert.fail('Old identity restored'), () => assert.fail(), () => assert.fail())
  const pending = old.refresh(); await Promise.resolve(); old.stop(); resolve({ id: 'previous-user' }); await pending
  const second = recoverStaffSession(() => new Promise((_yes, no) => { reject = no }), () => assert.fail(), () => assert.fail(), () => assert.fail('New identity cleared'))
  const failure = second.refresh(); await Promise.resolve(); second.stop(); reject(Object.assign(new Error('Expired'), { status: 401 })); await failure
})
test('actual auth provider recovers an unavailable initial session without another sign-in', async () => {
  const runtime = hookRuntime(), restores = [], tasks = [], previousTimeout = globalThis.setTimeout, previousClear = globalThis.clearTimeout
  // Controlled recovery timer; no real credentials, network, orders or payments.
  globalThis.setTimeout = (callback) => { tasks.push(callback); return callback }
  globalThis.clearTimeout = (key) => { const index = tasks.indexOf(key); if (index >= 0) tasks.splice(index, 1) }
  try {
    const h = await bundleHarness(`export {default as Provider} from './src/context/AdminAuthProvider.jsx';export {fixture} from 'restore-fixture'`, runtime, {
      'restore-fixture': 'export const fixture={fail:true,reads:0};',
      supabaseAuthService: `import {fixture} from 'restore-fixture';export function subscribeToSupabaseSession(callback){fixture.session=callback;return()=>{}};export async function restoreSupabaseUser(){fixture.reads++;if(fixture.fail)throw Object.assign(new Error('offline'),{status:503});return {id:'staff-A',role:'admin'}};export async function signInSupabaseUser(){throw new Error('Must not sign in again')};export async function signOutSupabaseAdmin(){throw new Error('Must not sign out')}`,
    })
    const view = () => runtime.render(h.Provider).props.value
    view(); runtime.effects(); h.fixture.session({ access_token: 'fake-test-token' }); await flush()
    restores.push(view()); assert.ok(restores[0].authError); assert.equal(restores[0].authUser, null)
    h.fixture.fail = false; tasks.shift()(); await flush()
    assert.equal(view().authUser.id, 'staff-A'); assert.equal(view().authError, '')
    assert.equal(h.fixture.reads, 2)
    runtime.cleanup(); assert.equal(tasks.length, 0)
  } finally { runtime.cleanup(); globalThis.setTimeout = previousTimeout; globalThis.clearTimeout = previousClear }
})
test('protected routes show reconnecting rather than login on transient verification failure, without granting access', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as Admin} from './src/components/admin/ProtectedAdminRoute.jsx';export {default as Roles} from './src/components/auth/ProtectedRoleRoute.jsx';export {fixture} from 'route-fixture'`, runtime, {
    'route-fixture': 'export const fixture={authUser:null,adminUser:null,isLoading:false,authError:"The server is temporarily unavailable. Your login session has been kept; try again shortly."}',
    useAdminAuth: 'import {fixture} from "route-fixture";export default ()=>fixture',
    useCustomerLanguage: 'export default ()=>({t:text=>text})',
  })
  try {
    for (const route of [h.Admin, h.Roles]) {
      const props = { children: 'private content', roles: ['admin', 'cashier'] }
      assert.ok(findElement(runtime.render(route, props), (node) => node.props?.role === 'status'))
      h.fixture.authError = ''
      assert.equal(runtime.render(route, props).props.to, '/admin/login')
      h.fixture.authError = 'Temporary outage'
    }
  } finally { runtime.cleanup() }
})
