import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memberEmailConfig } from '../src/memberEmailConfig.js'
import { welcomeMessage, createWelcomeSender } from '../src/memberWelcomeEmail.js'
import { createMemberWelcomeQueue, welcomeStatus } from '../src/memberWelcomeQueue.js'
import { createVerifiedMemberMiddleware, registerMemberEmailRoutes } from '../src/memberEmailAuth.js'

const email = 'test@example.com'
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-test-key', MEMBER_EMAIL_OTP_ENABLED: 'true', MEMBER_EMAIL_TEST_RECIPIENT: email, MEMBER_WELCOME_EMAIL_ENABLED: 'true', RESEND_API_KEY: 'test-only-secret' }
const member = { id: 'a98b5086-dff8-4aca-b8a7-f42459604745', memberId: 'MEM-00001', name: 'Test Member', email }
const config = memberEmailConfig(env)

test('email configuration defaults off/test; enabling OTP needs an explicit test inbox or live mode', () => {
  assert.equal(memberEmailConfig({}).authEnabled, false)
  assert.equal(config.authEnabled, true); assert.equal(config.welcomeEnabled, true); assert.equal(config.mode, 'test')
  for (const change of [{ MEMBER_EMAIL_TEST_RECIPIENT: '' }, { MEMBER_EMAIL_TEST_RECIPIENT: 'a\r\nb@example.com' }, { MEMBER_EMAIL_MODE: 'typo' }]) assert.equal(memberEmailConfig({ ...env, ...change }).authEnabled, false)
  for (const change of [{ RESEND_API_KEY: '' }, { MEMBER_WELCOME_EMAIL_ENABLED: 'false' }, { MEMBER_EMAIL_FROM: 'Sender\r\nBcc: other@example.com' }, { MEMBER_EMAIL_MODE: 'live' }]) assert.equal(memberEmailConfig({ ...env, ...change }).welcomeEnabled, false)
  assert.equal(memberEmailConfig({ ...env, MEMBER_EMAIL_MODE: 'live', MEMBER_EMAIL_FROM: 'Restaurant <members@shop.example>' }).welcomeEnabled, true)
})

test('test mode rejects another confirmed identity before any membership database write', async () => {
  let next = 0
  const middleware = createVerifiedMemberMiddleware({ supabaseUrl: env.SUPABASE_URL, publishableKey: 'public', enabled: true, allowedEmail: email,
    fetchUser: async () => ({ status: 200, ok: true, json: async () => ({ id: member.id, email: 'other@example.com', email_confirmed_at: '2026-10-27T00:00:00Z' }) }) })
  const res = { status(code) { this.code = code; return this }, json(body) { this.body = body } }
  await middleware({ get: () => 'Bearer not-a-real-token' }, res, () => next++)
  assert.equal(res.code, 403); assert.equal(next, 0)
  assert.doesNotMatch(JSON.stringify(res.body), /test@example.com/)
})

test('welcome email is bilingual, escapes custom names, and contains no session, OTP or phone', () => {
  const body = welcomeMessage({ member: { ...member, name: '<img src=x onerror=alert(1)>', phone: 'private-phone', sessionId: 'private-session', token: 'private-token' }, shopName: '<My Shop>\r\nBcc: x', from: config.from })
  assert.match(body.html, /&lt;My Shop&gt;/); assert.doesNotMatch(body.html, /<img/)
  assert.match(body.html, /欢迎加入/); assert.match(body.text, /MEM-00001/)
  assert.doesNotMatch(body.subject, /[\r\n]/)
  assert.doesNotMatch(JSON.stringify(body), /private-phone|private-session|private-token|\.Token/)
  assert.deepEqual(body.to, [email])
})

test('test sender blocks other recipients; retries keep fixed payload and provider idempotency header', async () => {
  const calls = []
  const send = createWelcomeSender({ config, fetchEmail: async (...args) => { calls.push(args); return { ok: true, json: async () => ({ id: 'email-123' }) } } })
  const body = welcomeMessage({ member, shopName: 'Sinma', from: config.from })
  await assert.rejects(send({ ...body, to: ['other@example.com'] }, 'same-key'), /TEST_RECIPIENT_BLOCKED/)
  assert.equal(calls.length, 0)
  assert.equal(await send(body, 'same-key'), 'email-123'); await send(body, 'same-key')
  assert.equal(calls[0][0], 'https://api.resend.com/emails')
  assert.equal(calls[0][1].headers['Idempotency-Key'], 'same-key')
  assert.equal(calls[0][1].body, calls[1][1].body); assert.ok(calls[0][1].signal)
  const disabled = createWelcomeSender({ config: { ...config, welcomeEnabled: false }, fetchEmail: () => assert.fail('must not send') })
  await assert.rejects(disabled(body, 'same-key'), /EMAIL_DISABLED/)
})

