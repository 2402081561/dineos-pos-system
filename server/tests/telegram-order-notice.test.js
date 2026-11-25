import test from 'node:test'
import assert from 'node:assert/strict'
import { createTelegramOrderNotice } from '../src/telegramOrderNotice.js'

const env = { TELEGRAM_BOT_TOKEN: '123:fake_token', TELEGRAM_ORDER_CHAT_ID: '456', TELEGRAM_ORDER_NOTICES_ENABLED: 'true' }
const order = { tableOrderNumber: 2, grandTotal: '18.00', email: 'private@example.invalid' }

test('sends a minimal audible order notice without paid broadcasting', async () => {
  let payload
  const notify = createTelegramOrderNotice({ env, fetchImpl: async (_, request) => {
    payload = JSON.parse(request.body)
    return { ok: true, json: async () => ({ ok: true }) }
  } })
  await notify(order, { tableNumber: 8 }, [
    { name: '炒哥罗面', quantity: 2, notes: '不要辣\n不要葱', optionSnapshot: [{ groupName: '加料', options: [{ label: '加蛋' }] }] },
    { name: '菠菜', quantity: 1 },
  ])
  assert.deepEqual(payload, {
    chat_id: '456',
    text: '🔔 DineOS · New customer order\nTable 8\nOrder #2\n2× 炒哥罗面\n  Options: 加蛋\n  Note: 不要辣 不要葱\n1× 菠菜\nTotal: RM 18.00',
    disable_notification: false,
    allow_paid_broadcast: false,
  })
})

test('is off by default and contains failures without leaking secrets', async () => {
  const warnings = []
  const fetchImpl = async () => { throw new Error(env.TELEGRAM_BOT_TOKEN) }
  const warn = message => warnings.push(message)
  await createTelegramOrderNotice({ env: {}, fetchImpl, warn })(order)
  assert.deepEqual(warnings, [])
  await createTelegramOrderNotice({ env, fetchImpl, warn })(order)
  assert.deepEqual(warnings, ['Telegram order notice could not be sent.'])
})
