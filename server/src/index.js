import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import pg from 'pg'

const { Pool } = pg
const port = Number(process.env.PORT) || 4000
const allowedOrigins = String(process.env.CLIENT_ORIGINS ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean)
const isDevelopment = process.env.NODE_ENV !== 'production'
const supabaseUrl = String(process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const app = express()
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
let jwksCache = { expiresAt: 0, keys: new Map() }

app.disable('x-powered-by')
app.use(cors({
  origin(origin, callback) {
    const localDevelopmentOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin ?? '')
    if (!origin || allowedOrigins.includes(origin) || (isDevelopment && localDevelopmentOrigin)) return callback(null, true)
    return callback(new Error('This browser origin is not allowed.'))
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  optionsSuccessStatus: 204,
}))
app.use(express.json({ limit: '100kb' }))

function positiveInteger(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function base64UrlJson(value) {
  return JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'))
}

async function signingKey(kid) {
  if (!supabaseUrl) throw new Error('Supabase authentication is not configured.')
  if (Date.now() >= jwksCache.expiresAt) {
    const result = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
    if (!result.ok) throw new Error('Could not load Supabase signing keys.')
    const { keys } = await result.json()
    jwksCache = { expiresAt: Date.now() + 60 * 60 * 1000, keys: new Map((keys ?? []).filter((key) => key?.kid).map((key) => [key.kid, key])) }
  }
  const key = jwksCache.keys.get(kid)
  if (!key) throw new Error('The access token signing key is unknown.')
  return key
}

async function verifySupabaseAccessToken(token) {
  const [encodedHeader, encodedPayload, encodedSignature, ...rest] = String(token).split('.')
  if (!encodedHeader || !encodedPayload || !encodedSignature || rest.length) throw new Error('Malformed access token.')
  const header = base64UrlJson(encodedHeader)
  const payload = base64UrlJson(encodedPayload)
  if (!header?.kid || !['RS256', 'ES256', 'EdDSA'].includes(header.alg)) throw new Error('Unsupported access token.')
  if (payload?.iss !== `${supabaseUrl}/auth/v1` || payload?.aud !== 'authenticated' || !payload?.sub || !Number.isFinite(Number(payload.exp)) || Number(payload.exp) * 1000 <= Date.now()) throw new Error('Expired or invalid access token.')
  const key = await signingKey(header.kid)
  const algorithm = header.alg === 'RS256'
    ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
    : header.alg === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } : { name: 'Ed25519' }
  const imported = await crypto.subtle.importKey('jwk', key, algorithm, false, ['verify'])
  const valid = await crypto.subtle.verify(algorithm, imported, Buffer.from(encodedSignature, 'base64url'), Buffer.from(`${encodedHeader}.${encodedPayload}`))
  if (!valid) throw new Error('Invalid access token signature.')
  return payload
}

async function requireAuthenticatedUser(request, response, next) {
  const match = /^Bearer\s+(.+)$/i.exec(request.get('authorization') ?? '')
  if (!match) return response.status(401).json({ error: 'Authentication is required.' })
  try {
    const claims = await verifySupabaseAccessToken(match[1])
    const { rows } = await pool.query('SELECT id, email, display_name AS "displayName", role FROM users WHERE auth_user_id = $1', [claims.sub])
    if (!rows[0]) return response.status(403).json({ error: 'This account has not been assigned a DineOS role. Sign out and sign in again after the account is provisioned.' })
    request.user = rows[0]
    return next()
  } catch (error) {
    console.warn('[API] Authentication rejected:', error.message)
    return response.status(401).json({ error: 'Your session is invalid or has expired.' })
  }
}

async function requireCustomerSession(request, response, next) {
  const token = String(request.get('x-customer-session') ?? '').trim()
  if (!uuid.test(token)) return response.status(401).json({ error: 'A valid customer session is required.' })
  try {
    const { rows } = await pool.query(`
      SELECT customer_sessions.id, customer_sessions.access_token AS "sessionId",
        customer_sessions.nickname AS "customerNickname", customer_sessions.table_session_id AS "tableSessionId",
        customer_sessions.member_id AS "memberId",
        table_sessions.shared_customer_session_id = customer_sessions.id AS "isSharedTable",
        restaurant_tables.table_number AS "tableNumber"
      FROM customer_sessions
      JOIN table_sessions ON table_sessions.id = customer_sessions.table_session_id
      JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
      WHERE customer_sessions.access_token = $1
        AND customer_sessions.left_at IS NULL
        AND table_sessions.status = 'active'
    `, [token])
    if (!rows[0]) return response.status(401).json({ error: 'This customer session is no longer active.' })
    request.customerSession = rows[0]
    return next()
  } catch (error) { return next(error) }
}

function requireRole(...roles) {
  return (request, response, next) => {
    if (!request.user || !roles.includes(request.user.role)) return response.status(403).json({ error: 'You are not authorized for this operation.' })
    return next()
  }
}

function tableInput(input) {
  const tableNumber = positiveInteger(input?.tableNumber)
  const capacity = positiveInteger(input?.capacity)
  if (!tableNumber) throw new Error('Table number must be a positive whole number.')
  if (!capacity || capacity > 100) throw new Error('Capacity must be a whole number between 1 and 100.')
  return { tableNumber, capacity, isEnabled: input?.isEnabled !== false }
}

function categoryInput(input) {
  const name = String(input?.name ?? '').trim()
  const sortOrder = Number(input?.sortOrder ?? 0)
  if (!name || name.length > 80) throw new Error('Category name must contain 1 to 80 characters.')
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) throw new Error('Sort order must be a whole number between 0 and 9999.')
  return { name, icon: String(input?.icon ?? '').trim().slice(0, 32), sortOrder, isEnabled: input?.isEnabled !== false }
}

function money(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 && amount <= 999999.99 ? Math.round(amount * 100) / 100 : null
}

function optionalImageUrl(value) {
  const url = String(value ?? '').trim()
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') throw new Error()
    return url
  } catch { throw new Error('Image URL must be a valid HTTPS URL.') }
}

function menuItemInput(input) {
  const name = String(input?.name ?? '').trim()
  const categoryId = String(input?.categoryId ?? '').trim() || null
  const price = money(input?.price)
  if (!name || name.length > 120) throw new Error('Menu item name must contain 1 to 120 characters.')
  if (price === null) throw new Error('Price must be a valid non-negative amount.')
  return {
    name,
    categoryId,
    description: String(input?.description ?? '').trim().slice(0, 2000),
    price,
    imageUrl: optionalImageUrl(input?.imageUrl),
    ingredients: textList(input?.ingredients),
    allergyInformation: textList(input?.allergyInformation),
    isAvailable: input?.isAvailable !== false,
    isPopular: input?.isPopular === true,
  }
}

function orderCartItems(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 30) throw new Error('Your cart must contain between 1 and 30 items.')
  const items = input.map((item) => ({
    menuItemId: String(item?.menuItemId ?? '').trim(),
    quantity: positiveInteger(item?.quantity),
    notes: String(item?.notes ?? item?.specialInstructions ?? '').trim().slice(0, 500),
  }))
  if (items.some((item) => !uuid.test(item.menuItemId) || !item.quantity || item.quantity > 50)) throw new Error('Your cart contains an invalid item or quantity.')
  const duplicates = new Set()
  if (items.some((item) => duplicates.has(item.menuItemId) || !duplicates.add(item.menuItemId))) throw new Error('Each menu item may only appear once in an order.')
  return items
}

function roundMoney(value) { return Math.round((value + Number.EPSILON) * 100) / 100 }

const paymentMethods = new Set(['Cash', 'Credit/Debit Card', "Touch 'n Go", 'GrabPay', 'FPX', 'Other'])
function discountInput(input, subtotal) {
  const type = String(input?.type ?? 'percentage').toLowerCase()
  const value = Number(input?.value ?? 0)
  if (!Number.isFinite(value) || value < 0) throw new Error('Enter a valid non-negative discount.')
  if (type === 'percentage' && value <= 100) return { type, value, amount: roundMoney(subtotal * value / 100) }
  if (type === 'fixed' && value <= subtotal) return { type, value: roundMoney(value), amount: roundMoney(value) }
  throw new Error('Enter a valid discount.')
}
function businessDate() {
  const values = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuching', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const byType = Object.fromEntries(values.map(({ type, value }) => [type, value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

function reportRange(query) {
  const today = businessDate()
  const start = String(query?.start ?? today)
  const end = String(query?.end ?? today)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) throw new Error('Provide a valid report date range.')
  return { start, end }
}

function normalizeMemberPhone(value) {
  const compact = String(value ?? '').trim().replace(/[\s().-]/g, '')
  if (/^0\d+$/.test(compact)) return `+60${compact.slice(1)}`
  if (/^60\d+$/.test(compact)) return `+${compact}`
  if (/^\+\d+$/.test(compact)) return compact
  return ''
}

