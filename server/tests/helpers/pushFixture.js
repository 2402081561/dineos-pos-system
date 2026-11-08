import { createECDH, randomBytes, randomUUID } from 'node:crypto'
import { orderPushConfig } from '../../src/orderPush.js'

export function pushFixture() {
  const key = createECDH('prime256v1'); key.generateKeys()
  const env = { ORDER_PUSH_ENABLED: 'true', ORDER_PUSH_APP_ORIGIN: 'https://orders.example.test', ORDER_PUSH_SUBJECT: 'mailto:shop@example.test', ORDER_PUSH_PUBLIC_KEY: key.getPublicKey().toString('base64url'), ORDER_PUSH_PRIVATE_KEY: key.getPrivateKey().toString('base64url') }
  const client = createECDH('prime256v1'); client.generateKeys()
  const input = { deviceId: randomUUID(), language: 'zh', subscription: { endpoint: 'https://fcm.googleapis.com/wp/' + randomUUID(), keys: { p256dh: client.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } } }
  return { env, config: orderPushConfig(env), input }
}