test('transport errors disclose no credentials; permanent failures stop while uncertain/rate-limit failures retry', async () => {
  const body = welcomeMessage({ member, shopName: 'Shop', from: config.from })
  for (const [status, retryable] of [[400, false], [401, false], [403, false], [409, false], [429, true], [503, true]]) {
    const send = createWelcomeSender({ config, fetchEmail: async () => ({ ok: false, status, text() { assert.fail('never log/read provider error body') } }) })
    await assert.rejects(send(body, 'key'), error => error.retryable === retryable && !error.message.includes(config.apiKey))
  }
  for (const fetchEmail of [async () => { throw new Error(`private ${config.apiKey}`) }, async () => ({ ok: true, json: async () => ({}) })]) {
    await assert.rejects(createWelcomeSender({ config, fetchEmail })(body, 'key'), error => error.retryable === true && error.message === 'EMAIL_RESPONSE_UNCERTAIN')
  }
})

test('queue is inert when disabled; savepoint failure keeps registration transaction usable', async () => {
  const queries = [], logs = []
  const client = { async query(sql) {
    queries.push(sql)
    if (sql.startsWith('SELECT name')) return { rows: [{ name: 'Shop' }] }
    if (sql.startsWith('INSERT INTO member_welcome')) throw Object.assign(new Error('private email recipient'), { code: '42P01' })
    return { rows: [] }
  } }
  const disabled = createMemberWelcomeQueue({ pool: client, config: { welcomeEnabled: false }, send: () => assert.fail() })
  assert.equal(await disabled.registration(client, member, { created: true }), 'disabled')
  await disabled.processOne(); disabled.start()(); assert.equal(queries.length, 0)
  const queue = createMemberWelcomeQueue({ pool: client, config, send: () => assert.fail(), logger: { error: message => logs.push(message) } })
  assert.equal(await queue.registration(client, member, { created: true }), 'unavailable')
  assert.ok(queries.includes('ROLLBACK TO SAVEPOINT welcome_email')); assert.equal(queries.at(-1), 'RELEASE SAVEPOINT welcome_email')
  assert.deepEqual(logs, ['[Member email] 42P01'])
  queries.length = 0
  await queue.registration(client, member, { created: false })
  assert.equal(queries.some(sql => sql.startsWith('INSERT')), false)
  assert.equal(welcomeStatus('accepted'), 'accepted'); assert.equal(welcomeStatus('processing'), 'queued'); assert.equal(welcomeStatus('blocked'), 'unavailable')
})

test('registration commits its welcome job before delivery; lost response retries do not enqueue a new welcome', async () => {
  const events = [], handlers = {}; let existing = false
  const client = { async query(sql) {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) events.push(sql)
    if (sql.includes('FOR UPDATE OF table_sessions')) return { rows: [{ id: 'visit' }] }
    if (sql.includes('FROM members WHERE auth_user_id')) return { rows: existing ? [{ ...member, status: 'active' }] : [] }
    if (sql.includes('INSERT INTO members')) { existing = true; return { rows: [{ ...member, status: 'active' }] } }
    return { rows: [] }
  }, release() {} }
  registerMemberEmailRoutes({ post(path, ...chain) { handlers[path] = chain.at(-1) } }, {
    pool: { connect: async () => client }, requireCustomerSession() {}, requireVerifiedMember() {}, memberInput: body => body, memberResponse: row => row,
    personalMemberSession: async () => ({ sessionId: 'test' }),
    welcomeQueue: { async registration(_client, _member, { created }) { events.push(created ? 'queue-new' : 'read-existing'); return 'queued' }, kick() { events.push('deliver') } },
  })
  const req = { customerSession: { id: 'guest', tableSessionId: 'visit' }, memberIdentity: { authUserId: member.id, email }, body: {} }
  const invoke = async () => { const res = { status() { return this }, json(body) { this.body = body; return this } }; await handlers['/api/v1/public/members'](req, res, error => { throw error }); return res }
  assert.equal((await invoke()).body.welcomeEmail.status, 'queued')
  assert.deepEqual(events, ['BEGIN', 'queue-new', 'COMMIT', 'deliver'])
  events.length = 0; await invoke()
  assert.deepEqual(events, ['BEGIN', 'read-existing', 'COMMIT', 'deliver'])
  events.length = 0; await handlers['/api/v1/public/members/login'](req, { status() { return this }, json() {} }, error => { throw error })
  assert.equal(events.includes('deliver'), false)
})