function memberInput(input) {
  const name = String(input?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
  const phone = String(input?.phone ?? '').trim().replace(/[\s().-]/g, '')
  const normalizedPhone = normalizeMemberPhone(phone)
  const email = String(input?.email ?? '').trim().toLowerCase()
  if (!name) throw new Error('Enter your name.')
  if (!(normalizedPhone.startsWith('+60') ? /^\+601\d{7,9}$/.test(normalizedPhone) : /^\+\d{8,15}$/.test(normalizedPhone))) throw new Error('Enter a valid Malaysian phone number, or an international number with a + country code.')
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new Error('Enter a valid email address or leave it blank.')
  return { name, phone, normalizedPhone, email: email || null, emailNotificationsEnabled: input?.emailNotificationsEnabled === true }
}

function memberNumber(value) {
  const normalized = String(value ?? '').trim().toUpperCase()
  return /^MEM-\d{5,}$/.test(normalized) ? normalized : ''
}

function memberResponse(row) {
  return {
    id: row.id,
    memberId: row.memberId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    pointsBalance: Number(row.pointsBalance) || 0,
    status: row.status,
    emailNotificationsEnabled: row.emailNotificationsEnabled === true,
  }
}

async function personalMemberSession(client, customerSession, member) {
  const { rows } = await client.query(`
    INSERT INTO customer_sessions (table_session_id, member_id, nickname)
    VALUES ($1, $2, $3)
    ON CONFLICT (table_session_id, member_id)
      WHERE left_at IS NULL AND member_id IS NOT NULL
    DO UPDATE SET nickname = EXCLUDED.nickname
    RETURNING access_token AS "sessionId", table_session_id AS "tableSessionId",
      nickname AS "customerNickname", member_id AS "memberId"
  `, [customerSession.tableSessionId, member.id, member.name])
  return { ...rows[0], tableNumber: customerSession.tableNumber, isSharedTable: false }
}

async function logAuditEvent({ action, actorId = null, targetType = null, targetId = null, details = {} }) {
  try {
    await pool.query('INSERT INTO audit_logs (actor_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5::jsonb)', [actorId, action, targetType, targetId, JSON.stringify(details)])
  } catch (error) { console.error('[Audit] Failed to write event:', error.message) }
}

app.get('/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1')
    response.status(200).json({ database: 'connected', status: 'ok' })
  } catch (error) {
    console.error('[API] PostgreSQL health check failed:', error)
    response.status(503).json({ database: 'unavailable', status: 'error' })
  }
})

// These public read endpoints are deliberately limited to data a QR-ordering
// customer can see. Operational endpoints will require server-side auth later.
app.get('/api/v1/public/menu', async (_request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT menu_items.id, menu_items.name, menu_items.description, menu_items.price, menu_items.ingredients,
        menu_items.allergy_information AS "allergyInformation",
        menu_items.image_url AS "imageUrl", menu_items.is_available AS "isAvailable",
        menu_items.is_popular AS "isPopular", categories.id AS "categoryId",
        categories.name AS "categoryName", categories.sort_order AS "categorySortOrder"
      FROM menu_items
      LEFT JOIN categories ON categories.id = menu_items.category_id
      WHERE (categories.id IS NULL OR categories.is_enabled = true)
      ORDER BY categories.sort_order ASC NULLS LAST, menu_items.name ASC
    `)
    response.status(200).json({ items: rows })
  } catch (error) { next(error) }
})

app.get('/api/v1/public/tables/:tableNumber', async (request, response, next) => {
  const tableNumber = positiveInteger(request.params.tableNumber)
  if (!tableNumber) return response.status(400).json({ error: 'A positive table number is required.' })
  try {
    const { rows } = await pool.query('SELECT table_number AS "tableNumber", capacity FROM restaurant_tables WHERE table_number = $1 AND is_enabled = true', [tableNumber])
    if (!rows[0]) return response.status(404).json({ error: 'This table is unavailable.' })
    return response.status(200).json({ table: rows[0] })
  } catch (error) { return next(error) }
})

app.post('/api/v1/public/tables/:tableNumber/join', async (request, response, next) => {
  const tableNumber = positiveInteger(request.params.tableNumber)
  if (!tableNumber) return response.status(400).json({ error: 'A positive table number is required.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tableResult = await client.query('SELECT id, table_number AS "tableNumber" FROM restaurant_tables WHERE table_number = $1 AND is_enabled = true FOR UPDATE', [tableNumber])
    if (!tableResult.rows[0]) {
      await client.query('ROLLBACK')
      return response.status(404).json({ error: 'This table is unavailable.' })
    }
    const table = tableResult.rows[0]
    const activeSession = await client.query("SELECT id, shared_customer_session_id AS \"sharedCustomerSessionId\" FROM table_sessions WHERE table_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [table.id])
    const tableSessionId = activeSession.rows[0]?.id ?? (await client.query("INSERT INTO table_sessions (table_id, status) VALUES ($1, 'active') RETURNING id", [table.id])).rows[0].id
    let sharedCustomerSessionId = activeSession.rows[0]?.sharedCustomerSessionId
    if (!sharedCustomerSessionId) {
      const shared = await client.query("INSERT INTO customer_sessions (table_session_id, nickname) VALUES ($1, 'Shared Table') RETURNING id", [tableSessionId])
      sharedCustomerSessionId = shared.rows[0].id
      await client.query('UPDATE table_sessions SET shared_customer_session_id = $1 WHERE id = $2', [sharedCustomerSessionId, tableSessionId])
    }
    const { rows } = await client.query('SELECT access_token AS "sessionId", table_session_id AS "tableSessionId", nickname AS "customerNickname" FROM customer_sessions WHERE id = $1 AND left_at IS NULL', [sharedCustomerSessionId])
    if (!rows[0]) throw new Error('This shared table session is no longer active.')
    await client.query('COMMIT')
    return response.status(201).json({ session: { ...rows[0], tableNumber: table.tableNumber, isSharedTable: true } })
  } catch (error) {
    await client.query('ROLLBACK')
    return next(error)
  } finally { client.release() }
})

app.get('/api/v1/public/customer-session', requireCustomerSession, (request, response) => {
  response.status(200).json({ session: request.customerSession })
})

app.patch('/api/v1/public/customer-session', requireCustomerSession, async (request, response, next) => {
  if (request.customerSession.isSharedTable) return response.status(409).json({ error: 'Names are not stored for a shared table order.' })
  const nickname = String(request.body?.customerNickname ?? '').trim().slice(0, 80)
  if (!nickname) return response.status(400).json({ error: 'Customer name must contain 1 to 80 characters.' })
  try {
    const { rows } = await pool.query('UPDATE customer_sessions SET nickname = $1 WHERE id = $2 RETURNING access_token AS "sessionId", table_session_id AS "tableSessionId", nickname AS "customerNickname"', [nickname, request.customerSession.id])
    response.status(200).json({ session: { ...rows[0], tableNumber: request.customerSession.tableNumber } })
  } catch (error) { next(error) }
})

app.get('/api/v1/public/member', requireCustomerSession, async (request, response, next) => {
  if (request.customerSession.isSharedTable) return response.status(409).json({ error: 'Membership is unavailable for a shared table order.' })
  if (!request.customerSession.memberId) return response.status(404).json({ error: 'No member is linked to this customer session.' })
  try {
    const { rows } = await pool.query(`SELECT id, concat('MEM-', lpad(member_number::text, 5, '0')) AS "memberId",
      name, phone_display AS phone, email, points_balance AS "pointsBalance", status,
      email_notifications_enabled AS "emailNotificationsEnabled" FROM members WHERE id = $1`, [request.customerSession.memberId])
    if (!rows[0]) return response.status(404).json({ error: 'This member is no longer available.' })
    return response.status(200).json({ member: memberResponse(rows[0]) })
  } catch (error) { return next(error) }
})

app.post('/api/v1/public/members', requireCustomerSession, async (request, response, next) => {
  if (request.customerSession.memberId) return response.status(409).json({ error: 'A member is already linked to this session.' })
  let input
  try { input = memberInput(request.body) } catch (error) { return response.status(400).json({ error: error.message }) }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`INSERT INTO members (name, phone_normalized, phone_display, email, email_notifications_enabled)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, concat('MEM-', lpad(member_number::text, 5, '0')) AS "memberId", name,
        phone_display AS phone, email, points_balance AS "pointsBalance", status,
        email_notifications_enabled AS "emailNotificationsEnabled"`, [input.name, input.normalizedPhone, input.phone, input.email, input.emailNotificationsEnabled])
    const session = await personalMemberSession(client, request.customerSession, rows[0])
    await client.query('COMMIT')
    return response.status(201).json({ member: memberResponse(rows[0]), session })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ error: 'A membership already exists for this phone number.' })
    return next(error)
  } finally { client.release() }
})

app.post('/api/v1/public/members/login', requireCustomerSession, async (request, response, next) => {
  const requestedMemberId = memberNumber(request.body?.memberId)
  const normalizedPhone = normalizeMemberPhone(request.body?.phone)
  if (!requestedMemberId || !normalizedPhone) return response.status(400).json({ error: 'Enter a valid Member ID and phone number.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT id, concat('MEM-', lpad(member_number::text, 5, '0')) AS "memberId",
      name, phone_display AS phone, email, points_balance AS "pointsBalance", status,
      email_notifications_enabled AS "emailNotificationsEnabled"
      FROM members
      WHERE concat('MEM-', lpad(member_number::text, 5, '0')) = $1 AND phone_normalized = $2
      FOR UPDATE`, [requestedMemberId, normalizedPhone])
    if (!rows[0] || rows[0].status !== 'active') {
      await client.query('ROLLBACK')
      return response.status(401).json({ error: 'The Member ID or phone number is incorrect.' })
    }
    const session = await personalMemberSession(client, request.customerSession, rows[0])
    await client.query('COMMIT')
    return response.status(200).json({ member: memberResponse(rows[0]), session })
  } catch (error) {
    await client.query('ROLLBACK')
    return next(error)
  } finally { client.release() }
})

app.get('/api/v1/public/rewards', requireCustomerSession, async (_request, response, next) => {
  try {
    const { rows } = await pool.query('SELECT rewards.id, rewards.name, rewards.points_required AS "pointsRequired", menu_items.id AS "menuItemId", menu_items.name AS "menuItemName" FROM rewards JOIN menu_items ON menu_items.id = rewards.menu_item_id WHERE rewards.is_available = true AND menu_items.is_available = true ORDER BY rewards.points_required ASC, rewards.name ASC')
    response.status(200).json({ rewards: rows })
  } catch (error) { next(error) }
})

