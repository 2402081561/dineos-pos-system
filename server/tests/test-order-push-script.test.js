import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'
import { sendTestPush, readToken } from '../scripts/test-order-push.js'

const deviceId = 'ff6c1482-b79b-4ba3-b44a-176598229c31'
const token = 'local.test.signature'
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

test('one owned-device test uses authenticated config then one POST; no order creation or redirect', async () => {
  const calls = [], waits = []
  const result = await sendTestPush({ deviceId, token, wait: async ms => waits.push(ms), fetchImpl: async (url, options) => {
    calls.push({ url, options })
    return calls.length === 1 ? response(200, { enabled: true, schemaReady: true }) : response(200, { accepted: true })
  } })
  assert.deepEqual(waits, [10000]); assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'https://dineos-api-x84l.onrender.com/api/v1/operations/push/config')
  assert.equal(calls[1].url, `https://dineos-api-x84l.onrender.com/api/v1/operations/push/devices/${deviceId}/test`)
  assert.equal(calls[1].options.method, 'POST'); assert.equal(calls[1].options.body, '{}')
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${token}`)
  assert.equal(calls[1].options.redirect, 'error')
  assert.deepEqual(result, { accepted: true, deviceReceiptConfirmed: false })
})

test('disabled server stops before POST or delay', async () => {
  let calls = 0
  await assert.rejects(sendTestPush({ deviceId, token, fetchImpl: async () => { calls++; return response(200, { enabled: false, schemaReady: true }) }, wait: () => assert.fail('Must not wait') }), /尚未就绪/)
  assert.equal(calls, 1)
})

test('invalid input never transmits credentials', async () => {
  for (const input of [{ deviceId: '../orders', token }, { deviceId, token: 'private-key' }, { deviceId, token, delaySeconds: 61 }]) {
    await assert.rejects(sendTestPush({ ...input, fetchImpl: () => assert.fail('No network allowed') }))
  }
})

test('no POST retry after ambiguous timeout; no token or server body in errors', async () => {
  let calls = 0
  await assert.rejects(sendTestPush({ deviceId, token, wait: async () => {}, fetchImpl: async () => {
    calls++
    if (calls === 1) return response(200, { enabled: true, schemaReady: true })
    throw new Error(token)
  } }), error => /不会自动重试/.test(error.message) && !error.message.includes(token))
  assert.equal(calls, 2)
})

test('rate limit handled without retry or leaking response body', async () => {
  let calls = 0
  await assert.rejects(sendTestPush({ deviceId, token, wait: async () => {}, fetchImpl: async () => {
    calls++; return calls === 1 ? response(200, { enabled: true, schemaReady: true }) : response(429, { error: token })
  } }), error => /30 秒/.test(error.message) && !error.message.includes(token))
  assert.equal(calls, 2)
})

test('token can be piped without echo, file, env or command-line storage', async () => {
  assert.equal(await readToken(Readable.from([token, '\n']), { write: () => assert.fail('No token echo') }), token)
  await assert.rejects(readToken(Readable.from(['a'.repeat(16385)])), /过长/)
})
