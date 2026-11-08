import { randomUUID, createECDH } from 'node:crypto'
import * as webpush from 'web-push'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const base64 = /^[A-Za-z0-9_-]+$/
const pushHosts = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'])

export function orderPushConfig(env) {
  const disabled = { enabled: false, publicKey: '', appOrigin: '' }
  if (env.ORDER_PUSH_ENABLED !== 'true') return disabled
  try {
    const origin = new URL(env.ORDER_PUSH_APP_ORIGIN)
    if (origin.protocol !== 'https:' || origin.origin !== env.ORDER_PUSH_APP_ORIGIN) return disabled
    const { ORDER_PUSH_PUBLIC_KEY: publicKey, ORDER_PUSH_PRIVATE_KEY: privateKey, ORDER_PUSH_SUBJECT: subject } = env
    if (!base64.test(publicKey) || !base64.test(privateKey) || !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject)) return disabled
    const key = createECDH('prime256v1'); key.setPrivateKey(Buffer.from(privateKey, 'base64url'))
    if (key.getPublicKey().toString('base64url') !== publicKey) return disabled
    return { enabled: true, appOrigin: origin.origin, publicKey, privateKey, subject }
  } catch { return disabled }
}

export function pushSubscriptionInput(body) {
  const subscription = body?.subscription
  const endpoint = new URL(subscription?.endpoint)
  // The server must never POST to an arbitrary URL supplied by a browser.
  if (endpoint.protocol !== 'https:' || !pushHosts.has(endpoint.hostname) || endpoint.port || endpoint.username || endpoint.password || endpoint.hash || endpoint.href.length > 2048) throw new Error('Invalid push subscription.')
  const { p256dh, auth } = subscription?.keys ?? {}
  if (typeof p256dh !== 'string' || !base64.test(p256dh) || Buffer.from(p256dh, 'base64url').length !== 65 || typeof auth !== 'string' || !base64.test(auth) || Buffer.from(auth, 'base64url').length !== 16 || !uuid.test(body?.deviceId)) throw new Error('Invalid push subscription.')
  return { deviceId: body.deviceId, language: body.language === 'en' ? 'en' : 'zh', subscription: { endpoint: endpoint.href, expirationTime: null, keys: { p256dh, auth } } }
}

export async function pushSchemaReady(pool) {
  return Boolean((await pool.query("SELECT to_regclass('public.order_push_deliveries') AS ready")).rows[0]?.ready)
}

export function pushMessage({ orderId, deliveryId, language = 'zh', test = false }) {
  // Lock-screen content deliberately excludes diner names, phone numbers,
  // plates, food notes and amounts. The protected order page has those details.
  return { kind: test ? 'test' : 'takeaway', orderId: test ? null : orderId,
    title: test ? 'DineOS · ' + (language === 'zh' ? '测试通知' : 'Test notification') : language === 'zh' ? 'DineOS · 新打包订单' : 'DineOS · New take-away order',
    body: test ? language === 'zh' ? '看到这条通知后，请回到页面确认。' : 'After seeing this notification, return to the page to confirm.' : language === 'zh' ? '有新的打包餐点，请点击查看订单。' : 'New take-away items. Tap to view the order.',
    tag: test ? 'dineos-push-test' : 'dineos-order-' + deliveryId }
}

export function createPushSender(config) {
  return (subscription, payload, { ttl = 900 } = {}) => webpush.sendNotification(subscription, JSON.stringify(payload), {
    vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
    TTL: Math.max(1, Math.min(900, ttl)), urgency: 'high', timeout: 10000,
  })
}