app.get('/api/v1/public/points', requireCustomerSession, async (request, response, next) => {
  if (request.customerSession.isSharedTable) return response.status(409).json({ error: 'Points are unavailable for a shared table order.' })
  if (!request.customerSession.memberId) return response.status(404).json({ error: 'Join membership to view points.' })
  try {
    const { rows } = await pool.query('SELECT member_point_transactions.id, member_point_transactions.type, member_point_transactions.points, member_point_transactions.eligible_spending AS "eligibleSpending", member_point_transactions.redemption_reference AS "redemptionReference", member_point_transactions.created_at AS "createdAt", rewards.name AS "rewardName", payments.receipt_number AS "receiptNumber" FROM member_point_transactions LEFT JOIN rewards ON rewards.id = member_point_transactions.reward_id LEFT JOIN payments ON payments.id = member_point_transactions.payment_id WHERE member_point_transactions.member_id = $1 ORDER BY member_point_transactions.created_at DESC LIMIT 50', [request.customerSession.memberId])
    response.status(200).json({ transactions: rows })
  } catch (error) { next(error) }
})

app.post('/api/v1/public/rewards/:rewardId/redeem', requireCustomerSession, async (request, response, next) => {
  if (request.customerSession.isSharedTable) return response.status(409).json({ error: 'Rewards are unavailable for a shared table order.' })
  if (!request.customerSession.memberId) return response.status(403).json({ error: 'Join membership before redeeming rewards.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const member = await client.query("SELECT id, name, points_balance AS \"pointsBalance\" FROM members WHERE id = $1 AND status = 'active' FOR UPDATE", [request.customerSession.memberId])
    if (!member.rows[0]) throw new Error('Your membership is no longer active.')
    const reward = await client.query('SELECT rewards.id, rewards.name, rewards.points_required AS "pointsRequired" FROM rewards JOIN menu_items ON menu_items.id = rewards.menu_item_id WHERE rewards.id = $1 AND rewards.is_available = true AND menu_items.is_available = true FOR UPDATE OF rewards, menu_items', [String(request.params.rewardId ?? '')])
    if (!reward.rows[0]) throw new Error('This reward is no longer available.')
    if (Number(member.rows[0].pointsBalance) < Number(reward.rows[0].pointsRequired)) throw new Error('You do not have enough points for this reward.')
    const reference = `RED-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
    await client.query('UPDATE members SET points_balance = points_balance - $1, updated_at = now() WHERE id = $2', [reward.rows[0].pointsRequired, member.rows[0].id])
    await client.query("INSERT INTO member_point_transactions (member_id, type, points, reward_id, redemption_reference) VALUES ($1, 'redeem', $2, $3, $4)", [member.rows[0].id, -Number(reward.rows[0].pointsRequired), reward.rows[0].id, reference])
    await client.query('COMMIT')
    return response.status(201).json({ redemption: { rewardName: reward.rows[0].name, pointsUsed: Number(reward.rows[0].pointsRequired), pointsBalance: Number(member.rows[0].pointsBalance) - Number(reward.rows[0].pointsRequired), redemptionReference: reference } })
  } catch (error) {
    await client.query('ROLLBACK')
    if (String(error.message).includes('no longer') || String(error.message).includes('enough points')) return response.status(409).json({ error: error.message })
    return next(error)
  } finally { client.release() }
})

app.post('/api/v1/public/customer-session/leave', requireCustomerSession, async (request, response, next) => {
  if (request.customerSession.isSharedTable) return response.status(204).end()
  try {
    await pool.query('UPDATE customer_sessions SET left_at = now() WHERE id = $1 AND left_at IS NULL', [request.customerSession.id])
    response.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/v1/public/orders', requireCustomerSession, async (request, response, next) => {
  const requestId = String(request.get('idempotency-key') ?? '').trim()
  if (!uuid.test(requestId)) return response.status(400).json({ error: 'A valid idempotency key is required.' })
  let cartItems
  try { cartItems = orderCartItems(request.body?.items) } catch (error) { return response.status(400).json({ error: error.message }) }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query('SELECT id, table_order_number AS "tableOrderNumber", status, payment_status AS "paymentStatus", grand_total AS "grandTotal", created_at AS "createdAt" FROM orders WHERE customer_session_id = $1 AND client_request_id = $2', [request.customerSession.id, requestId])
    if (existing.rows[0]) {
      await client.query('COMMIT')
      return response.status(200).json({ order: existing.rows[0], duplicate: true })
    }
    const session = await client.query("SELECT customer_sessions.id FROM customer_sessions JOIN table_sessions ON table_sessions.id = customer_sessions.table_session_id WHERE customer_sessions.id = $1 AND customer_sessions.left_at IS NULL AND table_sessions.status = 'active' FOR UPDATE OF customer_sessions, table_sessions", [request.customerSession.id])
    if (!session.rows[0]) throw new Error('Your table session is no longer active.')
    const ids = cartItems.map((item) => item.menuItemId)
    const menu = await client.query('SELECT id, name, price, is_available AS "isAvailable" FROM menu_items WHERE id = ANY($1::uuid[]) FOR UPDATE', [ids])
    const byId = new Map(menu.rows.map((item) => [item.id, item]))
    const invalid = cartItems.find((item) => {
      const menuItem = byId.get(item.menuItemId)
      return !menuItem || menuItem.isAvailable !== true || !String(menuItem.name ?? '').trim() || money(menuItem.price) === null
    })
    if (invalid) throw new Error('This item is no longer available. Return to your cart and update it.')
    const items = cartItems.map((item) => ({ ...item, ...byId.get(item.menuItemId), unitPrice: money(byId.get(item.menuItemId).price) }))
    const subtotal = roundMoney(items.reduce((total, item) => total + item.unitPrice * item.quantity, 0))
    const serviceCharge = roundMoney(subtotal * 0.1)
    const sst = roundMoney(subtotal * 0.06)
    const grandTotal = roundMoney(subtotal + serviceCharge + sst)
    const created = await client.query("INSERT INTO orders (table_session_id, customer_session_id, member_id, status, payment_status, subtotal, service_charge, sst, grand_total, client_request_id) VALUES ($1, $2, $3, 'received', 'pending', $4, $5, $6, $7, $8) RETURNING id, table_order_number AS \"tableOrderNumber\", status, payment_status AS \"paymentStatus\", grand_total AS \"grandTotal\", created_at AS \"createdAt\"", [request.customerSession.tableSessionId, request.customerSession.id, request.customerSession.isSharedTable ? null : request.customerSession.memberId, subtotal, serviceCharge, sst, grandTotal, requestId])
    const orderId = created.rows[0].id
    for (const item of items) await client.query('INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, notes) VALUES ($1, $2, $3, $4, $5, $6)', [orderId, item.id, item.name, item.unitPrice, item.quantity, item.notes])
    await client.query('COMMIT')
    return response.status(201).json({ order: created.rows[0], duplicate: false })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') {
      const existing = await pool.query('SELECT id, table_order_number AS "tableOrderNumber", status, payment_status AS "paymentStatus", grand_total AS "grandTotal", created_at AS "createdAt" FROM orders WHERE customer_session_id = $1 AND client_request_id = $2', [request.customerSession.id, requestId])
      if (existing.rows[0]) return response.status(200).json({ order: existing.rows[0], duplicate: true })
    }
    if (String(error.message).includes('no longer available') || String(error.message).includes('no longer active')) return response.status(409).json({ error: error.message })
    return next(error)
  } finally { client.release() }
})

app.get('/api/v1/public/orders', requireCustomerSession, async (request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT orders.id, orders.table_order_number AS "tableOrderNumber", restaurant_tables.table_number AS "tableNumber", orders.status, orders.payment_status AS "paymentStatus",
        orders.subtotal, orders.discount_amount AS "discountAmount",
        orders.service_charge AS "serviceCharge", orders.sst, orders.grand_total AS "grandTotal",
        orders.created_at AS "createdAt", orders.updated_at AS "updatedAt",
        COALESCE(jsonb_agg(jsonb_build_object('id', order_items.id, 'menuItemId', order_items.menu_item_id, 'name', order_items.item_name, 'price', order_items.unit_price, 'quantity', order_items.quantity, 'notes', order_items.notes, 'imageUrl', menu_items.image_url) ORDER BY order_items.id) FILTER (WHERE order_items.id IS NOT NULL), '[]'::jsonb) AS items
      FROM orders
        JOIN table_sessions ON table_sessions.id = orders.table_session_id
        JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
        LEFT JOIN order_items ON order_items.order_id = orders.id
        LEFT JOIN menu_items ON menu_items.id = order_items.menu_item_id
      WHERE orders.customer_session_id = $1
      GROUP BY orders.id, restaurant_tables.table_number
      ORDER BY orders.created_at DESC
    `, [request.customerSession.id])
    response.status(200).json({ orders: rows })
  } catch (error) { next(error) }
})

app.patch('/api/v1/public/orders/:orderId/cancel', requireCustomerSession, async (request, response, next) => {
  const orderId = String(request.params.orderId ?? '')
  if (!uuid.test(orderId)) return response.status(400).json({ error: 'A valid order is required.' })
  try {
    const { rows } = await pool.query("UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1 AND customer_session_id = $2 AND status = 'received' AND payment_status <> 'paid' RETURNING id, status, payment_status AS \"paymentStatus\", updated_at AS \"updatedAt\"", [orderId, request.customerSession.id])
    if (!rows[0]) return response.status(409).json({ error: 'Only unpaid orders that have not reached the kitchen can be cancelled.' })
    return response.status(200).json({ order: rows[0] })
  } catch (error) { return next(error) }
})

