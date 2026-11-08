import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { orderPushConfig, pushSubscriptionInput, pushMessage } from '../src/orderPush.js'
import { pushFixture } from './helpers/pushFixture.js'
test('push requires explicit enable, HTTPS origin and a matching VAPID key pair', () => {
  const { env } = pushFixture()
  assert.equal(orderPushConfig(env).enabled, true)
  for (const changes of [{ ORDER_PUSH_ENABLED: 'false' }, { ORDER_PUSH_APP_ORIGIN: 'http://localhost:5173' }, { ORDER_PUSH_APP_ORIGIN: 'https://orders.example.test/' }, { ORDER_PUSH_PRIVATE_KEY: randomBytes(32).toString('base64url') }, { ORDER_PUSH_SUBJECT: '' }]) assert.equal(orderPushConfig({ ...env, ...changes }).enabled, false)
})
test('subscription validation prevents arbitrary server-side requests and oversized/invalid keys', () => {
  const { input } = pushFixture()
  assert.equal(pushSubscriptionInput(input).subscription.endpoint, input.subscription.endpoint)
  for (const endpoint of ['http://fcm.googleapis.com/wp/a', 'https://127.0.0.1/test', 'https://fcm.googleapis.com.attacker.test/wp/a', 'https://fcm.googleapis.com:444/wp/a', 'https://user:password@web.push.apple.com/x', 'https://example.test/']) assert.throws(() => pushSubscriptionInput({ ...input, subscription: { ...input.subscription, endpoint } }))
  for (const keys of [{}, { ...input.subscription.keys, auth: 'bad' }, { ...input.subscription.keys, p256dh: 'a'.repeat(10000) }]) assert.throws(() => pushSubscriptionInput({ ...input, subscription: { ...input.subscription, keys } }))
  assert.throws(() => pushSubscriptionInput({ ...input, deviceId: 'not-a-device' }))
  for (const host of ['web.push.apple.com', 'updates.push.services.mozilla.com']) assert.ok(pushSubscriptionInput({ ...input, subscription: { ...input.subscription, endpoint: `https://${host}/test` } }))
})
test('lock-screen payloads are minimal and retry tags stay stable', () => {
  const input = { orderId: randomUUID(), deliveryId: randomUUID(), customerPhone: 'private', notes: 'private' }
  const payload = pushMessage(input)
  assert.deepEqual(payload, pushMessage(input))
  assert.equal(payload.orderId, input.orderId)
  assert.equal(JSON.stringify(payload).includes('private'), false)
  assert.match(pushMessage({ test: true, language: 'en' }).title, /Test/)
})