export function registerOrderPushRoutes(app, { pool, requireAuthenticatedUser, requireRole, config, send = createPushSender(config) }) {
  const allowed = [requireAuthenticatedUser, requireRole('admin', 'cashier')]
  const ready = async (_request, response, next) => {
    if (!config.enabled) return response.status(503).json({ error: 'Order notifications are not configured yet.' })
    if (!await pushSchemaReady(pool)) return response.status(503).json({ error: 'Order notifications need database upgrade 036.' })
    return next()
  }
  app.get('/api/v1/operations/push/config', ...allowed, async (_request, response) => {
    const schemaReady = await pushSchemaReady(pool)
    return response.set('Cache-Control', 'no-store').json({ enabled: config.enabled && schemaReady, schemaReady, publicKey: config.enabled && schemaReady ? config.publicKey : '', appOrigin: config.appOrigin })
  })
  app.get('/api/v1/operations/push/devices/:deviceId', ...allowed, async (request, response) => {
    if (!uuid.test(request.params.deviceId)) return response.status(400).json({ error: 'Invalid push subscription.' })
    if (!await pushSchemaReady(pool)) return response.set('Cache-Control', 'no-store').json({ active: false })
    const { rows } = await pool.query(`SELECT enabled AND expires_at>now() AS active,expires_at AS "expiresAt"
      FROM order_push_subscriptions WHERE user_id=$1 AND device_id=$2`, [request.user.id, request.params.deviceId])
    return response.set('Cache-Control', 'no-store').json(rows[0] ?? { active: false })
  })
  app.post('/api/v1/operations/push/subscriptions', ...allowed, ready, async (request, response) => {
    if (request.get('origin') !== config.appOrigin) return response.status(403).json({ error: 'Open the configured HTTPS website to enable notifications.' })
    let input
    try { input = pushSubscriptionInput(request.body) } catch { return response.status(400).json({ error: 'Invalid push subscription.' }) }
    // Device limits bound fan-out. Serializing per user also prevents concurrent
    // requests from bypassing this limit. Endpoints never leave this API.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [request.user.id])
      const existing = await client.query('SELECT id,user_id,device_id,endpoint,enabled AND expires_at>now() AS active FROM order_push_subscriptions WHERE endpoint=$1 OR (user_id=$2 AND device_id=$3) FOR UPDATE', [input.subscription.endpoint, request.user.id, input.deviceId])
      if (existing.rows.some((row) => row.user_id !== request.user.id || row.device_id !== input.deviceId || row.endpoint !== input.subscription.endpoint)) {
        await client.query('ROLLBACK'); return response.status(409).json({ error: 'Disable notifications on this device before switching accounts.' })
      }
      const count = await client.query('SELECT count(*)::int AS total FROM order_push_subscriptions WHERE user_id=$1 AND enabled AND expires_at>now()', [request.user.id])
      if (!existing.rows[0]?.active && count.rows[0].total >= 10) {
        await client.query('ROLLBACK'); return response.status(409).json({ error: 'Too many notification devices. Disable an old device first.' })
      }
      await client.query(`INSERT INTO order_push_subscriptions(user_id,device_id,endpoint,subscription,language) VALUES($1,$2,$3,$4::jsonb,$5)
        ON CONFLICT(endpoint) DO UPDATE SET subscription=EXCLUDED.subscription,language=EXCLUDED.language,enabled=true,
          expires_at=now()+interval '30 days',updated_at=now(),
          generation=order_push_subscriptions.generation + CASE WHEN order_push_subscriptions.enabled THEN 0 ELSE 1 END`,
      [request.user.id, input.deviceId, input.subscription.endpoint, JSON.stringify(input.subscription), input.language])
      await client.query('COMMIT')
      return response.json({ active: true })
    } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505') return response.status(409).json({ error: 'Disable notifications on this device before switching accounts.' }); throw error }
    finally { client.release() }
  })
  // Disabling is allowed even when sender configuration is switched off.
  app.delete('/api/v1/operations/push/devices/:deviceId', ...allowed, async (request, response) => {
    if (!uuid.test(request.params.deviceId)) return response.status(400).json({ error: 'Invalid push subscription.' })
    if (await pushSchemaReady(pool)) await pool.query('DELETE FROM order_push_subscriptions WHERE user_id=$1 AND device_id=$2', [request.user.id, request.params.deviceId])
    return response.status(204).end()
  })
  app.post('/api/v1/operations/push/devices/:deviceId/test', ...allowed, ready, async (request, response) => {
    if (!uuid.test(request.params.deviceId)) return response.status(400).json({ error: 'Invalid push subscription.' })
    const { rows } = await pool.query(`UPDATE order_push_subscriptions SET last_test_at=now() WHERE user_id=$1 AND device_id=$2 AND enabled AND expires_at>now()
      AND (last_test_at IS NULL OR last_test_at<now()-interval '30 seconds') RETURNING id,subscription,language`, [request.user.id, request.params.deviceId])
    if (!rows[0]) return response.status(429).json({ error: 'Enable notifications first, then wait 30 seconds between tests.' })
    try { await send(rows[0].subscription, pushMessage({ test: true, language: rows[0].language })); return response.json({ accepted: true }) }
    catch (error) {
      if ([404,410].includes(error.statusCode)) await pool.query('UPDATE order_push_subscriptions SET enabled=false,generation=generation+1 WHERE id=$1', [rows[0].id])
      return response.status(503).json({ error: 'Test notification was not confirmed. Check notification settings and try again.' })
    }
  })
}