app.get('/api/v1/public/table-summary', requireCustomerSession, async (request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT customer_sessions.id, customer_sessions.nickname AS "customerNickname",
        COALESCE(sum(orders.subtotal), 0) AS subtotal,
        COALESCE(sum(orders.service_charge), 0) AS "serviceCharge",
        COALESCE(sum(orders.sst), 0) AS sst,
        COALESCE(sum(orders.grand_total), 0) AS "grandTotal",
        COALESCE((array_agg(orders.status::text ORDER BY orders.created_at DESC) FILTER (WHERE orders.id IS NOT NULL))[1], 'no_orders') AS status,
        count(orders.id)::int AS "outstandingOrderCount",
        EXISTS (
          SELECT 1 FROM orders paid_orders
          WHERE paid_orders.customer_session_id = customer_sessions.id
            AND paid_orders.payment_status = 'paid'
            AND paid_orders.status <> 'cancelled'
        ) AS "hasPaidOrders",
        customer_sessions.id = $2::uuid AS "isCurrentCustomer"
      FROM customer_sessions
      JOIN table_sessions ON table_sessions.id = customer_sessions.table_session_id
      LEFT JOIN orders ON orders.customer_session_id = customer_sessions.id
        AND orders.payment_status <> 'paid'
        AND orders.status <> 'cancelled'
      WHERE customer_sessions.table_session_id = $1
        AND customer_sessions.left_at IS NULL
      GROUP BY customer_sessions.id
      ORDER BY min(customer_sessions.joined_at) ASC
    `, [request.customerSession.tableSessionId, request.customerSession.id])
    const guestCount = new Map()
    const participants = rows.map((participant) => {
      const name = String(participant.customerNickname ?? '').trim() || 'Guest'
      const sequence = name === 'Guest' ? (guestCount.get(name) ?? 0) + 1 : 0
      if (sequence) guestCount.set(name, sequence)
      const hasOutstandingOrders = Number(participant.outstandingOrderCount) > 0
      const paymentStatus = hasOutstandingOrders ? 'pending' : participant.hasPaidOrders ? 'paid' : 'no_orders'
      return { ...participant, customerNickname: sequence ? `Guest ${sequence}` : name, paymentStatus }
    })
    const grandTotal = roundMoney(participants.reduce((total, participant) => total + (Number(participant.grandTotal) || 0), 0))
    const paymentStatus = participants.some((participant) => participant.paymentStatus === 'pending')
      ? 'pending'
      : participants.some((participant) => participant.paymentStatus === 'paid') ? 'paid' : 'no_orders'
    response.status(200).json({ tableNumber: request.customerSession.tableNumber, participants, grandTotal, paymentStatus })
  } catch (error) { next(error) }
})

app.get('/api/v1/kitchen/orders', requireAuthenticatedUser, requireRole('admin', 'kitchen'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT orders.id, orders.order_number AS "orderNumber", orders.status, orders.payment_status AS "paymentStatus", orders.grand_total AS "grandTotal", orders.created_at AS "createdAt",
        restaurant_tables.table_number AS "tableNumber", customer_sessions.nickname AS "customerNickname",
        COALESCE(jsonb_agg(jsonb_build_object('id', order_items.id, 'menuItemId', order_items.menu_item_id, 'name', order_items.item_name, 'price', order_items.unit_price, 'quantity', order_items.quantity, 'notes', order_items.notes, 'imageUrl', menu_items.image_url) ORDER BY order_items.id) FILTER (WHERE order_items.id IS NOT NULL), '[]'::jsonb) AS items
      FROM orders
      JOIN table_sessions ON table_sessions.id = orders.table_session_id
      JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
      JOIN customer_sessions ON customer_sessions.id = orders.customer_session_id
      LEFT JOIN order_items ON order_items.order_id = orders.id
      LEFT JOIN menu_items ON menu_items.id = order_items.menu_item_id
      WHERE orders.status IN ('received', 'preparing', 'ready')
      GROUP BY orders.id, restaurant_tables.table_number, customer_sessions.nickname
      ORDER BY orders.created_at ASC
    `)
    response.status(200).json({ orders: rows })
  } catch (error) { next(error) }
})

const kitchenTransitions = { received: 'preparing', preparing: 'ready', ready: 'served' }

app.patch('/api/v1/kitchen/orders/:orderId/status', requireAuthenticatedUser, requireRole('admin', 'kitchen'), async (request, response, next) => {
  const expectedStatus = String(request.body?.expectedStatus ?? '').toLowerCase()
  const status = String(request.body?.status ?? '').toLowerCase()
  if (kitchenTransitions[expectedStatus] !== status) return response.status(400).json({ error: 'This order status transition is not valid.' })
  try {
    const { rows } = await pool.query('UPDATE orders SET status = $1::order_status, updated_at = now() WHERE id = $2 AND status = $3::order_status RETURNING id, status, updated_at AS "updatedAt"', [status, String(request.params.orderId ?? ''), expectedStatus])
    if (!rows[0]) return response.status(409).json({ error: 'This order was updated by another user. Refresh and try again.' })
    return response.status(200).json({ order: rows[0] })
  } catch (error) { return next(error) }
})

app.post('/api/v1/cashier/payments', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  const orderIds = [...new Set(Array.isArray(request.body?.orderIds) ? request.body.orderIds.map((id) => String(id)) : [])]
  const paymentMethod = String(request.body?.paymentMethod ?? '')
  if (!orderIds.length || orderIds.length > 50 || orderIds.some((id) => !uuid.test(id))) return response.status(400).json({ error: 'Choose valid orders to pay.' })
  if (!paymentMethods.has(paymentMethod)) return response.status(400).json({ error: 'Choose a valid payment method.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: orders } = await client.query(`
      SELECT orders.id, orders.table_session_id AS "tableSessionId", orders.member_id AS "memberId", restaurant_tables.id AS "tableId", restaurant_tables.table_number AS "tableNumber",
        orders.status, orders.payment_status AS "paymentStatus",
        COALESCE((SELECT sum(order_items.unit_price * order_items.quantity) FROM order_items WHERE order_items.order_id = orders.id), 0) AS subtotal
      FROM orders
      JOIN table_sessions ON table_sessions.id = orders.table_session_id
      JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
      WHERE orders.id = ANY($1::uuid[])
      FOR UPDATE OF orders
    `, [orderIds])
    if (orders.length !== orderIds.length) throw new Error('One or more orders no longer exist.')
    const tableSessionId = orders[0].tableSessionId
    if (orders.some((order) => order.tableSessionId !== tableSessionId || order.status !== 'served' || order.paymentStatus === 'paid')) throw new Error('Only unpaid served orders from one table can be paid together.')
    const subtotals = orders.map((order) => money(order.subtotal))
    if (subtotals.some((value) => value === null)) throw new Error('An order has invalid totals and cannot be paid.')
    const subtotal = roundMoney(subtotals.reduce((total, value) => total + value, 0))
    const discount = discountInput(request.body?.discount, subtotal)
    const discountedSubtotal = roundMoney(subtotal - discount.amount)
    const tableServiceCharge = roundMoney(discountedSubtotal * 0.1)
    const tableSst = roundMoney(discountedSubtotal * 0.06)
    let remainingDiscount = discount.amount
    let remainingServiceCharge = tableServiceCharge
    let remainingSst = tableSst
    const finalOrders = orders.map((order, index) => {
      const isLast = index === orders.length - 1
      const orderSubtotal = subtotals[index]
      const discountAmount = isLast ? remainingDiscount : subtotal ? roundMoney(discount.amount * orderSubtotal / subtotal) : 0
      remainingDiscount = roundMoney(remainingDiscount - discountAmount)
      const discounted = roundMoney(orderSubtotal - discountAmount)
      const share = discountedSubtotal ? discounted / discountedSubtotal : 0
      const serviceCharge = isLast ? remainingServiceCharge : roundMoney(tableServiceCharge * share)
      const sst = isLast ? remainingSst : roundMoney(tableSst * share)
      remainingServiceCharge = roundMoney(remainingServiceCharge - serviceCharge)
      remainingSst = roundMoney(remainingSst - sst)
      return { id: order.id, subtotal: orderSubtotal, discountAmount, serviceCharge, sst, grandTotal: roundMoney(discounted + serviceCharge + sst) }
    })
    const date = businessDate()
    const sequence = await client.query('INSERT INTO receipt_sequences (business_date, last_number) VALUES ($1::date, 1) ON CONFLICT (business_date) DO UPDATE SET last_number = receipt_sequences.last_number + 1, updated_at = now() RETURNING last_number', [date])
    const receiptNumber = `R-${date.replaceAll('-', '')}-${String(sequence.rows[0].last_number).padStart(4, '0')}`
    const amount = roundMoney(finalOrders.reduce((total, order) => total + order.grandTotal, 0))
    const payment = await client.query('INSERT INTO payments (receipt_number, table_session_id, cashier_id, payment_method, amount) VALUES ($1, $2, $3, $4, $5) RETURNING id, receipt_number AS "receiptNumber", amount, paid_at AS "paidAt"', [receiptNumber, tableSessionId, request.user.id, paymentMethod, amount])
    const memberIds = [...new Set(orders.map((order) => order.memberId).filter(Boolean))]
    let loyalty = null
    if (memberIds.length === 1) {
      const member = await client.query("SELECT id, name, points_balance AS \"pointsBalance\" FROM members WHERE id = $1 AND status = 'active' FOR UPDATE", [memberIds[0]])
      if (member.rows[0]) {
        const points = Math.floor(discountedSubtotal)
        if (points > 0) {
          await client.query('UPDATE members SET points_balance = points_balance + $1, updated_at = now() WHERE id = $2', [points, member.rows[0].id])
          await client.query("INSERT INTO member_point_transactions (member_id, type, points, eligible_spending, payment_id, created_at) VALUES ($1, 'earn', $2, $3, $4, now())", [member.rows[0].id, points, discountedSubtotal, payment.rows[0].id])
        }
        loyalty = { memberName: member.rows[0].name, points, pointsBalance: Number(member.rows[0].pointsBalance) + points, eligibleSpending: discountedSubtotal }
      }
    }
    for (const order of finalOrders) await client.query("UPDATE orders SET subtotal = $1, discount_amount = $2, service_charge = $3, sst = $4, grand_total = $5, payment_status = 'paid', receipt_number = $6, payment_method = $7, paid_at = now(), updated_at = now() WHERE id = $8", [order.subtotal, order.discountAmount, order.serviceCharge, order.sst, order.grandTotal, receiptNumber, paymentMethod, order.id])
    await client.query('COMMIT')
    void logAuditEvent({ action: 'COMPLETE_PAYMENT', actorId: request.user.id, targetType: 'receipt', targetId: receiptNumber, details: { tableNumber: orders[0].tableNumber, paymentMethod, amount, ...(loyalty ? { pointsEarned: loyalty.points } : {}) } })
    return response.status(201).json({ payment: { ...payment.rows[0], tableId: orders[0].tableId, tableNumber: orders[0].tableNumber, paymentMethod, orderIds: finalOrders.map((order) => order.id), loyalty } })
  } catch (error) {
    await client.query('ROLLBACK')
    if (String(error.message).includes('orders') || String(error.message).includes('Only unpaid') || String(error.message).includes('invalid totals') || String(error.message).includes('discount')) return response.status(409).json({ error: error.message })
    return next(error)
  } finally { client.release() }
})

app.get('/api/v1/cashier/receipts/:receiptNumber', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT payments.receipt_number AS "receiptNumber", payments.payment_method AS "paymentMethod", payments.amount,
        payments.paid_at AS "paidAt", restaurant_tables.table_number AS "tableNumber",
        users.display_name AS "cashierName",
        COALESCE(jsonb_agg(jsonb_build_object('id', orders.id, 'subtotal', orders.subtotal, 'discountAmount', orders.discount_amount, 'serviceCharge', orders.service_charge, 'sst', orders.sst, 'grandTotal', orders.grand_total, 'customerNickname', customer_sessions.nickname, 'items', COALESCE(items.items, '[]'::jsonb)) ORDER BY orders.created_at) FILTER (WHERE orders.id IS NOT NULL), '[]'::jsonb) AS orders
      FROM payments
      JOIN table_sessions ON table_sessions.id = payments.table_session_id
      JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
      LEFT JOIN users ON users.id = payments.cashier_id
      LEFT JOIN orders ON orders.receipt_number = payments.receipt_number
      LEFT JOIN customer_sessions ON customer_sessions.id = orders.customer_session_id
      LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('menuItemId', order_items.menu_item_id, 'name', order_items.item_name, 'price', order_items.unit_price, 'quantity', order_items.quantity, 'notes', order_items.notes) ORDER BY order_items.id) AS items FROM order_items WHERE order_items.order_id = orders.id) items ON true
      WHERE payments.receipt_number = $1
      GROUP BY payments.id, restaurant_tables.table_number, users.display_name
    `, [String(request.params.receiptNumber ?? '')])
    if (!rows[0]) return response.status(404).json({ error: 'Receipt not found.' })
    return response.status(200).json({ receipt: rows[0] })
  } catch (error) { return next(error) }
})

