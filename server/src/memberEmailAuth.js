// Ask Supabase Auth for the authenticated user, rather than trusting a decoded
// JWT, submitted email, user metadata, or the old Member ID + phone lookup.
export function createVerifiedMemberMiddleware({ supabaseUrl, publishableKey, enabled = false, allowedEmail = '', fetchUser = fetch }) {
  return async (request, response, next) => {
    if (!enabled) return response.status(503).json({ error: 'Member email login is not available yet. You can still order as Guest.' })
    if (!supabaseUrl || !publishableKey) return response.status(503).json({ error: 'Member email login is not configured yet. Please contact the restaurant.' })
    const token = /^Bearer\s+(\S+)$/i.exec(request.get('authorization') ?? '')?.[1]
    if (!token || token.length > 8192) return response.status(401).json({ error: 'Verify your email code before signing in.' })
    try {
      const result = await fetchUser(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        headers: { apikey: publishableKey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
      })
      if (result.status === 401 || result.status === 403) return response.status(401).json({ error: 'Your email verification has expired. Request a new code.' })
      if (!result.ok) return response.status(503).json({ error: 'Email verification is temporarily unavailable. Please try again.' })
      const user = await result.json()
      const email = String(user?.email ?? '').trim().toLowerCase()
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user?.id ?? '') || !user.email_confirmed_at || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return response.status(401).json({ error: 'Verify your email code before signing in.' })
      }
      if (allowedEmail && email !== allowedEmail) return response.status(403).json({ error: 'Membership testing is limited to the configured test email. You can still order as Guest.' })
      request.memberIdentity = { authUserId: user.id, email }
      return next()
    } catch {
      return response.status(503).json({ error: 'Email verification is temporarily unavailable. Please try again.' })
    }
  }
}

export function registerMemberEmailRoutes(app, { pool, requireCustomerSession, requireVerifiedMember, memberInput, memberResponse, personalMemberSession, welcomeQueue }) {
  async function visitStillActive(client, request, response) {
    const { rows } = await client.query(`SELECT table_sessions.id FROM customer_sessions JOIN table_sessions ON table_sessions.id = customer_sessions.table_session_id
      WHERE customer_sessions.id = $1 AND table_sessions.id = $2 AND customer_sessions.left_at IS NULL AND table_sessions.status = 'active'
      FOR UPDATE OF table_sessions`, [request.customerSession.id, request.customerSession.tableSessionId])
    if (rows[0]) return true
    await client.query('ROLLBACK')
    response.status(401).json({ error: 'This customer session is no longer active.' })
    return false
  }
  app.post('/api/v1/public/members', requireCustomerSession, requireVerifiedMember, async (request, response, next) => {
    const identity = request.memberIdentity
    let input
    try {
      input = memberInput({ ...request.body, email: identity.email })
    } catch (error) { return response.status(400).json({ error: error.message }) }
    let client
    try {
      client = await pool.connect()
      await client.query('BEGIN')
      if (!await visitStillActive(client, request, response)) return
      // Serialize signup retries for the same verified identity. A lost response
      // can safely retry without creating another member or losing their points.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identity.authUserId])
      let { rows } = await client.query(`SELECT id, concat('MEM-', lpad(member_number::text, 5, '0')) AS "memberId", name,
        phone_display AS phone, email, points_balance AS "pointsBalance", status, email_notifications_enabled AS "emailNotificationsEnabled"
        FROM members WHERE auth_user_id = $1 FOR UPDATE`, [identity.authUserId])
      if (rows[0] && rows[0].status !== 'active') {
        await client.query('ROLLBACK')
        return response.status(403).json({ error: 'This membership is unavailable.' })
      }
      let created = false
      if (!rows[0]) {
        // Historical, unverified contact details are not proof of ownership.
        const collision = await client.query('SELECT id FROM members WHERE phone_normalized = $1 OR lower(email) = $2 LIMIT 1', [input.normalizedPhone, identity.email])
        if (collision.rows[0]) {
          await client.query('ROLLBACK')
          return response.status(409).json({ error: 'An existing membership needs to be linked by the administrator. Your points have been kept.' })
        }
        ;({ rows } = await client.query(`INSERT INTO members (name, phone_normalized, phone_display, email, email_notifications_enabled, auth_user_id, email_verified_at)
          VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id, concat('MEM-', lpad(member_number::text, 5, '0')) AS "memberId", name,
          phone_display AS phone, email, points_balance AS "pointsBalance", status, email_notifications_enabled AS "emailNotificationsEnabled"`,
        [input.name, input.normalizedPhone, input.phone, identity.email, input.emailNotificationsEnabled, identity.authUserId]))
        created = true
      }
      if (request.customerSession.memberId && request.customerSession.memberId !== rows[0].id) {
        await client.query('ROLLBACK')
        return response.status(409).json({ error: 'A different member is already linked to this visit.' })
      }
      const session = await personalMemberSession(client, request.customerSession, rows[0])
      const welcome = welcomeQueue ? await welcomeQueue.registration(client, rows[0], { created }) : 'disabled'
      await client.query('COMMIT')
      // Delivery never holds the response open. The durable job was committed
      // with this membership, and retries find the same job rather than enqueue.
      welcomeQueue?.kick()
      return response.status(200).json({ member: memberResponse(rows[0]), session, welcomeEmail: { status: welcome } })
    } catch (error) {
      if (client) await client.query('ROLLBACK')
      if (error.code === '23505') return response.status(409).json({ error: 'An existing membership needs to be linked by the administrator. Your points have been kept.' })
      return next(error)
    } finally { client?.release() }
  })

  app.post('/api/v1/public/members/login', requireCustomerSession, requireVerifiedMember, async (request, response, next) => {
    let client
    try {
      client = await pool.connect()
      await client.query('BEGIN')
      if (!await visitStillActive(client, request, response)) return
      const { rows } = await client.query(`SELECT id, concat('MEM-', lpad(member_number::text, 5, '0')) AS "memberId", name,
        phone_display AS phone, email, points_balance AS "pointsBalance", status, email_notifications_enabled AS "emailNotificationsEnabled"
        FROM members WHERE auth_user_id = $1 AND email_verified_at IS NOT NULL FOR UPDATE`, [request.memberIdentity.authUserId])
      if (!rows[0]) {
        await client.query('ROLLBACK')
        return response.status(404).json({ error: 'No verified membership is linked to this email. Register or ask the administrator to link your existing membership.' })
      }
      if (rows[0].status !== 'active') {
        await client.query('ROLLBACK')
        return response.status(403).json({ error: 'This membership is unavailable.' })
      }
      if (request.customerSession.memberId && request.customerSession.memberId !== rows[0].id) {
        await client.query('ROLLBACK')
        return response.status(409).json({ error: 'A different member is already linked to this visit.' })
      }
      const session = await personalMemberSession(client, request.customerSession, rows[0])
      await client.query('COMMIT')
      return response.status(200).json({ member: memberResponse(rows[0]), session })
    } catch (error) {
      if (client) await client.query('ROLLBACK')
      return next(error)
    } finally { client?.release() }
  })
}