export function createOrderPushWorker({ pool, config, send = createPushSender(config), logger = console }) {
  let running = false, loggedFailure = false
  async function processOne() {
    if (!config.enabled || running) return false
    running = true
    try {
      if (!await pushSchemaReady(pool)) return false
      await pool.query(`UPDATE order_push_deliveries SET status='expired',lease_token=NULL,lease_until=NULL WHERE status IN ('pending','sending') AND created_at<now()-interval '15 minutes'`)
      const token = randomUUID()
      const { rows } = await pool.query(`WITH due AS (SELECT id FROM order_push_deliveries
        WHERE (status='pending' AND next_attempt_at<=now()) OR (status='sending' AND lease_until<now())
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE order_push_deliveries d SET status='sending',attempts=attempts+1,lease_until=now()+interval '60 seconds',lease_token=$1
        FROM due WHERE d.id=due.id RETURNING d.*`, [token])
      const job = rows[0]
      if (!job) return false
      const found = await pool.query(`SELECT s.subscription,s.language FROM order_push_subscriptions s
        JOIN users u ON u.id=s.user_id JOIN orders o ON o.id=$3
        WHERE s.id=$1 AND s.generation=$2 AND s.enabled AND s.expires_at>now() AND u.role IN ('admin','cashier')
          AND o.status IN ('received','preparing','ready') AND o.order_type IN ('take_away','mixed')`, [job.subscription_id, job.generation, job.order_id])
      let status = 'expired'
      if (found.rows[0]) {
        try {
          const ttl = Math.max(1, Math.ceil((new Date(job.created_at).getTime() + 900000 - Date.now()) / 1000))
          await send(found.rows[0].subscription, pushMessage({ orderId: job.order_id, deliveryId: job.id, language: found.rows[0].language }), { ttl })
          status = 'accepted'
        }
        catch (error) {
          if ([404,410].includes(error.statusCode)) await pool.query('UPDATE order_push_subscriptions SET enabled=false,generation=generation+1 WHERE id=$1 AND generation=$2', [job.subscription_id, job.generation])
          const retryable = !error.statusCode || [408,429].includes(error.statusCode) || error.statusCode >= 500
          status = retryable && job.attempts < 5 ? 'pending' : 'failed'
        }
      }
      await pool.query(`UPDATE order_push_deliveries SET status=$1,lease_until=NULL,lease_token=NULL,next_attempt_at=now()+($2*interval '1 second') WHERE id=$3 AND lease_token=$4`, [status, Math.min(300, 5 * 2 ** job.attempts), job.id, token])
      // These are notification bookkeeping rows only, never business records.
      await pool.query("DELETE FROM order_push_deliveries WHERE created_at<now()-interval '7 days' AND status NOT IN ('pending','sending')")
      loggedFailure = false
      return true
    } catch {
      if (!loggedFailure) logger.error('[Order push] Worker unavailable; orders remain in the cashier queue.')
      loggedFailure = true; return false
    } finally { running = false }
  }
  return { processOne, start() {
    if (!config.enabled) return () => {}
    // One bounded batch per tick; several instances can safely claim SKIP LOCKED.
    let stopped = false
    const tick = async () => { for (let i = 0; i < 20 && !stopped && await processOne(); i++); }
    const timer = setInterval(() => void tick(), 5000); timer.unref(); void tick()
    return () => { stopped = true; clearInterval(timer) }
  } }
}