app.post('/api/v1/cashier/receipts/:receiptNumber/reprint', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  try {
    const { rows } = await pool.query('SELECT payments.receipt_number AS "receiptNumber", restaurant_tables.table_number AS "tableNumber" FROM payments JOIN table_sessions ON table_sessions.id = payments.table_session_id JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id WHERE payments.receipt_number = $1', [String(request.params.receiptNumber ?? '')])
    if (!rows[0]) return response.status(404).json({ error: 'Receipt not found.' })
    void logAuditEvent({ action: 'REPRINT_RECEIPT', actorId: request.user.id, targetType: 'receipt', targetId: rows[0].receiptNumber, details: { tableNumber: rows[0].tableNumber } })
    return response.status(204).end()
  } catch (error) { return next(error) }
})

app.post('/api/v1/cashier/shift-closings', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  const shiftDate = businessDate()
  try {
    const { rows: payments } = await pool.query("SELECT payment_method AS \"paymentMethod\", amount FROM payments WHERE (paid_at AT TIME ZONE 'Asia/Kuching')::date = $1::date", [shiftDate])
    const breakdown = { cash: 0, card: 0, touchNGo: 0, grabPay: 0, fpx: 0, other: 0 }
    const methodKey = { Cash: 'cash', 'Credit/Debit Card': 'card', "Touch 'n Go": 'touchNGo', GrabPay: 'grabPay', FPX: 'fpx', Other: 'other' }
    for (const payment of payments) breakdown[methodKey[payment.paymentMethod] ?? 'other'] += Number(payment.amount) || 0
    Object.keys(breakdown).forEach((key) => { breakdown[key] = roundMoney(breakdown[key]) })
    const grandTotal = roundMoney(Object.values(breakdown).reduce((total, value) => total + value, 0))
    const summary = { ...breakdown, grandTotal, transactionCount: payments.length, averageBill: payments.length ? roundMoney(grandTotal / payments.length) : 0 }
    const closingId = `CL-${shiftDate.replaceAll('-', '')}-0001`
    const { rows } = await pool.query('INSERT INTO shift_closings (closing_id, shift_date, cashier_name, summary) VALUES ($1, $2, $3, $4::jsonb) RETURNING closing_id AS "closingId", shift_date AS "shiftDate", cashier_name AS "cashierName", summary, closed_at AS "closedAt"', [closingId, shiftDate.replaceAll('-', ''), request.user.displayName, JSON.stringify(summary)])
    void logAuditEvent({ action: 'CLOSE_SHIFT', actorId: request.user.id, targetType: 'shiftClosing', targetId: closingId, details: summary })
    return response.status(201).json({ closing: { ...rows[0], ...summary } })
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Today’s shift has already been closed.' })
    return next(error)
  }
})

app.post('/api/v1/public/service-requests', requireCustomerSession, async (request, response, next) => {
  const requestType = String(request.body?.requestType ?? '').trim().slice(0, 80)
  const note = String(request.body?.note ?? '').trim().slice(0, 500)
  if (!requestType) return response.status(400).json({ error: 'Choose a service request type.' })
  try {
    const { rows } = await pool.query("INSERT INTO service_requests (table_session_id, customer_session_id, request_type, status, details) VALUES ($1, $2, $3, 'pending', $4::jsonb) RETURNING id, request_type AS \"requestType\", status, created_at AS \"createdAt\"", [request.customerSession.tableSessionId, request.customerSession.id, requestType, JSON.stringify(note ? { note } : {})])
    return response.status(201).json({ request: rows[0], duplicate: false })
  } catch (error) {
    if (error.code === '23505') return response.status(200).json({ duplicate: true })
    return next(error)
  }
})

app.get('/api/v1/staff/service-requests', requireAuthenticatedUser, requireRole('admin', 'staff'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query(`SELECT service_requests.id, service_requests.request_type AS "requestType", service_requests.status, service_requests.details, service_requests.created_at AS "createdAt", restaurant_tables.table_number AS "tableNumber", customer_sessions.nickname AS "customerNickname" FROM service_requests JOIN table_sessions ON table_sessions.id = service_requests.table_session_id JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id LEFT JOIN customer_sessions ON customer_sessions.id = service_requests.customer_session_id WHERE service_requests.status = 'pending' ORDER BY service_requests.created_at ASC`)
    response.status(200).json({ requests: rows })
  } catch (error) { next(error) }
})

app.patch('/api/v1/staff/service-requests/:requestId/complete', requireAuthenticatedUser, requireRole('admin', 'staff'), async (request, response, next) => {
  try {
    const { rows } = await pool.query("UPDATE service_requests SET status = 'completed', updated_at = now() WHERE id = $1 AND status = 'pending' RETURNING id, request_type AS \"requestType\"", [String(request.params.requestId ?? '')])
    if (!rows[0]) return response.status(409).json({ error: 'This service request was already completed or is unavailable.' })
    void logAuditEvent({ action: 'COMPLETE_SERVICE_REQUEST', actorId: request.user.id, targetType: 'serviceRequest', targetId: rows[0].id, details: { requestType: rows[0].requestType } })
    return response.status(200).json({ request: rows[0] })
  } catch (error) { return next(error) }
})

app.get('/api/v1/staff/tables', requireAuthenticatedUser, requireRole('admin', 'staff'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT restaurant_tables.id, restaurant_tables.table_number AS "tableNumber", restaurant_tables.capacity,
        restaurant_tables.is_enabled AS "isEnabled", active_sessions.id AS "tableSessionId",
        COALESCE(participants.count, 0)::int AS "participantCount",
        COALESCE(order_data.count, 0)::int AS "orderCount",
        COALESCE(order_data.unpaid_total, 0)::double precision AS "unpaidTotal",
        CASE WHEN restaurant_tables.is_enabled = false THEN 'inactive'
          WHEN active_sessions.id IS NULL THEN 'available'
          WHEN COALESCE(order_data.unpaid_total, 0) > 0 AND COALESCE(order_data.all_served, false) THEN 'awaiting_payment'
          WHEN COALESCE(order_data.ready_to_clear, false) THEN 'ready_to_clear'
          WHEN COALESCE(order_data.count, 0) > 0 THEN 'ordering'
          ELSE 'occupied' END AS status
      FROM restaurant_tables
      LEFT JOIN LATERAL (SELECT id FROM table_sessions WHERE table_id = restaurant_tables.id AND status = 'active' ORDER BY created_at DESC LIMIT 1) active_sessions ON true
      LEFT JOIN LATERAL (SELECT count(*) FROM customer_sessions WHERE table_session_id = active_sessions.id AND left_at IS NULL) participants ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS count, COALESCE(sum(grand_total) FILTER (WHERE payment_status <> 'paid' AND status <> 'cancelled'), 0) AS unpaid_total,
          bool_and(status = 'served') FILTER (WHERE status <> 'cancelled' AND payment_status <> 'paid') AS all_served,
          bool_and(payment_status = 'paid' OR status = 'cancelled') AS ready_to_clear
        FROM orders WHERE table_session_id = active_sessions.id
      ) order_data ON true
      ORDER BY restaurant_tables.table_number ASC
    `)
    response.status(200).json({ tables: rows })
  } catch (error) { next(error) }
})

app.get('/api/v1/cashier/pending-orders', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT orders.id, orders.order_number AS "orderNumber", orders.table_session_id AS "tableSessionId", orders.member_id AS "memberId", orders.status,
        orders.payment_status AS "paymentStatus", orders.subtotal, orders.discount_amount AS "discountAmount",
        orders.service_charge AS "serviceCharge", orders.sst, orders.grand_total AS "grandTotal",
        orders.created_at AS "createdAt", orders.updated_at AS "updatedAt", restaurant_tables.id AS "tableId", restaurant_tables.table_number AS "tableNumber",
        customer_sessions.id AS "sessionId", customer_sessions.nickname AS "customerNickname",
        COALESCE(jsonb_agg(jsonb_build_object('menuItemId', order_items.menu_item_id, 'name', order_items.item_name, 'price', order_items.unit_price, 'quantity', order_items.quantity, 'notes', order_items.notes) ORDER BY order_items.id) FILTER (WHERE order_items.id IS NOT NULL), '[]'::jsonb) AS items
      FROM orders JOIN table_sessions ON table_sessions.id = orders.table_session_id
      JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
      JOIN customer_sessions ON customer_sessions.id = orders.customer_session_id
      LEFT JOIN order_items ON order_items.order_id = orders.id
      WHERE orders.status = 'served' AND orders.payment_status = 'pending'
      GROUP BY orders.id, restaurant_tables.id, restaurant_tables.table_number, customer_sessions.id, customer_sessions.nickname
      ORDER BY orders.updated_at DESC
    `)
    const { rows: clearableTables } = await pool.query(`
      SELECT restaurant_tables.id AS "tableId", restaurant_tables.table_number AS "tableNumber"
      FROM restaurant_tables
      JOIN table_sessions ON table_sessions.table_id = restaurant_tables.id AND table_sessions.status = 'active'
      WHERE EXISTS (
        SELECT 1 FROM orders
        WHERE orders.table_session_id = table_sessions.id
          AND orders.payment_status = 'paid'
          AND orders.status <> 'cancelled'
      )
        AND NOT EXISTS (
          SELECT 1 FROM orders
          WHERE orders.table_session_id = table_sessions.id
            AND orders.payment_status <> 'paid'
            AND orders.status <> 'cancelled'
        )
      ORDER BY restaurant_tables.table_number ASC
    `)
    response.status(200).json({ orders: rows, clearableTables })
  } catch (error) { next(error) }
})

