import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createDatabasePool, databaseUnavailable, apiErrorHandler } from '../src/databaseConnection.js'

test('pool and checked-out socket errors are handled without retrying writes or ending the pool', () => {
  const logs = []
  class FakePool extends EventEmitter { constructor(options) { super(); this.options = options } }
  const pool = createDatabasePool(FakePool, 'private-connection-string', { error: (message) => logs.push(message) })
  assert.equal(pool.options.connectionTimeoutMillis, 8000)
  assert.equal(pool.options.keepAlive, true)
  const client = new EventEmitter()
  pool.emit('connect', client)
  const error = Object.assign(new Error('secret SQL / password'), { code: 'ECONNRESET', client: { password: 'private-password' } })
  assert.doesNotThrow(() => client.emit('error', error))
  assert.doesNotThrow(() => pool.emit('error', error, client))
  assert.equal(logs.length, 2)
  assert.match(logs[0], /ECONNRESET/)
  assert.doesNotMatch(logs.join(''), /password|secret|private-connection-string/)
  assert.equal(pool.listenerCount('error'), 1)
  assert.equal(client.listenerCount('error'), 1)
})
test('connection failures including nested AggregateErrors are distinguished from validation and SQL bugs', () => {
  for (const code of ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EADDRNOTAVAIL', 'EAI_AGAIN', '08006', '57P01', '53300']) assert.equal(databaseUnavailable(Object.assign(new Error(), { code })), true, code)
  assert.equal(databaseUnavailable(new globalThis.AggregateError([new Error(), Object.assign(new Error(), { code: 'ECONNREFUSED' })])), true)
  assert.equal(databaseUnavailable(new Error('outer', { cause: new Error('Connection terminated unexpectedly') })), true)
  assert.equal(databaseUnavailable({ code: 'ENOENT', syscall: 'connect', address: '/tmp/local/.s.PGSQL.5432' }), true)
  assert.equal(databaseUnavailable({ code: 'ENOENT', syscall: 'open', path: '/tmp/file-not-found' }), false)
  const circular = new Error('Application bug'); circular.cause = circular
  assert.equal(databaseUnavailable(circular), false)
  for (const code of ['23505', '23503', '42703', '42601', undefined]) assert.equal(databaseUnavailable(Object.assign(new Error('SQL or input problem'), { code })), false)
})
test('API reports unavailable as 503 without exposing connection details or promising a failed write', () => {
  const logger = console.error, logs = []
  console.error = (...args) => logs.push(args.join(' '))
  const response = () => ({ statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this }, set(key, value) { this.headers[key] = value; return this }, json(body) { this.body = body; return this } })
  try {
    const res = response()
    apiErrorHandler(Object.assign(new Error('password=secret'), { code: 'ENOTFOUND', client: { secretKey: 1234 } }), {}, res, () => {})
    assert.equal(res.statusCode, 503)
    assert.equal(res.headers['Cache-Control'], 'no-store')
    assert.match(res.body.error, /may not be confirmed/)
    assert.doesNotMatch(JSON.stringify(res), /secret|1234/)
    const bug = response()
    apiErrorHandler(Object.assign(new Error('SQL password=secret'), { code: '42703' }), {}, bug, () => {})
    assert.equal(bug.statusCode, 500)
    assert.doesNotMatch(logs.join(''), /password|secretKey/)
  } finally { console.error = logger }
})
