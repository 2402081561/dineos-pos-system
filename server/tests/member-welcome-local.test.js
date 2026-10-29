import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { registerMemberEmailRoutes } from '../src/memberEmailAuth.js'
import { createMemberWelcomeQueue } from '../src/memberWelcomeQueue.js'
import { createWelcomeSender, welcomeMessage } from '../src/memberWelcomeEmail.js'

// No .env, DATABASE_URL, SMTP settings or external email delivery are used.
test('isolated PostgreSQL: registration/outbox atomicity, safe recovery and single welcome per member', {
  skip: process.env.DINEOS_LOCAL_WELCOME_TEST !== '1', timeout: 60000,
}, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dineos-welcome-')), data = join(directory, 'cluster')
  const bin = '/opt/homebrew/opt/postgresql@17/bin'
  const run = (cmd, args) => { const result = spawnSync(join(bin, cmd), args, { encoding: 'utf8', timeout: 20000 }); assert.equal(result.status, 0, result.stderr) }
  let running = false, pool
  try {
    run('initdb', ['-D', data, '-U', 'welcome_test', '--encoding=UTF8', '--locale=C', '--auth-local=trust', '--auth-host=scram-sha-256'])
    run('pg_ctl', ['-D', data, '-o', `-k ${directory} -p 54333 -c listen_addresses=''`, '-l', join(directory, 'postgres.log'), '-w', 'start']); running = true
    pool = new pg.Pool({ host: directory, port: 54333, user: 'welcome_test', database: 'postgres', connectionTimeoutMillis: 5000 })
    await pool.query('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN')
    const dbdir = new URL('../db/', import.meta.url)
    for (const file of readdirSync(dbdir).filter(file => /^\d{3}.*\.sql$/.test(file)).sort()) await pool.query(readFileSync(new URL(file, dbdir), 'utf8'))
    assert.equal((await pool.query("SELECT has_table_privilege('anon','member_welcome_emails','SELECT') AS allowed")).rows[0].allowed, false)
    assert.equal((await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='member_welcome_emails'::regclass")).rows[0].relrowsecurity, true)
    const tableId = randomUUID(), visitId = randomUUID(), guestId = randomUUID()
    await pool.query('INSERT INTO restaurant_tables(id,table_number,capacity) VALUES($1,1,4)', [tableId])
    await pool.query("INSERT INTO table_sessions(id,table_id,status) VALUES($1,$2,'active')", [visitId, tableId])
    await pool.query("INSERT INTO customer_sessions(id,table_session_id,nickname) VALUES($1,$2,'Guest')", [guestId, visitId])
    const config = { welcomeEnabled: true, mode: 'test', testRecipient: 'test@example.com', apiKey: 'not-a-real-key', from: 'DineOS <onboarding@resend.dev>' }
    const calls = [], logger = { error() {} }; let fail = true
    const send = createWelcomeSender({ config, fetchEmail: async (_url, options) => {
      calls.push(options)
      if (fail) { fail = false; throw new Error('Simulated lost provider response') }
      return { ok: true, json: async () => ({ id: 'test-email-1' }) }
    } })
    const queue = createMemberWelcomeQueue({ pool, config, send, logger })
    const routes = {}; let failSession = false
    let configuredQueue = queue
    registerMemberEmailRoutes({ post(path, ...handlers) { routes[path] = handlers.at(-1) } }, {
      pool, requireCustomerSession() {}, requireVerifiedMember() {}, memberInput: body => ({ ...body, normalizedPhone: body.phone, emailNotificationsEnabled: false }), memberResponse: row => row,
      personalMemberSession: async () => { if (failSession) throw new Error('Session write failed'); return { sessionId: 'local-test' } },
      welcomeQueue: { registration: (...args) => configuredQueue.registration(...args), kick() {} },
    })
    const identity = randomUUID()
    const register = async (authId = identity, email = config.testRecipient, phone = '+60123456789') => {
      const req = { customerSession: { id: guestId, tableSessionId: visitId }, memberIdentity: { authUserId: authId, email }, body: { name: 'Test <Member>', phone } }
      const res = { status(code) { this.code = code; return this }, json(body) { this.body = body; return this } }
      await routes['/api/v1/public/members'](req, res, error => { throw error }); return res
    }
    const first = await register(), duplicate = await register()
    assert.equal(first.code, 200); assert.equal(first.body.welcomeEmail.status, 'queued')
    assert.equal(duplicate.body.member.id, first.body.member.id)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM member_welcome_emails')).rows[0].n, 1)
    await queue.processOne()
    const pending = (await pool.query('SELECT * FROM member_welcome_emails')).rows[0]
    assert.equal(pending.status, 'retry'); assert.equal(pending.attempts, 1)
    // Changing settings cannot mutate the message used with this idempotency key.
    await pool.query("UPDATE shop_settings SET name='Renamed shop' WHERE id=1")
    await pool.query('UPDATE member_welcome_emails SET next_attempt_at=now()')
    const otherWorker = createMemberWelcomeQueue({ pool, config, send, logger })
    await Promise.all([queue.processOne(), otherWorker.processOne()])
    assert.equal(calls.length, 2)
    assert.equal(calls[0].body, calls[1].body); assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key'])
    assert.equal((await register()).body.welcomeEmail.status, 'accepted')
    await queue.processOne(); assert.equal(calls.length, 2)
    // Failure before commit never leaves a new member or orphan welcome job.
    failSession = true
    await assert.rejects(register(randomUUID(), 'rollback@example.com', '+60123456780'), /Session write failed/)
    assert.equal((await pool.query("SELECT 1 FROM members WHERE email='rollback@example.com'")).rowCount, 0)
    failSession = false
    // A real SQL failure in the email savepoint does not abort registration.
    configuredQueue = { registration(client, member, options) {
      return queue.registration({ query(sql, params) {
        return sql.startsWith('INSERT INTO member_welcome_emails') ? client.query('SELECT * FROM welcome_test_missing_table') : client.query(sql, params)
      } }, member, options)
    } }
    const unavailable = await register(randomUUID(), 'unavailable@example.com', '+60123456781')
    assert.equal(unavailable.code, 200); assert.equal(unavailable.body.welcomeEmail.status, 'unavailable')
    assert.equal((await pool.query("SELECT 1 FROM members WHERE email='unavailable@example.com'")).rowCount, 1)
    // Do not replay ambiguous jobs beyond the 24h provider deduplication window.
    await pool.query("UPDATE member_welcome_emails SET status='retry',first_attempt_at=now()-interval '24 hours',next_attempt_at=now()")
    await queue.processOne()
    assert.equal(calls.length, 2)
    assert.equal((await pool.query('SELECT status FROM member_welcome_emails')).rows[0].status, 'blocked')
    // Recover an interrupted worker with exactly the same job/key, not a new email.
    await pool.query("UPDATE member_welcome_emails SET status='processing',first_attempt_at=now(),lease_until=now()-interval '1 minute',lease_token=$1", [randomUUID()])
    await queue.processOne(); assert.equal(calls.length, 3)
    assert.equal(calls[2].headers['Idempotency-Key'], calls[0].headers['Idempotency-Key'])
    // Losing the DB acknowledgement after sending also keeps the original key.
    let lostAck = true
    const ackQueue = createMemberWelcomeQueue({ config, send, logger, pool: { query(sql, params) {
      if (sql.includes("SET status='accepted'") && lostAck) { lostAck = false; return Promise.reject(new Error('Test DB response lost')) }
      return pool.query(sql, params)
    } } })
    await pool.query("UPDATE member_welcome_emails SET status='retry',next_attempt_at=now()")
    await ackQueue.processOne()
    assert.equal((await pool.query('SELECT status FROM member_welcome_emails')).rows[0].status, 'retry')
    await pool.query('UPDATE member_welcome_emails SET next_attempt_at=now()')
    await ackQueue.processOne()
    assert.equal(calls.at(-1).headers['Idempotency-Key'], calls[0].headers['Idempotency-Key'])
    assert.equal((await pool.query('SELECT status FROM member_welcome_emails')).rows[0].status, 'accepted')
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 0)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payments')).rows[0].n, 0)
    const sample = welcomeMessage({ member: { ...first.body.member, email: config.testRecipient }, shopName: 'Test shop', from: config.from })
    assert.match(sample.html, /会员编号/)
    console.info('Local-only welcome email flow passed; mocked provider only, no real email or production database accessed.')
  } finally {
    if (pool) await pool.end()
    if (running) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
  }
})