app.get('/api/v1/cashier/receipts', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query(`SELECT payments.receipt_number AS "receiptNumber", payments.payment_method AS "paymentMethod", payments.amount, payments.paid_at AS "paidAt", restaurant_tables.table_number AS "tableNumber" FROM payments JOIN table_sessions ON table_sessions.id = payments.table_session_id JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id ORDER BY payments.paid_at DESC LIMIT 100`)
    response.status(200).json({ receipts: rows })
  } catch (error) { next(error) }
})

app.get('/api/v1/cashier/settlement', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (_request, response, next) => {
  const date = businessDate()
  try {
    const [paid, todayOrders, closings] = await Promise.all([
      pool.query("SELECT payments.receipt_number AS \"receiptNumber\", payments.payment_method AS \"paymentMethod\", payments.amount, payments.paid_at AS \"paidAt\", restaurant_tables.table_number AS \"tableNumber\" FROM payments JOIN table_sessions ON table_sessions.id = payments.table_session_id JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id WHERE (payments.paid_at AT TIME ZONE 'Asia/Kuching')::date = $1::date ORDER BY payments.paid_at DESC", [date]),
      pool.query("SELECT id, status, payment_status AS \"paymentStatus\", grand_total AS \"grandTotal\", created_at AS \"createdAt\" FROM orders WHERE (created_at AT TIME ZONE 'Asia/Kuching')::date = $1::date", [date]),
      pool.query('SELECT closing_id AS "closingId", shift_date AS "shiftDate", cashier_name AS "cashierName", summary, closed_at AS "closedAt" FROM shift_closings ORDER BY closed_at DESC LIMIT 100'),
    ])
    response.status(200).json({ paidPayments: paid.rows, todayOrders: todayOrders.rows, closings: closings.rows })
  } catch (error) { next(error) }
})

app.get('/api/v1/cashier/members/:memberId', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  try {
    const key = String(request.params.memberId ?? '').trim().toUpperCase()
    const { rows } = await pool.query("SELECT id, concat('MEM-', lpad(member_number::text, 5, '0')) AS \"memberId\", name, phone_display AS phone, email, points_balance AS \"pointsBalance\", status FROM members WHERE id::text = $1 OR concat('MEM-', lpad(member_number::text, 5, '0')) = $1 OR phone_normalized = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1", [key])
    if (!rows[0]) return response.status(404).json({ error: 'No member was found.' })
    response.status(200).json({ member: rows[0] })
  } catch (error) { next(error) }
})

app.get('/api/v1/cashier/rewards', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query('SELECT rewards.id, rewards.name, rewards.points_required AS "pointsRequired", rewards.is_available AS "isAvailable", menu_items.id AS "menuItemId", menu_items.name AS "menuItemName" FROM rewards JOIN menu_items ON menu_items.id = rewards.menu_item_id WHERE rewards.is_available = true AND menu_items.is_available = true ORDER BY rewards.points_required ASC, rewards.name ASC')
    response.status(200).json({ rewards: rows })
  } catch (error) { next(error) }
})

app.get('/api/v1/cashier/shift-closings/:closingId', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  try {
    const { rows } = await pool.query('SELECT closing_id AS "closingId", shift_date AS "shiftDate", cashier_name AS "cashierName", summary, closed_at AS "closedAt" FROM shift_closings WHERE closing_id = $1', [String(request.params.closingId ?? '')])
    if (!rows[0]) return response.status(404).json({ error: 'Settlement record not found.' })
    response.status(200).json({ closing: { ...rows[0], ...(rows[0].summary ?? {}) } })
  } catch (error) { next(error) }
})

app.get('/api/v1/admin/orders', requireAuthenticatedUser, requireRole('admin'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT orders.id, orders.order_number AS "orderNumber", orders.status, orders.payment_status AS "paymentStatus", orders.subtotal,
        orders.discount_amount AS "discountAmount", orders.service_charge AS "serviceCharge", orders.sst,
        orders.grand_total AS "grandTotal", orders.created_at AS "createdAt", orders.updated_at AS "updatedAt",
        orders.paid_at AS "paidAt", orders.receipt_number AS "receiptNumber", orders.payment_method AS "paymentMethod",
        restaurant_tables.table_number AS "tableNumber", customer_sessions.nickname AS "customerNickname",
        COALESCE(jsonb_agg(jsonb_build_object('menuItemId', order_items.menu_item_id, 'name', order_items.item_name, 'price', order_items.unit_price, 'quantity', order_items.quantity, 'notes', order_items.notes) ORDER BY order_items.id) FILTER (WHERE order_items.id IS NOT NULL), '[]'::jsonb) AS items
      FROM orders JOIN table_sessions ON table_sessions.id = orders.table_session_id
      JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
      JOIN customer_sessions ON customer_sessions.id = orders.customer_session_id
      LEFT JOIN order_items ON order_items.order_id = orders.id
      GROUP BY orders.id, restaurant_tables.table_number, customer_sessions.nickname
      ORDER BY orders.created_at DESC
    `)
    response.status(200).json({ orders: rows })
  } catch (error) { next(error) }
})

app.patch('/api/v1/admin/orders/:orderId/cancel', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  try {
    const { rows } = await pool.query("UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1 AND payment_status = 'pending' AND status IN ('received', 'preparing', 'ready') RETURNING id, status", [String(request.params.orderId ?? '')])
    if (!rows[0]) return response.status(409).json({ error: 'Only unpaid orders that have not been served can be cancelled.' })
    void logAuditEvent({ action: 'CANCEL_ORDER', actorId: request.user.id, targetType: 'order', targetId: rows[0].id })
    response.status(200).json({ order: rows[0] })
  } catch (error) { next(error) }
})

app.get('/api/v1/admin/audit-logs', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  const limit = Math.min(200, Math.max(1, Number.parseInt(request.query?.limit, 10) || 100))
  try {
    const { rows } = await pool.query(`SELECT audit_logs.id, audit_logs.action, audit_logs.target_type AS "targetType", audit_logs.target_id AS "targetId", audit_logs.details, audit_logs.created_at AS "createdAt", users.display_name AS "actorName", users.email AS "actorEmail" FROM audit_logs LEFT JOIN users ON users.id = audit_logs.actor_id ORDER BY audit_logs.created_at DESC LIMIT $1`, [limit])
    response.status(200).json({ logs: rows })
  } catch (error) { next(error) }
})

app.get('/api/v1/admin/dashboard', requireAuthenticatedUser, requireRole('admin'), async (_request, response, next) => {
  const today = businessDate()
  try {
    const [metrics, popularFoods, recentOrders] = await Promise.all([
      pool.query(`SELECT count(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kuching')::date = $1::date)::int AS "todayOrderCount", COALESCE(sum(grand_total) FILTER (WHERE payment_status = 'paid' AND (paid_at AT TIME ZONE 'Asia/Kuching')::date = $1::date), 0) AS "todayRevenue", count(*) FILTER (WHERE status IN ('received', 'preparing', 'ready'))::int AS "activeOrderCount" FROM orders`, [today]),
      pool.query(`SELECT order_items.item_name AS name, sum(order_items.quantity)::int AS quantity FROM orders JOIN order_items ON order_items.order_id = orders.id WHERE orders.status <> 'cancelled' AND (orders.created_at AT TIME ZONE 'Asia/Kuching')::date = $1::date GROUP BY order_items.item_name ORDER BY quantity DESC, name ASC LIMIT 5`, [today]),
      pool.query(`SELECT orders.id, orders.order_number AS "orderNumber", orders.status, orders.grand_total AS "grandTotal", orders.created_at AS "createdAt", restaurant_tables.table_number AS "tableNumber" FROM orders JOIN table_sessions ON table_sessions.id = orders.table_session_id JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id ORDER BY orders.created_at DESC LIMIT 5`),
    ])
    const requests = await pool.query("SELECT count(*)::int AS count FROM service_requests WHERE status = 'pending'")
    response.status(200).json({ dashboard: { ...metrics.rows[0], pendingRequestCount: requests.rows[0].count, popularFoods: popularFoods.rows, recentOrders: recentOrders.rows } })
  } catch (error) { next(error) }
})

