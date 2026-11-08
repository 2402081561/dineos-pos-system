import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { createRuntimeDiagnostics, registerLivenessRoute } from '../src/runtimeDiagnostics.js'

function fixture() {
  const events = []
  const server = new EventEmitter()
  let now = 100, beat, unrefs = 0, cancelled = 0
  const pool = { totalCount: 3, idleCount: 2, waitingCount: 1,
    query() { assert.fail('Diagnostics must never query a database') } }
  const diagnostics = createRuntimeDiagnostics({
    logger: { info: (line) => events.push(JSON.parse(line.slice('[API diagnostics] '.length))) },
    clock: () => now, memory: () => ({ rss: 30 * 1048576, heapUsed: 12 * 1048576 }), uptime: () => 61.8,
    schedule(callback, ms) { assert.equal(ms, 60000); beat = callback; return { unref() { unrefs += 1 } } },
    cancel() { cancelled += 1 },
  })
  return { events, server, pool, diagnostics, setTime(t) { now = t }, tick() { beat() },
    get unrefs() { return unrefs }, get cancelled() { return cancelled } }
}

test('boot/listening phases and one unref heartbeat identify the same process without DB work', () => {
  const f = fixture()
  assert.deepEqual(f.events.map((e) => e.event), ['boot'])
  f.diagnostics.attach(f.server, f.pool)
  f.diagnostics.attach(f.server, f.pool)
  f.setTime(233); f.server.emit('listening')
  assert.equal(f.events[1].startupMs, 133)
  assert.equal(f.unrefs, 1)
  f.setTime(60733); f.tick()
  assert.deepEqual(f.events[2], { event: 'heartbeat', bootId: f.events[0].bootId,
    uptimeSeconds: 61, rssMiB: 30, heapUsedMiB: 12, timerDelayMs: 500,
    requests: 0, preflights: 0, poolTotal: 3, poolIdle: 2, poolWaiting: 1 })
  f.server.emit('close'); f.tick()
  assert.equal(f.cancelled, 1)
  assert.equal(f.events.at(-1).event, 'closed')
  assert.equal(f.events.length, 4)
})

test('request observation logs no URLs, headers, credentials or bodies and never blocks next', () => {
  const f = fixture()
  const sensitive = { url: '/api/v1/me?secret=PRIVATE', headers: { authorization: 'PRIVATE', cookie: 'PRIVATE' }, body: { password: 'PRIVATE' } }
  let nextCalls = 0
  for (const method of ['GET', 'OPTIONS', 'OPTIONS', 'POST']) {
    f.diagnostics.observeRequest({ ...sensitive, method }, {}, () => { nextCalls += 1 })
  }
  assert.equal(nextCalls, 4)
  assert.deepEqual(f.events.map((e) => e.event), ['boot', 'first_http_request', 'first_preflight'])
  f.diagnostics.attach(f.server, f.pool); f.server.emit('listening'); f.setTime(60100); f.tick()
  assert.equal(f.events.at(-1).requests, 4)
  assert.equal(f.events.at(-1).preflights, 2)
  assert.doesNotMatch(JSON.stringify(f.events), /PRIVATE|authorization|cookie|password|\/api/)
})

test('listen failures are sanitized and do not start a heartbeat or swallow other listeners', () => {
  const f = fixture()
  f.diagnostics.attach(f.server, f.pool)
  let originalHandlerCalls = 0
  f.server.on('error', () => { originalHandlerCalls += 1 })
  f.server.emit('error', { code: 'EADDRINUSE', message: 'PRIVATE database credentials' })
  assert.equal(originalHandlerCalls, 1)
  assert.equal(f.unrefs, 0)
  assert.equal(f.events.at(-1).code, 'EADDRINUSE')
  assert.doesNotMatch(JSON.stringify(f.events), /PRIVATE/)
  f.server.emit('close')
  assert.equal(f.server.listenerCount('listening'), 0)
})

test('logger failure never prevents request handling', () => {
  const diagnostics = createRuntimeDiagnostics({ logger: { info() { throw new Error('Logger broken') } } })
  let continued = false
  diagnostics.observeRequest({ method: 'OPTIONS' }, {}, () => { continued = true })
  assert.equal(continued, true)
})

test('liveness is no-store, minimal and independent from DB/auth readiness', () => {
  let handler
  registerLivenessRoute({ get(path, callback) { assert.equal(path, '/livez'); handler = callback } })
  const response = { set(name, value) { assert.equal(name, 'Cache-Control'); assert.equal(value, 'no-store'); return this },
    status(code) { assert.equal(code, 200); return this }, json(body) { assert.deepEqual(body, { status: 'ok' }) } }
  handler({}, response)
})
