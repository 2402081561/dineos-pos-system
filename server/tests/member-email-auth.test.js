import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createVerifiedMemberMiddleware, registerMemberEmailRoutes } from '../src/memberEmailAuth.js'
import { linkMemberEmail } from '../src/linkMemberEmail.js'

const authId = '66b195a3-18e0-4f2d-a337-42797a0ba97f'
const member = { id: 'a98b5086-dff8-4aca-b8a7-f42459604745', memberId: 'MEM-00001', name: 'Test member', email: 'member@example.com', status: 'active', pointsBalance: 29 }
const user = { id: authId, email: member.email, email_confirmed_at: '2026-10-13T01:00:00Z' }
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } } }
async function verify({ token = 'test-token', authUser = user, status = 200, throws = false, configured = true, enabled = true } = {}) {
  let reads = 0, next = 0
  const middleware = createVerifiedMemberMiddleware({ supabaseUrl: configured ? 'https://project.supabase.co' : '', publishableKey: 'publishable-test-key', enabled, fetchUser: async (url, options) => {
    reads++; assert.equal(url, 'https://project.supabase.co/auth/v1/user'); assert.equal(options.headers.Authorization, `Bearer ${token}`)
    assert.equal(options.headers.apikey, 'publishable-test-key'); assert.ok(options.signal)
    if (throws) throw new Error('Test offline')
    return { status, ok: status === 200, json: async () => authUser }
  } })
  const req = { get: () => token ? `Bearer ${token}` : '' }, res = response()
  await middleware(req, res, () => next++)
  return { req, res, reads, next }
}
test('member identity comes only from Supabase confirmed email, without staff roles or user metadata', async () => {
  const result = await verify({ authUser: { ...user, email: 'Member@Example.com', user_metadata: { role: 'admin', email: 'spoof@example.com' } } })
  assert.equal(result.next, 1)
  assert.deepEqual(result.req.memberIdentity, { authUserId: authId, email: member.email })
})
test('paused email membership rejects even valid tokens without calling Supabase', async () => {
  const result = await verify({ enabled: false })
  assert.equal(result.res.statusCode, 503); assert.equal(result.reads, 0); assert.equal(result.next, 0)
  assert.match(result.res.body.error, /not available yet/)
})
test('missing, invalid and unconfirmed credentials never reach the member database', async () => {
  const missing = await verify({ token: '' }); assert.equal(missing.reads, 0); assert.equal(missing.res.statusCode, 401)
  for (const options of [{ status: 401 }, { status: 403 }, { authUser: { ...user, email_confirmed_at: null } }, { authUser: { ...user, id: 'fake' } }, { authUser: { ...user, email: '' } }]) {
    const result = await verify(options); assert.equal(result.next, 0); assert.equal(result.res.statusCode, 401)
  }
})
test('auth configuration, outage and provider throttling fail as unavailable, not invalid credentials', async () => {
  for (const options of [{ configured: false }, { status: 500 }, { status: 429 }, { throws: true }]) {
    const result = await verify(options); assert.equal(result.next, 0); assert.equal(result.res.statusCode, 503)
  }
})