app.get('/api/v1/admin/members', requireAuthenticatedUser, requireRole('admin'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query('SELECT id, concat(\'MEM-\', lpad(member_number::text, 5, \'0\')) AS "memberId", name, phone_display AS phone, email, points_balance AS "pointsBalance", status, email_notifications_enabled AS "emailNotificationsEnabled", created_at AS "createdAt", updated_at AS "updatedAt" FROM members ORDER BY created_at DESC')
    response.status(200).json({ members: rows })
  } catch (error) { next(error) }
})

app.get('/api/v1/admin/members/:memberId/points', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  try {
    const memberKey = String(request.params.memberId ?? '').trim().toUpperCase()
    const { rows } = await pool.query(`
      SELECT member_point_transactions.id, upper(member_point_transactions.type::text) AS type,
        member_point_transactions.points, member_point_transactions.eligible_spending AS "eligibleSpending",
        member_point_transactions.redemption_reference AS "redemptionReference",
        member_point_transactions.created_at AS "createdAt", rewards.name AS "rewardName",
        payments.receipt_number AS "receiptNumber"
      FROM member_point_transactions
      LEFT JOIN rewards ON rewards.id = member_point_transactions.reward_id
      LEFT JOIN payments ON payments.id = member_point_transactions.payment_id
      JOIN members ON members.id = member_point_transactions.member_id
      WHERE members.id::text = $1 OR concat('MEM-', lpad(members.member_number::text, 5, '0')) = $1
      ORDER BY member_point_transactions.created_at DESC LIMIT 50
    `, [memberKey])
    response.status(200).json({ transactions: rows.map((row) => ({ ...row, source: row.type === 'EARN' ? 'PAYMENT' : 'REWARD' })) })
  } catch (error) { next(error) }
})

app.post('/api/v1/cashier/rewards/:rewardId/redeem', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  const memberKey = String(request.body?.memberId ?? '').trim().toUpperCase()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const member = await client.query("SELECT id, concat('MEM-', lpad(member_number::text, 5, '0')) AS \"memberId\", name, points_balance AS \"pointsBalance\" FROM members WHERE (id::text = $1 OR concat('MEM-', lpad(member_number::text, 5, '0')) = $1) AND status = 'active' FOR UPDATE", [memberKey])
    const reward = await client.query('SELECT rewards.id, rewards.name, rewards.points_required AS "pointsRequired" FROM rewards JOIN menu_items ON menu_items.id = rewards.menu_item_id WHERE rewards.id = $1 AND rewards.is_available = true AND menu_items.is_available = true FOR UPDATE OF rewards, menu_items', [String(request.params.rewardId ?? '')])
    if (!member.rows[0]) throw new Error('This member is not eligible for rewards.')
    if (!reward.rows[0]) throw new Error('This reward is no longer available.')
    if (Number(member.rows[0].pointsBalance) < Number(reward.rows[0].pointsRequired)) throw new Error('This member does not have enough points.')
    const reference = `RED-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
    const balance = Number(member.rows[0].pointsBalance) - Number(reward.rows[0].pointsRequired)
    await client.query('UPDATE members SET points_balance = $1, updated_at = now() WHERE id = $2', [balance, member.rows[0].id])
    await client.query("INSERT INTO member_point_transactions (member_id, type, points, reward_id, redemption_reference) VALUES ($1, 'redeem', $2, $3, $4)", [member.rows[0].id, -Number(reward.rows[0].pointsRequired), reward.rows[0].id, reference])
    await client.query('COMMIT')
    void logAuditEvent({ action: 'REDEEM_REWARD', actorId: request.user.id, targetType: 'reward', targetId: reward.rows[0].id, details: { memberId: member.rows[0].memberId, pointsUsed: Number(reward.rows[0].pointsRequired), redemptionReference: reference } })
    response.status(201).json({ redemption: { memberName: member.rows[0].name, pointsUsed: Number(reward.rows[0].pointsRequired), pointsBalance: balance, rewardName: reward.rows[0].name, redemptionReference: reference } })
  } catch (error) {
    await client.query('ROLLBACK')
    if (String(error.message).includes('not eligible') || String(error.message).includes('no longer') || String(error.message).includes('not have enough')) return response.status(409).json({ error: error.message })
    next(error)
  } finally { client.release() }
})

function rewardInput(input) {
  const name = String(input?.name ?? '').trim()
  const menuItemId = String(input?.menuItemId ?? '').trim()
  const pointsRequired = positiveInteger(input?.pointsRequired)
  if (!name || name.length > 100 || !uuid.test(menuItemId) || !pointsRequired || pointsRequired > 1000000) throw new Error('Provide a reward name, menu item and positive points requirement.')
  return { name, menuItemId, pointsRequired, isAvailable: input?.isAvailable !== false }
}

app.get('/api/v1/admin/rewards', requireAuthenticatedUser, requireRole('admin'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name, menu_item_id AS "menuItemId", points_required AS "pointsRequired", is_available AS "isAvailable", created_at AS "createdAt", updated_at AS "updatedAt" FROM rewards ORDER BY created_at DESC')
    response.status(200).json({ rewards: rows })
  } catch (error) { next(error) }
})

app.post('/api/v1/admin/rewards', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  let input
  try { input = rewardInput(request.body) } catch (error) { return response.status(400).json({ error: error.message }) }
  try {
    const { rows } = await pool.query('INSERT INTO rewards (name, menu_item_id, points_required, is_available) VALUES ($1, $2, $3, $4) RETURNING id, name, menu_item_id AS "menuItemId", points_required AS "pointsRequired", is_available AS "isAvailable"', [input.name, input.menuItemId, input.pointsRequired, input.isAvailable])
    void logAuditEvent({ action: 'CREATE_REWARD', actorId: request.user.id, targetType: 'reward', targetId: rows[0].id, details: { name: input.name } })
    response.status(201).json({ reward: rows[0] })
  } catch (error) { if (error.code === '23505') return response.status(409).json({ error: 'A reward already exists for this menu item and points value.' }); next(error) }
})

app.patch('/api/v1/admin/rewards/:rewardId', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  let input
  try { input = rewardInput(request.body) } catch (error) { return response.status(400).json({ error: error.message }) }
  try {
    const { rows } = await pool.query('UPDATE rewards SET name = $1, menu_item_id = $2, points_required = $3, is_available = $4, updated_at = now() WHERE id = $5 RETURNING id, name, menu_item_id AS "menuItemId", points_required AS "pointsRequired", is_available AS "isAvailable"', [input.name, input.menuItemId, input.pointsRequired, input.isAvailable, String(request.params.rewardId ?? '')])
    if (!rows[0]) return response.status(404).json({ error: 'This reward is no longer available.' })
    void logAuditEvent({ action: 'UPDATE_REWARD', actorId: request.user.id, targetType: 'reward', targetId: rows[0].id, details: { name: input.name } })
    response.status(200).json({ reward: rows[0] })
  } catch (error) { if (error.code === '23505') return response.status(409).json({ error: 'A reward already exists for this menu item and points value.' }); next(error) }
})

app.get('/api/v1/admin/reports/summary', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  let range
  try { range = reportRange(request.query) } catch (error) { return response.status(400).json({ error: error.message }) }
  const filter = "payment_status = 'paid' AND status <> 'cancelled' AND (paid_at AT TIME ZONE 'Asia/Kuching')::date >= $1::date AND (paid_at AT TIME ZONE 'Asia/Kuching')::date <= $2::date"
  try {
    const [summary, methods, topFoods, statuses] = await Promise.all([
      pool.query(`SELECT count(*)::int AS "transactionCount", COALESCE(sum(grand_total), 0) AS revenue, COALESCE(avg(grand_total), 0) AS "averageBill", COALESCE(max(grand_total), 0) AS "highestBill", COALESCE(min(grand_total), 0) AS "lowestBill" FROM orders WHERE ${filter}`, [range.start, range.end]),
      pool.query(`SELECT COALESCE(payment_method, 'Other') AS method, COALESCE(sum(grand_total), 0) AS amount, count(*)::int AS "transactionCount" FROM orders WHERE ${filter} GROUP BY COALESCE(payment_method, 'Other') ORDER BY amount DESC`, [range.start, range.end]),
      pool.query(`SELECT order_items.item_name AS name, COALESCE(sum(order_items.quantity), 0)::int AS quantity, COALESCE(sum(order_items.quantity * order_items.unit_price), 0) AS sales FROM orders JOIN order_items ON order_items.order_id = orders.id WHERE ${filter} GROUP BY order_items.item_name ORDER BY sales DESC, quantity DESC, name ASC LIMIT 10`, [range.start, range.end]),
      pool.query(`SELECT status, count(*)::int AS count FROM orders WHERE (created_at AT TIME ZONE 'Asia/Kuching')::date >= $1::date AND (created_at AT TIME ZONE 'Asia/Kuching')::date <= $2::date GROUP BY status ORDER BY status`, [range.start, range.end]),
    ])
    return response.status(200).json({ range, summary: summary.rows[0], paymentMethods: methods.rows, topFoods: topFoods.rows, orderStatuses: statuses.rows })
  } catch (error) { return next(error) }
})

app.get('/api/v1/me', requireAuthenticatedUser, (request, response) => {
  response.status(200).json({ user: request.user })
})

app.get('/api/v1/admin/tables', requireAuthenticatedUser, requireRole('admin'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query('SELECT id, table_number AS "tableNumber", capacity, is_enabled AS "isEnabled", created_at AS "createdAt", updated_at AS "updatedAt" FROM restaurant_tables ORDER BY table_number ASC')
    response.status(200).json({ tables: rows })
  } catch (error) { next(error) }
})

app.post('/api/v1/admin/tables', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  let input
  try { input = tableInput(request.body) } catch (error) { return response.status(400).json({ error: error.message }) }
  try {
    const { rows } = await pool.query('INSERT INTO restaurant_tables (table_number, capacity, is_enabled) VALUES ($1, $2, $3) RETURNING id, table_number AS "tableNumber", capacity, is_enabled AS "isEnabled"', [input.tableNumber, input.capacity, input.isEnabled])
    return response.status(201).json({ table: rows[0] })
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'That table number already exists.' })
    return next(error)
  }
})

app.patch('/api/v1/admin/tables/:tableId', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  const id = String(request.params.tableId ?? '')
  let input
  try { input = tableInput(request.body) } catch (error) { return response.status(400).json({ error: error.message }) }
  try {
    const { rows } = await pool.query('UPDATE restaurant_tables SET table_number = $1, capacity = $2, is_enabled = $3, updated_at = now() WHERE id = $4 RETURNING id, table_number AS "tableNumber", capacity, is_enabled AS "isEnabled"', [input.tableNumber, input.capacity, input.isEnabled, id])
    if (!rows[0]) return response.status(404).json({ error: 'This table no longer exists.' })
    return response.status(200).json({ table: rows[0] })
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'That table number already exists.' })
    return next(error)
  }
})

app.delete('/api/v1/admin/tables/:tableId', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM restaurant_tables WHERE id = $1', [String(request.params.tableId ?? '')])
    if (!rowCount) return response.status(404).json({ error: 'This table no longer exists.' })
    return response.status(204).end()
  } catch (error) {
    if (error.code === '23503') return response.status(409).json({ error: 'This table has order history and cannot be deleted.' })
    return next(error)
  }
})

app.post('/api/v1/admin/tables/:tableId/clear', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const table = await client.query('SELECT id, table_number AS "tableNumber" FROM restaurant_tables WHERE id = $1 FOR UPDATE', [String(request.params.tableId ?? '')])
    if (!table.rows[0]) throw new Error('This table no longer exists.')
    const activeSession = await client.query("SELECT id FROM table_sessions WHERE table_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [table.rows[0].id])
    if (!activeSession.rows[0]) {
      await client.query('COMMIT')
      return response.status(200).json({ cleared: false, message: 'This table is already clear.' })
    }
    const tableSessionId = activeSession.rows[0].id
    const outstanding = await client.query("SELECT 1 FROM orders WHERE table_session_id = $1 AND status <> 'cancelled' AND payment_status <> 'paid' LIMIT 1 FOR UPDATE", [tableSessionId])
    if (outstanding.rowCount) throw new Error('This table has unpaid active orders and cannot be cleared.')
    await client.query("UPDATE customer_sessions SET left_at = COALESCE(left_at, now()) WHERE table_session_id = $1", [tableSessionId])
    await client.query("UPDATE table_sessions SET status = 'completed', updated_at = now() WHERE id = $1", [tableSessionId])
    await client.query('COMMIT')
    void logAuditEvent({ action: 'CLEAR_TABLE', actorId: request.user.id, targetType: 'table', targetId: table.rows[0].id, details: { tableNumber: table.rows[0].tableNumber } })
    return response.status(200).json({ cleared: true, tableNumber: table.rows[0].tableNumber })
  } catch (error) {
    await client.query('ROLLBACK')
    if (String(error.message).includes('unpaid active orders')) return response.status(409).json({ error: error.message })
    if (String(error.message).includes('no longer exists')) return response.status(404).json({ error: error.message })
    return next(error)
  } finally { client.release() }
})

app.get('/api/v1/admin/categories', requireAuthenticatedUser, requireRole('admin'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name, icon, sort_order AS "sortOrder", is_enabled AS "isEnabled", created_at AS "createdAt", updated_at AS "updatedAt" FROM categories ORDER BY sort_order ASC, name ASC')
    response.status(200).json({ categories: rows })
  } catch (error) { next(error) }
})

app.post('/api/v1/admin/categories', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  let input
  try { input = categoryInput(request.body) } catch (error) { return response.status(400).json({ error: error.message }) }
  try {
    const { rows } = await pool.query('INSERT INTO categories (name, icon, sort_order, is_enabled) VALUES ($1, $2, $3, $4) RETURNING id, name, icon, sort_order AS "sortOrder", is_enabled AS "isEnabled"', [input.name, input.icon, input.sortOrder, input.isEnabled])
    return response.status(201).json({ category: rows[0] })
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'A category with this name already exists.' })
    return next(error)
  }
})

app.patch('/api/v1/admin/categories/:categoryId', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  let input
  try { input = categoryInput(request.body) } catch (error) { return response.status(400).json({ error: error.message }) }
  try {
    const { rows } = await pool.query('UPDATE categories SET name = $1, icon = $2, sort_order = $3, is_enabled = $4, updated_at = now() WHERE id = $5 RETURNING id, name, icon, sort_order AS "sortOrder", is_enabled AS "isEnabled"', [input.name, input.icon, input.sortOrder, input.isEnabled, String(request.params.categoryId ?? '')])
    if (!rows[0]) return response.status(404).json({ error: 'This category no longer exists.' })
    return response.status(200).json({ category: rows[0] })
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'A category with this name already exists.' })
    return next(error)
  }
})

app.delete('/api/v1/admin/categories/:categoryId', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM categories WHERE id = $1', [String(request.params.categoryId ?? '')])
    if (!rowCount) return response.status(404).json({ error: 'This category no longer exists.' })
    return response.status(204).end()
  } catch (error) {
    if (error.code === '23503') return response.status(409).json({ error: 'This category is used by menu items and cannot be deleted.' })
    return next(error)
  }
})

app.get('/api/v1/admin/menu-items', requireAuthenticatedUser, requireRole('admin', 'cashier', 'kitchen'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT menu_items.id, menu_items.name, menu_items.description, menu_items.price,
        menu_items.image_url AS "imageUrl", menu_items.is_available AS "isAvailable",
        menu_items.is_popular AS "isPopular", menu_items.category_id AS "categoryId",
        categories.name AS "categoryName", menu_items.created_at AS "createdAt", menu_items.updated_at AS "updatedAt"
      FROM menu_items LEFT JOIN categories ON categories.id = menu_items.category_id
      ORDER BY menu_items.name ASC
    `)
    response.status(200).json({ items: rows })
  } catch (error) { next(error) }
})

