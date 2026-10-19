import assert from 'node:assert/strict'
import { test } from 'node:test'
import { webcrypto } from 'node:crypto'
import { AuthenticationUnavailableError, createAuthenticatedUserMiddleware, createSupabaseTokenVerifier } from '../src/authentication.js'

function response() {
  return { statusCode: 200, status(value) { this.statusCode = value; return this }, json(value) { this.body = value; return this } }
}
function middleware(verifyToken, query) {
  return createAuthenticatedUserMiddleware({ verifyToken, pool: { query } })
}
const request = (token = 'valid') => ({ get: () => token && `Bearer ${token}` })

test('valid authentication preserves identity and provisioned roles; missing role still returns 403', async () => {
  const user = { id: 'staff-1', role: 'cashier' }
  const req = request()
  const res = response()
  let nextCalls = 0
  await middleware(async () => ({ sub: 'auth-1' }), async (sql, params) => {
    assert.deepEqual(params, ['auth-1']); assert.match(sql, /WHERE auth_user_id = \$1/)
    return { rows: [user] }
  })(req, res, () => { nextCalls++ })
  assert.equal(req.user, user)
  assert.equal(nextCalls, 1)
  const unassigned = response()
  await middleware(async () => ({ sub: 'auth-2' }), async () => ({ rows: [] }))(request(), unassigned, () => assert.fail('Must not authorize'))
  assert.equal(unassigned.statusCode, 403)
})

test('database failure after valid JWT reaches the server error handler, never a 401', async () => {
  const error = new Error('Database temporarily offline')
  const res = response()
  let forwarded
  await middleware(async () => ({ sub: 'auth-1' }), async () => { throw error })(request(), res, (value) => { forwarded = value })
  assert.equal(forwarded, error)
  assert.equal(res.body, undefined)
})

test('invalid tokens remain 401; signing-service outages are 503 without any user query', async () => {
  for (const [failure, status] of [[new Error('Bad JWT'), 401], [new AuthenticationUnavailableError('Keys offline'), 503]]) {
    const res = response()
    await middleware(async () => { throw failure }, () => assert.fail('Must not query'))(request(), res, () => assert.fail('Must not authorize'))
    assert.equal(res.statusCode, status)
    assert.ok(!res.body.error.includes(failure.message))
  }
  const res = response()
  await middleware(() => assert.fail('Must not verify'), () => assert.fail('Must not query'))(request(''), res, () => assert.fail())
  assert.equal(res.statusCode, 401)
})

const supabaseUrl = 'https://auth.example.test'
const now = () => 1800000000000
const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const jwk = { ...await webcrypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key' }
const claims = { sub: 'auth-1', iss: `${supabaseUrl}/auth/v1`, aud: 'authenticated', exp: now() / 1000 + 600 }
async function token(payload = claims, header = { alg: 'ES256', kid: jwk.kid }) {
  const input = [header, payload].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.')
  const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, Buffer.from(input))
  return `${input}.${Buffer.from(signature).toString('base64url')}`
}

test('real signature verification rejects expired, wrong issuer/audience, malformed and tampered tokens', async () => {
  let reads = 0
  const verify = createSupabaseTokenVerifier({ supabaseUrl, now, fetchKeys: async () => { reads++; return { ok: true, json: async () => ({ keys: [jwk] }) } } })
  const valid = await token()
  assert.deepEqual(await verify(valid), claims)
  assert.deepEqual(await verify(valid), claims)
  assert.equal(reads, 1)
  for (const invalid of [await token({ ...claims, exp: now() / 1000 }), await token({ ...claims, iss: 'wrong' }), await token({ ...claims, aud: 'wrong' }), 'bad', 'e30.e30.a', await token(claims, { alg: 'HS256', kid: jwk.kid }), valid.replace(/\.[^.]+$/, '.AAAA')]) {
    await assert.rejects(verify(invalid), (error) => !(error instanceof AuthenticationUnavailableError))
  }
})

test('network, non-OK, malformed JWKS and corrupt server keys are service errors and retry safely', async () => {
  const valid = await token()
  await assert.rejects(createSupabaseTokenVerifier({ supabaseUrl: '', now })(valid), AuthenticationUnavailableError)
  const offline = [async () => { throw new TypeError('Failed to fetch') }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => { throw new SyntaxError('Bad JSON') } }), async () => ({ ok: true, json: async () => ({ keys: null }) }), async () => ({ ok: true, json: async () => ({ keys: [{ kid: jwk.kid }] }) })]
  for (const fetchKeys of offline) {
    const verify = createSupabaseTokenVerifier({ supabaseUrl, now, fetchKeys })
    await assert.rejects(verify(valid), AuthenticationUnavailableError)
  }
  let retry = false
  const verify = createSupabaseTokenVerifier({ supabaseUrl, now, fetchKeys: async () => {
    if (!retry) throw new Error('Offline')
    return { ok: true, json: async () => ({ keys: [jwk] }) }
  } })
  await assert.rejects(verify(valid), AuthenticationUnavailableError)
  retry = true
  assert.deepEqual(await verify(valid), claims)
})