function routes({ existing = null, collision = false, ended = false } = {}) {
  const handlers = {}, queries = [], state = { existing, inserted: 0, linked: 0, released: 0 }
  const customerGuard = () => {}, identityGuard = () => {}
  const client = { async query(sql, params) {
    queries.push({ sql, params })
    if (sql.includes('FOR UPDATE OF table_sessions')) return { rows: ended ? [] : [{ id: 'visit' }] }
    if (sql.includes('FROM members WHERE auth_user_id')) return { rows: state.existing ? [state.existing] : [] }
    if (sql.includes('SELECT id FROM members WHERE phone_normalized')) return { rows: collision ? [{ id: 'old-unverified-member' }] : [] }
    if (sql.includes('INSERT INTO members')) {
      state.inserted++; assert.equal(params[3], member.email); assert.equal(params[5], authId)
      state.existing = member; return { rows: [member] }
    }
    return { rows: [] }
  }, release() { state.released++ } }
  registerMemberEmailRoutes({ post(path, first, second, handler) { assert.equal(first, customerGuard); assert.equal(second, identityGuard); handlers[path] = handler } }, {
    pool: { connect: async () => client }, requireCustomerSession: customerGuard, requireVerifiedMember: identityGuard,
    memberInput: (input) => ({ ...input, normalizedPhone: '+60123456789' }), memberResponse: (row) => row,
    personalMemberSession: async (_client, _visit, row) => { state.linked++; return { sessionId: 'personal-visit', memberId: row.id } },
  })
  return { state, queries, async run(path = '/api/v1/public/members', overrides = {}) {
    const req = { customerSession: { id: 'guest', tableSessionId: 'visit' }, memberIdentity: { authUserId: authId, email: member.email }, body: { name: 'Test member', phone: '0123456789', email: 'spoof@example.com' }, ...overrides }
    const res = response(); await handlers[path](req, res, (error) => { throw error }); return res
  } }
}
test('signup uses verified identity and response-loss retry returns same member/points, never inserts twice', async () => {
  const h = routes()
  assert.equal((await h.run()).body.member.id, member.id)
  assert.equal((await h.run()).body.member.pointsBalance, 29)
  assert.equal(h.state.inserted, 1)
  assert.equal(h.state.released, 2)
  assert.equal(h.queries.filter(q => q.sql === 'COMMIT').length, 2)
  assert.ok(h.queries.some(q => q.sql.includes('pg_advisory_xact_lock')))
})
test('legacy email or phone matching never claims old membership or merges points', async () => {
  const h = routes({ collision: true }), res = await h.run()
  assert.equal(res.statusCode, 409); assert.equal(h.state.inserted, 0); assert.equal(h.state.linked, 0)
  assert.equal(h.queries.at(-1).sql, 'ROLLBACK')
})
test('login ignores posted Member ID, phone and email; finds only the verified Auth subject', async () => {
  const h = routes({ existing: member }), res = await h.run('/api/v1/public/members/login')
  assert.equal(res.body.member.pointsBalance, 29)
  const lookup = h.queries.find(q => q.sql.includes('FROM members WHERE auth_user_id'))
  assert.deepEqual(lookup.params, [authId]); assert.match(lookup.sql, /email_verified_at IS NOT NULL/)
})
test('inactive/absent identities and visits cleared during verification never receive membership sessions', async () => {
  for (const [options, code] of [[{}, 404], [{ existing: { ...member, status: 'inactive' } }, 403], [{ existing: member, ended: true }, 401]]) {
    const h = routes(options), res = await h.run('/api/v1/public/members/login')
    assert.equal(res.statusCode, code); assert.equal(h.state.linked, 0); assert.equal(h.queries.at(-1).sql, 'ROLLBACK')
  }
  const h = routes({ existing: member })
  const res = await h.run('/api/v1/public/members/login', { customerSession: { id: 'guest', tableSessionId: 'visit', memberId: 'another-member' } })
  assert.equal(res.statusCode, 409); assert.equal(h.state.linked, 0)
})
test('legacy linking requires confirmed exact email and never changes points or transactions', async () => {
  const queries = []
  const client = { async query(sql, params) {
    queries.push({ sql, params })
    if (sql.includes('FROM auth.users')) return { rows: [user] }
    if (sql.includes('FROM members')) return { rows: [{ id: member.id, auth_user_id: null, email: 'old@example.com' }] }
    return { rows: [] }
  } }
  await linkMemberEmail(client, { memberId: member.memberId, authUserId: authId, expectedEmail: member.email })
  const update = queries.find(q => q.sql.startsWith('UPDATE'))
  assert.doesNotMatch(update.sql, /points|phone|status/)
  assert.deepEqual(update.params, [authId, member.email, member.id])
  assert.ok(queries.some(q => q.sql.includes('LINK_MEMBER_EMAIL')))
})
test('administrator linking rejects unconfirmed, wrong-email and already-owned accounts before any write', async () => {
  for (const [auth, owner] of [[{ ...user, email_confirmed_at: null }, null], [{ ...user, email: 'different@example.com' }, null], [user, 'another-auth-id']]) {
    let writes = 0
    await assert.rejects(linkMemberEmail({ async query(sql) {
      if (sql.startsWith('UPDATE') || sql.startsWith('INSERT')) writes++
      return { rows: sql.includes('auth.users') ? [auth] : [{ id: member.id, auth_user_id: owner }] }
    } }, { memberId: member.memberId, authUserId: authId, expectedEmail: member.email }))
    assert.equal(writes, 0)
  }
})
