import test from 'node:test'
import assert from 'node:assert/strict'
import { readStaffIdentity, staffServerUnavailable } from '../src/utils/staffIdentityRead.js'

test('only explicit login identity reads allow the cold-start budget; no credentials or writes are retried', async () => {
  const budgets = [], calls = [], user = { id: 'staff-test', role: 'cashier' }
  const options = { timeout(ms) { budgets.push(ms); return undefined }, request: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ user }) } } }
  assert.deepEqual(await readStaffIdentity('https://api.example.test', 'fake-token', { ...options, waitForWakeup: true }), user)
  await readStaffIdentity('https://api.example.test', 'fake-token', options)
  assert.deepEqual(budgets, [75000, 15000])
  assert.equal(calls.length, 2)
  for (const call of calls) { assert.equal(call.url, 'https://api.example.test/api/v1/me'); assert.equal(call.init.method, 'GET'); assert.equal(call.init.body, undefined) }
})

test('network and timeout failures get a readable message and never become a verified role', async () => {
  for (const cause of [new DOMException('signal timed out', 'TimeoutError'), new TypeError('Failed to fetch')]) {
    let calls = 0
    await assert.rejects(readStaffIdentity('https://api.example.test', 'fake-token', { timeout: () => undefined, request: async () => { calls++; throw cause } }), error => error.message === staffServerUnavailable && error.code === 'STAFF_SERVER_UNAVAILABLE' && error.cause === cause)
    assert.equal(calls, 1, 'No automatic sign-in or mutation retries')
  }
})

test('authorization rejection stays terminal and unavailable HTTP responses do not grant access', async () => {
  for (const status of [401, 403, 500, 503]) await assert.rejects(readStaffIdentity('https://api.example.test', 'fake-token', { request: async () => ({ ok: false, status, json: async () => ({ error: 'Rejected test' }) }) }), error => error.status === status)
  for (const body of [{}, { user: null }, { user: { id: 'staff-test' } }]) await assert.rejects(readStaffIdentity('https://api.example.test', 'fake-token', { request: async () => ({ ok: true, json: async () => body }) }), /could not verify/)
})
