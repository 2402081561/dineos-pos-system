import test from 'node:test'
import assert from 'node:assert/strict'
import { createGmailWelcomeSender, loadGmailCredentials } from '../src/memberWelcomeGmail.js'
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMemberWelcomeQueue } from '../src/memberWelcomeQueue.js'

const config = { provider: 'gmail', welcomeEnabled: true, mode: 'test', testRecipient: 'sender@example.com' }
const body = { deliveryProvider: 'gmail', from: 'DineOS <sender@example.com>', to: ['sender@example.com'], subject: 'Welcome · 欢迎', text: 'Hello\n会员编号：DEMO' }
const credentials = { configuredSender: 'sender@example.com', scope: 'https://www.googleapis.com/auth/gmail.send', clientId: 'fake', clientSecret: 'fake', refreshToken: 'fake' }
test('credential loader rejects exposed local files and accepts owner-only JSON', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dineos-fake-mail-'))
  const filename = join(directory, 'fake.json')
  try {
    await writeFile(filename, JSON.stringify(credentials), { mode: 0o600 })
    assert.deepEqual(await loadGmailCredentials(filename), credentials)
    await chmod(filename, 0o644)
    await assert.rejects(loadGmailCredentials(filename), /Private file required/)
  } finally { await rm(directory, { recursive: true }) }
})
function sender(fetchEmail, overrides = {}) {
  return createGmailWelcomeSender({ config, loadCredentials: async () => credentials, getAccessToken: async () => 'fake', fetchEmail, ...overrides })
}
test('Gmail builds UTF-8 MIME and calls only send endpoint once', async () => {
  let calls = 0
  const send = sender(async (url, options) => {
    calls++
    assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
    const mime = Buffer.from(JSON.parse(options.body).raw, 'base64url').toString()
    assert.match(mime, /Content-Transfer-Encoding: base64/)
    assert.match(mime, /Subject: =\?UTF-8\?B\?/) 
    assert.ok(mime.includes(Buffer.from(body.text).toString('base64')))
    return { ok: true, json: async () => ({ id: 'accepted123' }) }
  })
  assert.equal(await send(body), 'accepted123')
  assert.equal(calls, 1)
})
test('Gmail rejects wrong recipients, unbound jobs and header injection without network', async () => {
  const send = sender(() => assert.fail('network must not run'))
  await assert.rejects(send({ ...body, to: ['other@example.com'] }), /TEST_RECIPIENT_BLOCKED/)
  await assert.rejects(send({ ...body, deliveryProvider: undefined }), /EMAIL_PROVIDER_MISMATCH/)
  await assert.rejects(send({ ...body, subject: 'Hi\r\nBcc: bad@example.com' }), /EMAIL_INVALID_HEADER/)
})
test('Gmail ambiguous sends are not retried by transport', async () => {
  let calls = 0
  const send = sender(async () => { calls++; throw new Error('private provider details') })
  await assert.rejects(send(body), /^Error: GMAIL_SEND_UNCONFIRMED$/)
  assert.equal(calls, 1)
})
test('Gmail rejects sender mismatch and non-send-only credentials', async () => {
  const send = sender(() => assert.fail('network must not run'), { loadCredentials: async () => ({ ...credentials, configuredSender: 'other@example.com' }) })
  await assert.rejects(send(body), /GMAIL_AUTH_UNAVAILABLE/)
})
test('Gmail queue blocks uncertain outcomes instead of scheduling a retry', async () => {
  const queries = []
  const pool = { async query(sql, values) {
    queries.push({ sql, values })
    if (sql.includes('WITH due')) return { rows: [{ id: 'demo', attempts: 1, payload: body }] }
    return { rows: [] }
  } }
  const queue = createMemberWelcomeQueue({ pool, config, send: async () => { throw new Error('uncertain') }, logger: { error() {} } })
  await queue.processOne()
  assert.equal(queries.at(-1).values[0], 'blocked')
  assert.match(queries[0].sql, /attempts>0/)
  assert.match(queries.find(q => q.sql.includes('WITH due')).sql, /OR attempts=0/)
})