app.post('/api/v1/admin/menu-items', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  let input
  try { input = menuItemInput(request.body) } catch (error) { return response.status(400).json({ error: error.message }) }
  try {
    if (input.categoryId) {
      const category = await pool.query('SELECT 1 FROM categories WHERE id = $1', [input.categoryId])
      if (!category.rowCount) return response.status(400).json({ error: 'Choose an existing category.' })
    }
    const { rows } = await pool.query('INSERT INTO menu_items (category_id, name, description, price, image_url, ingredients, allergy_information, is_available, is_popular) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9) RETURNING id, name, description, price, image_url AS "imageUrl", ingredients, allergy_information AS "allergyInformation", is_available AS "isAvailable", is_popular AS "isPopular", category_id AS "categoryId"', [input.categoryId, input.name, input.description, input.price, input.imageUrl, JSON.stringify(input.ingredients), JSON.stringify(input.allergyInformation), input.isAvailable, input.isPopular])
    return response.status(201).json({ item: rows[0] })
  } catch (error) { return next(error) }
})

app.patch('/api/v1/admin/menu-items/:itemId', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  let input
  try { input = menuItemInput(request.body) } catch (error) { return response.status(400).json({ error: error.message }) }
  try {
    if (input.categoryId) {
      const category = await pool.query('SELECT 1 FROM categories WHERE id = $1', [input.categoryId])
      if (!category.rowCount) return response.status(400).json({ error: 'Choose an existing category.' })
    }
    const { rows } = await pool.query('UPDATE menu_items SET category_id = $1, name = $2, description = $3, price = $4, image_url = $5, ingredients = $6::jsonb, allergy_information = $7::jsonb, is_available = $8, is_popular = $9, updated_at = now() WHERE id = $10 RETURNING id, name, description, price, image_url AS "imageUrl", ingredients, allergy_information AS "allergyInformation", is_available AS "isAvailable", is_popular AS "isPopular", category_id AS "categoryId"', [input.categoryId, input.name, input.description, input.price, input.imageUrl, JSON.stringify(input.ingredients), JSON.stringify(input.allergyInformation), input.isAvailable, input.isPopular, String(request.params.itemId ?? '')])
    if (!rows[0]) return response.status(404).json({ error: 'This menu item no longer exists.' })
    return response.status(200).json({ item: rows[0] })
  } catch (error) { return next(error) }
})

app.patch('/api/v1/admin/menu-items/:itemId/availability', requireAuthenticatedUser, requireRole('admin', 'cashier', 'kitchen'), async (request, response, next) => {
  if (typeof request.body?.isAvailable !== 'boolean') return response.status(400).json({ error: 'Availability must be true or false.' })
  try {
    const { rows } = await pool.query('UPDATE menu_items SET is_available = $1, updated_at = now() WHERE id = $2 RETURNING id, name, is_available AS "isAvailable"', [request.body.isAvailable, String(request.params.itemId ?? '')])
    if (!rows[0]) return response.status(404).json({ error: 'This menu item no longer exists.' })
    return response.status(200).json({ item: rows[0] })
  } catch (error) { return next(error) }
})

app.delete('/api/v1/admin/menu-items/:itemId', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM menu_items WHERE id = $1', [String(request.params.itemId ?? '')])
    if (!rowCount) return response.status(404).json({ error: 'This menu item no longer exists.' })
    return response.status(204).end()
  } catch (error) { return next(error) }
})

app.use((error, _request, response, _next) => {
  console.error('[API] Unhandled request error:', error)
  response.status(500).json({ error: 'The server could not complete this request.' })
})

app.use((_request, response) => response.status(404).json({ error: 'Route not found.' }))

app.listen(port, () => console.info(`[API] DineOS PostgreSQL API listening on port ${port}`))
  const textList = (value) => Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 50) : String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 50)
