import { webcrypto } from 'node:crypto'

export class AuthenticationUnavailableError extends Error {}

export function createSupabaseTokenVerifier({ supabaseUrl, fetchKeys = fetch, now = Date.now }) {
  let cache = { expiresAt: 0, keys: new Map() }
  async function signingKey(kid) {
    if (!supabaseUrl) throw new AuthenticationUnavailableError('Authentication is not configured.')
    if (now() >= cache.expiresAt) {
      try {
        const result = await fetchKeys(`${supabaseUrl}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(10000) })
        if (!result.ok) throw new Error('Signing keys unavailable')
        const { keys } = await result.json()
        if (!Array.isArray(keys)) throw new Error('Invalid signing key response')
        cache = { expiresAt: now() + 60 * 60 * 1000, keys: new Map(keys.filter((key) => key?.kid).map((key) => [key.kid, key])) }
      } catch {
        throw new AuthenticationUnavailableError('Authentication is temporarily unavailable.')
      }
    }
    const key = cache.keys.get(kid)
    if (!key) throw new Error('The access token signing key is unknown.')
    return key
  }
  return async function verifySupabaseAccessToken(token) {
    if (!supabaseUrl) throw new AuthenticationUnavailableError('Authentication is not configured.')
    const [encodedHeader, encodedPayload, encodedSignature, ...rest] = String(token).split('.')
    if (!encodedHeader || !encodedPayload || !encodedSignature || rest.length) throw new Error('Malformed access token.')
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'))
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    if (!header?.kid || !['RS256', 'ES256', 'EdDSA'].includes(header.alg)) throw new Error('Unsupported access token.')
    if (payload?.iss !== `${supabaseUrl}/auth/v1` || payload?.aud !== 'authenticated' || !payload?.sub || !Number.isFinite(Number(payload.exp)) || Number(payload.exp) * 1000 <= now()) throw new Error('Expired or invalid access token.')
    const key = await signingKey(header.kid)
    const algorithm = header.alg === 'RS256'
      ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
      : header.alg === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } : { name: 'Ed25519' }
    let imported
    try { imported = await webcrypto.subtle.importKey('jwk', key, algorithm, false, ['verify']) }
    catch { throw new AuthenticationUnavailableError('Authentication is temporarily unavailable.') }
    const valid = await webcrypto.subtle.verify(algorithm, imported, Buffer.from(encodedSignature, 'base64url'), Buffer.from(`${encodedHeader}.${encodedPayload}`))
    if (!valid) throw new Error('Invalid access token signature.')
    return payload
  }
}

export function createAuthenticatedUserMiddleware({ verifyToken, pool }) {
  return async function requireAuthenticatedUser(request, response, next) {
    const match = /^Bearer\s+(.+)$/i.exec(request.get('authorization') ?? '')
    if (!match) return response.status(401).json({ error: 'Authentication is required.' })
    let claims
    try { claims = await verifyToken(match[1]) }
    catch (error) {
      if (error instanceof AuthenticationUnavailableError) return response.status(503).json({ error: 'Authentication is temporarily unavailable. Please try again shortly.' })
      return response.status(401).json({ error: 'Your session is invalid or has expired.' })
    }
    // A valid JWT followed by a failed database read is a server failure, not
    // invalid credentials. Let the normal error handler return a server error.
    try {
      const { rows } = await pool.query('SELECT id, email, display_name AS "displayName", role FROM users WHERE auth_user_id = $1', [claims.sub])
      if (!rows[0]) return response.status(403).json({ error: 'This account has not been assigned a DineOS role. Sign out and sign in again after the account is provisioned.' })
      request.user = rows[0]
      return next()
    } catch (error) { return next(error) }
  }
}
