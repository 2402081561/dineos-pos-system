import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { readCashierSnapshot } from '../src/cashierSnapshotReads.js'

test('seven cashier reads take three bounded rounds, preserving result order', async () => {
  let active = 0, peak = 0, calls = 0
  const queued = []
  const pending = readCashierSnapshot(Array.from({ length: 7 }, (_, index) => async () => {
    calls++; active++; peak = Math.max(peak, active)
    await new Promise(resolve => queued.push(resolve))
    active--
    return { rows: [index] }
  }))
  assert.equal(calls, 3)
  let rounds = 0
  while (queued.length) {
    rounds++
    queued.splice(0).reverse().forEach(resolve => resolve())
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.equal(rounds, 3, 'Sequential implementation would need seven latency rounds')
  assert.equal(peak, 3)
  assert.deepEqual(await pending, Array.from({ length: 7 }, (_, index) => ({ rows: [index] })))
})

test('a failed read stops further work and never returns a partial financial snapshot', async () => {
  const failure = new Error('Unavailable')
  let calls = 0, release
  const pending = readCashierSnapshot([
    async () => { calls++; throw failure },
    async () => { calls++; await new Promise(resolve => { release = resolve }); return {} },
    async () => { calls++; return {} },
    async () => { assert.fail('Do not start additional reads after failure') },
  ])
  await Promise.resolve()
  assert.equal(calls, 3)
  const rejected = assert.rejects(pending, error => error === failure)
  release()
  await rejected
})

test('actual cashier route preserves every SELECT, response field and role guard from the sequential implementation', async () => {
  const current = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  // Pin the sequential baseline: HEAD becomes the parallel implementation after release.
  const previous = execFileSync('git', ['show', 'ed373ca:server/src/index.js'], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' })
  async function invoke(source) {
    const start = source.indexOf("app.get('/api/v1/cashier/pending-orders'")
    const end = source.indexOf("app.get('/api/v1/cashier/order-setup'", start)
    const queries = [], guards = []
    let handler, body
    runInNewContext(source.slice(start, end), {
      app: { get(_path, auth, role, callback) { assert.equal(auth, 'auth'); assert.equal(role, 'role'); handler = callback } },
      requireAuthenticatedUser: 'auth', requireRole(...roles) { guards.push(...roles); return 'role' },
      pickupFieldsSql: 'synthetic_pickup_fields', readCashierSnapshot,
      pool: { async query(sql) { queries.push(sql); return { rows: [{ fixture: sql.trim().slice(0, 60) }] } } },
    })
    await handler({}, { status(code) { assert.equal(code, 200); return this }, json(value) { body = value } }, error => { throw error })
    return { queries: queries.sort(), guards, body: JSON.parse(JSON.stringify(body)) }
  }
  assert.deepEqual(await invoke(current), await invoke(previous))
})
