import 'dotenv/config'
import { createHash } from 'node:crypto'
import { paymentPlan, selectPaymentOrders } from './paymentSelection.js'
import { registerHandoffRoutes } from './handoffs.js'
import cors from 'cors'
import express from 'express'
import pg from 'pg'
import { cashTenderInCents } from './cashTender.js'
import { buildCounterOrder, CounterOrderValidationError } from './counterOrder.js'
import { paidReceiptCondition } from './paidReceipt.js'
import { registerShopSettingsRoutes, loadStoreSettings } from './shopSettings.js'
import { PosValidationError, validateOptionGroups } from './posRules.js'
import { registerTakeAwayRoutes } from './takeAwayOrders.js'
import { validateOrderType, resolveItemOrderTypes, summarizeOrderType } from './orderType.js'
import { registerOrderChangeRoutes } from './orderChanges.js'
import { registerOrderDetailsRoute } from './orderDetails.js'
import { registerPaymentRecoveryRoute } from './paymentRecovery.js'
import { registerCustomerRequestHistory } from './customerRequests.js'
import { registerRefundRoutes, loadDailyRefundTotals } from './refunds.js'
import { FloorLayoutConflictError, FloorLayoutValidationError, validateFloorLayoutUpdate } from './tableFloorLayout.js'
import { validateFreePlan } from './freeFloorLayout.js'
import { registerKitchenEstimateRoutes, loadKitchenEstimates } from './kitchenEstimate.js'
import { createSupabaseTokenVerifier, createAuthenticatedUserMiddleware } from './authentication.js'
import { startApiServer } from './startServer.js'
import { createVerifiedMemberMiddleware, registerMemberEmailRoutes } from './memberEmailAuth.js'

const { Pool } = pg
const port = Number(process.env.PORT) || 4000
const allowedOrigins = String(process.env.CLIENT_ORIGINS ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean)
const isDevelopment = process.env.NODE_ENV !== 'production'
const supabaseUrl = String(process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const app = express()
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

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

const verifySupabaseAccessToken = createSupabaseTokenVerifier({ supabaseUrl })
const requireAuthenticatedUser = createAuthenticatedUserMiddleware({ verifyToken: verifySupabaseAccessToken, pool })
const memberPublishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim()
const memberEmailOtpEnabled = process.env.MEMBER_EMAIL_OTP_ENABLED === 'true' && Boolean(supabaseUrl && memberPublishableKey)
const requireVerifiedMember = createVerifiedMemberMiddleware({ supabaseUrl, publishableKey: memberPublishableKey, enabled: memberEmailOtpEnabled })
registerPaymentRecoveryRoute(app, { pool, requireAuthenticatedUser, requireRole })
registerCustomerRequestHistory(app, { pool, requireCustomerSession })
registerRefundRoutes(app, { pool, requireAuthenticatedUser, requireRole })
app.get('/api/v1/public/member-auth-config', (_request, response) => {
  response.set('Cache-Control', 'no-store').json({ emailOtpEnabled: memberEmailOtpEnabled })
})

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
    optionGroups: validateOptionGroups(input?.optionGroups ?? []),
  }
}

function orderCartItems(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 30) throw new Error('Your cart must contain between 1 and 30 items.')
  const items = input.map((item) => ({
    menuItemId: String(item?.menuItemId ?? '').trim(),
    quantity: positiveInteger(item?.quantity),
    notes: String(item?.notes ?? item?.specialInstructions ?? '').trim().slice(0, 500),
    selections: item?.selections ?? [],
    orderType: item?.orderType === undefined ? undefined : validateOrderType(item.orderType),
  }))
  if (items.some((item) => !uuid.test(item.menuItemId) || !item.quantity || item.quantity > 50)) throw new Error('Your cart contains an invalid item or quantity.')
  // Distinct options/notes may produce separate lines for the same dish.
  if (items.some((item) => !Array.isArray(item.selections))) throw new Error('Invalid dish options.')
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

registerShopSettingsRoutes(app, { pool, requireAuthenticatedUser, requireRole, logAuditEvent })
registerKitchenEstimateRoutes(app, { pool })
registerOrderChangeRoutes(app, { pool, requireAuthenticatedUser, requireRole })
registerOrderDetailsRoute(app, { pool, requireAuthenticatedUser, requireRole })
registerHandoffRoutes(app, { pool, requireAuthenticatedUser, requireRole })

async function insertPreparedOrder(client, { tableSessionId, customerSessionId, memberId = null, cartItems, requestId, publicOrder = false, settingsRevision, orderType }) {
  cartItems = resolveItemOrderTypes(cartItems, orderType)
  orderType = summarizeOrderType(cartItems)
  const settings = await loadStoreSettings(client)
  if (settingsRevision !== undefined && settingsRevision !== settings.revision) throw new PosValidationError('Shop settings changed. Refresh the page and review the order total.', 409)
  if (publicOrder && !settings.isAcceptingOrders) throw new PosValidationError(settings.orderingMessage, 409)
  const menu = await client.query('SELECT menu_items.id, menu_items.name, menu_items.price, menu_items.option_groups AS "optionGroups", menu_items.is_available AS "isAvailable", (categories.id IS NULL OR categories.is_enabled) AS "categoryEnabled" FROM menu_items LEFT JOIN categories ON categories.id = menu_items.category_id WHERE menu_items.id = ANY($1::uuid[]) FOR SHARE OF menu_items', [cartItems.map((item) => item.menuItemId)])
  const bill = buildCounterOrder(cartItems, menu.rows, settings.config)
  const addition = await client.query("SELECT EXISTS(SELECT 1 FROM orders WHERE table_session_id = $1 AND status <> 'cancelled') AS present", [tableSessionId])
  const created = await client.query(`INSERT INTO orders (table_session_id, customer_session_id, member_id, status, payment_status, subtotal, service_charge, sst, grand_total, client_request_id, service_charge_rate, sst_rate, is_addition, order_type)
    VALUES ($1, $2, $3, 'received', 'pending', $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id, order_type AS "orderType", table_order_number AS "tableOrderNumber", status, payment_status AS "paymentStatus", grand_total AS "grandTotal", created_at AS "createdAt", is_addition AS "isAddition"`,
  [tableSessionId, customerSessionId, memberId, bill.subtotal, bill.serviceCharge, bill.sst, bill.grandTotal, requestId, bill.serviceChargeRate, bill.sstRate, addition.rows[0].present, orderType])
  for (const item of bill.items) await client.query('INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, notes, selections, option_snapshot, order_type) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)', [created.rows[0].id, item.id, item.name, item.unitPrice, item.quantity, item.notes, JSON.stringify(item.selections), JSON.stringify(item.optionSnapshot), item.orderType])
  return created
}

registerTakeAwayRoutes(app, { pool, requireAuthenticatedUser, requireRole })

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
        menu_items.image_url AS "imageUrl", menu_items.option_groups AS "optionGroups", menu_items.is_available AS "isAvailable",
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

registerMemberEmailRoutes(app, { pool, requireCustomerSession, requireVerifiedMember, memberInput, memberResponse, personalMemberSession })

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
  try { validateOrderType(request.body?.orderType); cartItems = orderCartItems(request.body?.items) } catch (error) { return response.status(400).json({ error: error.message }) }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query('SELECT id, order_type AS "orderType", table_order_number AS "tableOrderNumber", status, payment_status AS "paymentStatus", grand_total AS "grandTotal", created_at AS "createdAt" FROM orders WHERE customer_session_id = $1 AND client_request_id = $2', [request.customerSession.id, requestId])
    if (existing.rows[0]) {
      await client.query('COMMIT')
      return response.status(200).json({ order: existing.rows[0], duplicate: true })
    }
    const session = await client.query("SELECT customer_sessions.id FROM customer_sessions JOIN table_sessions ON table_sessions.id = customer_sessions.table_session_id WHERE customer_sessions.id = $1 AND customer_sessions.left_at IS NULL AND table_sessions.status = 'active' FOR UPDATE OF customer_sessions, table_sessions", [request.customerSession.id])
    if (!session.rows[0]) throw new Error('Your table session is no longer active.')
    const created = await insertPreparedOrder(client, { tableSessionId: request.customerSession.tableSessionId, customerSessionId: request.customerSession.id, memberId: request.customerSession.isSharedTable ? null : request.customerSession.memberId, cartItems, requestId, publicOrder: true, settingsRevision: request.body?.settingsRevision, orderType: request.body?.orderType })
    await client.query('COMMIT')
    return response.status(201).json({ order: created.rows[0], duplicate: false })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') {
      const existing = await pool.query('SELECT id, order_type AS "orderType", table_order_number AS "tableOrderNumber", status, payment_status AS "paymentStatus", grand_total AS "grandTotal", created_at AS "createdAt" FROM orders WHERE customer_session_id = $1 AND client_request_id = $2', [request.customerSession.id, requestId])
      if (existing.rows[0]) return response.status(200).json({ order: existing.rows[0], duplicate: true })
    }
    if (error instanceof PosValidationError || error instanceof CounterOrderValidationError) return response.status(error.status).json({ error: error.message })
    if (String(error.message).includes('no longer available') || String(error.message).includes('no longer active')) return response.status(409).json({ error: error.message })
    return next(error)
  } finally { client.release() }
})

app.get('/api/v1/public/orders', requireCustomerSession, async (request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT orders.id, orders.customer_session_id AS "customerSessionId", customer_sessions.created_by_cashier AS "isCounterOrder",
        orders.customer_session_id = $1::uuid AS "isCurrentCustomer",
        orders.order_type AS "orderType", orders.table_order_number AS "tableOrderNumber", restaurant_tables.table_number AS "tableNumber", orders.status, orders.paid_amount AS "paidAmount", orders.payment_status AS "paymentStatus",
        orders.subtotal, orders.discount_amount AS "discountAmount",
        orders.service_charge_rate AS "serviceChargeRate", orders.sst_rate AS "sstRate", orders.service_charge AS "serviceCharge", orders.sst, orders.grand_total AS "grandTotal",
        orders.created_at AS "createdAt", orders.updated_at AS "updatedAt",
        COALESCE(jsonb_agg(jsonb_build_object('id', order_items.id, 'menuItemId', order_items.menu_item_id, 'name', order_items.item_name, 'price', order_items.unit_price, 'orderType', order_items.order_type, 'quantity', order_items.quantity, 'paidQuantity', order_items.paid_quantity, 'fulfilledQuantity', order_items.fulfilled_quantity, 'selections', order_items.selections, 'optionSnapshot', order_items.option_snapshot, 'notes', order_items.notes, 'imageUrl', menu_items.image_url) ORDER BY order_items.id) FILTER (WHERE order_items.id IS NOT NULL), '[]'::jsonb) AS items
      FROM orders
        JOIN customer_sessions ON customer_sessions.id = orders.customer_session_id
        JOIN table_sessions ON table_sessions.id = orders.table_session_id
        JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
        LEFT JOIN order_items ON order_items.order_id = orders.id
        LEFT JOIN menu_items ON menu_items.id = order_items.menu_item_id
      WHERE orders.table_session_id = $2
        AND customer_sessions.table_session_id = $2
        AND (orders.customer_session_id = $1 OR customer_sessions.created_by_cashier = true)
      GROUP BY orders.id, customer_sessions.created_by_cashier, restaurant_tables.table_number
      ORDER BY orders.created_at DESC
    `, [request.customerSession.id, request.customerSession.tableSessionId])
    let estimates = null
    if (rows.some((order) => order.status === 'received')) {
      try { estimates = await loadKitchenEstimates(pool) }
      catch (error) { console.warn('[API] Kitchen estimate unavailable:', error.message) }
    }
    response.set('Cache-Control', 'no-store').status(200).json({ orders: rows.map((order) => ({ ...order, preparationEstimate: estimates?.byOrder.get(order.id) ?? null })) })
  } catch (error) { next(error) }
})

app.patch('/api/v1/public/orders/:orderId/cancel', requireCustomerSession, async (request, response, next) => {
  const orderId = String(request.params.orderId ?? '')
  if (!uuid.test(orderId)) return response.status(400).json({ error: 'A valid order is required.' })
  try {
    const { rows } = await pool.query("UPDATE orders SET status = 'cancelled', version = version + 1, updated_at = now() WHERE id = $1 AND customer_session_id = $2 AND status = 'received' AND payment_status <> 'paid' AND receipt_number IS NULL AND NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = orders.id AND paid_quantity > 0) RETURNING id, status, payment_status AS \"paymentStatus\", updated_at AS \"updatedAt\"", [orderId, request.customerSession.id])
    if (!rows[0]) return response.status(409).json({ error: 'Only unpaid orders that have not reached the kitchen can be cancelled.' })
    return response.status(200).json({ order: rows[0] })
  } catch (error) { return next(error) }
})

app.get('/api/v1/public/table-summary', requireCustomerSession, async (request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT customer_sessions.id, customer_sessions.nickname AS "customerNickname",
        customer_sessions.created_by_cashier AS "isCounterOrder",
        COALESCE(sum(orders.subtotal - orders.paid_subtotal), 0) AS subtotal,
        COALESCE(sum(orders.service_charge - orders.paid_service_charge), 0) AS "serviceCharge",
        COALESCE(sum(orders.sst - orders.paid_sst), 0) AS sst,
        COALESCE(sum(orders.grand_total - orders.paid_amount), 0) AS "grandTotal",
        COALESCE((array_agg(orders.status::text ORDER BY orders.created_at DESC) FILTER (WHERE orders.id IS NOT NULL))[1], 'no_orders') AS status,
        count(orders.id)::int AS "outstandingOrderCount",
        count(orders.id) FILTER (WHERE orders.order_type IN ('take_away', 'mixed'))::int AS "takeAwayOrderCount",
        count(orders.id) FILTER (WHERE orders.order_type IN ('dine_in', 'mixed'))::int AS "dineInOrderCount",
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
        AND (customer_sessions.left_at IS NULL OR customer_sessions.created_by_cashier = true)
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
      SELECT orders.id, orders.order_type AS "orderType", orders.order_number AS "orderNumber", orders.version, orders.is_addition AS "isAddition", orders.revision_note AS "revisionNote", orders.status, orders.paid_amount AS "paidAmount", orders.payment_status AS "paymentStatus", orders.grand_total AS "grandTotal", orders.created_at AS "createdAt",
        restaurant_tables.table_number AS "tableNumber", customer_sessions.nickname AS "customerNickname",
        COALESCE(jsonb_agg(jsonb_build_object('id', order_items.id, 'menuItemId', order_items.menu_item_id, 'name', order_items.item_name, 'price', order_items.unit_price, 'orderType', order_items.order_type, 'quantity', order_items.quantity, 'paidQuantity', order_items.paid_quantity, 'fulfilledQuantity', order_items.fulfilled_quantity, 'selections', order_items.selections, 'optionSnapshot', order_items.option_snapshot, 'notes', order_items.notes, 'imageUrl', menu_items.image_url) ORDER BY order_items.id) FILTER (WHERE order_items.id IS NOT NULL), '[]'::jsonb) AS items
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

const kitchenTransitions = { received: 'preparing', preparing: 'ready' }

app.patch('/api/v1/kitchen/orders/:orderId/status', requireAuthenticatedUser, requireRole('admin', 'kitchen'), async (request, response, next) => {
  const expectedStatus = String(request.body?.expectedStatus ?? '').toLowerCase()
  const status = String(request.body?.status ?? '').toLowerCase()
  if (kitchenTransitions[expectedStatus] !== status) return response.status(400).json({ error: 'This order status transition is not valid.' })
  try {
    const { rows } = await pool.query('UPDATE orders SET status = $1::order_status, version = version + 1, updated_at = now() WHERE id = $2 AND status = $3::order_status AND ($4::int IS NULL OR version = $4) RETURNING id, status, version, updated_at AS "updatedAt"', [status, String(request.params.orderId ?? ''), expectedStatus, request.body?.expectedVersion ?? null])
    if (!rows[0]) return response.status(409).json({ error: 'This order was updated by another user. Refresh and try again.' })
    return response.status(200).json({ order: rows[0] })
  } catch (error) { return next(error) }
})

app.post('/api/v1/cashier/payments', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  const requestId = String(request.body?.requestId ?? '')
  if (!uuid.test(requestId)) return response.status(400).json({ error: 'Reload the cashier page before paying. A payment request ID is required.' })
  const fingerprint = createHash('sha256').update(JSON.stringify(request.body)).digest('hex')
  const orderIds = [...new Set(Array.isArray(request.body?.orderIds) ? request.body.orderIds.map((id) => String(id)) : [])]
  const paymentMethod = String(request.body?.paymentMethod ?? '')
  if (!orderIds.length || orderIds.length > 50 || orderIds.some((id) => !uuid.test(id))) return response.status(400).json({ error: 'Choose valid orders to pay.' })
  if (!paymentMethods.has(paymentMethod)) return response.status(400).json({ error: 'Choose a valid payment method.' })
  const cashReceivedCents = paymentMethod === 'Cash' ? cashTenderInCents(request.body?.cashReceived) : null
  if (paymentMethod === 'Cash' && cashReceivedCents === null) return response.status(400).json({ error: 'Enter a valid cash amount with up to 2 decimal places.' })
  const expectedAmountCents = request.body?.expectedAmount === undefined ? null : cashTenderInCents(request.body.expectedAmount)
  if (request.body?.expectedAmount !== undefined && expectedAmountCents === null) return response.status(400).json({ error: 'The confirmed bill total is invalid.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [requestId])
    const previous = await client.query(`SELECT payments.*, restaurant_tables.id AS "tableId", restaurant_tables.table_number AS "tableNumber" FROM payments JOIN table_sessions ON table_sessions.id = payments.table_session_id JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id WHERE request_id = $1`, [requestId])
    if (previous.rows[0]) {
      const saved = previous.rows[0]
      if (saved.request_fingerprint !== fingerprint || saved.cashier_id !== request.user.id) throw new PosValidationError('This payment request was already used for a different bill.', 409)
      await client.query('COMMIT')
      return response.json({ payment: { receiptNumber: saved.receipt_number, paidAt: saved.paid_at, amount: saved.amount, cashReceived: saved.cash_received, changeAmount: saved.change_amount, tableId: saved.tableId, tableNumber: saved.tableNumber, tableSessionId: saved.table_session_id } })
    }
    const { rows: orders } = await client.query(`
      SELECT orders.id, orders.order_type AS "orderType", orders.table_session_id AS "tableSessionId", orders.customer_session_id AS "sessionId", (SELECT nickname FROM customer_sessions WHERE id = orders.customer_session_id) AS "customerNickname", orders.member_id AS "memberId", restaurant_tables.id AS "tableId", restaurant_tables.table_number AS "tableNumber",
        orders.status, orders.version, orders.paid_amount AS "paidAmount", orders.payment_status AS "paymentStatus", orders.service_charge_rate AS "serviceChargeRate", orders.sst_rate AS "sstRate",
        COALESCE((SELECT sum(order_items.unit_price * order_items.quantity) FROM order_items WHERE order_items.order_id = orders.id), 0) AS subtotal
      FROM orders
      JOIN table_sessions ON table_sessions.id = orders.table_session_id
      JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
      WHERE orders.id = ANY($1::uuid[])
      ORDER BY orders.id
      FOR UPDATE OF orders
    `, [orderIds])
    if (orders.length !== orderIds.length) throw new Error('One or more orders no longer exist.')
    const tableSessionId = orders[0].tableSessionId
    if (orders.some((order) => order.tableSessionId !== tableSessionId || order.status === 'cancelled' || order.paymentStatus === 'paid')) throw new PosValidationError('Only unpaid, non-cancelled orders from one table can be paid together.', 409)
    for (const order of orders) {
      if (request.body?.versions?.[order.id] !== order.version) throw new PosValidationError('An order has changed. Refresh and confirm payment again.', 409)
      order.items = (await client.query('SELECT id, menu_item_id AS "menuItemId", item_name AS name, unit_price AS price, quantity, paid_quantity AS "paidQuantity", order_type AS "orderType", notes, option_snapshot AS "optionSnapshot", selections FROM order_items WHERE order_id = $1 ORDER BY id', [order.id])).rows
    }
    const selected = selectPaymentOrders(orders, request.body.selections)
    const subtotal = roundMoney(selected.reduce((total, order) => total + order.subtotal, 0))
    const discount = discountInput(request.body?.discount, subtotal)
    const discountedSubtotal = roundMoney(subtotal - discount.amount)
    const { finalOrders, grandTotal: amount } = paymentPlan(orders, request.body.selections, discount.amount)
    const amountCents = cashTenderInCents(amount)
    if (amountCents === null) throw new Error('An order has invalid totals and cannot be paid.')
    if (expectedAmountCents !== null && expectedAmountCents !== amountCents) {
      await client.query('ROLLBACK')
      return response.status(409).json({ error: 'The bill total has changed. Review the bill and confirm payment again.' })
    }
    if (paymentMethod === 'Cash' && cashReceivedCents < amountCents) {
      await client.query('ROLLBACK')
      return response.status(400).json({ error: `Cash is short by RM ${((amountCents - cashReceivedCents) / 100).toFixed(2)}.` })
    }
    const cashReceived = paymentMethod === 'Cash' ? cashReceivedCents / 100 : null
    const changeAmount = paymentMethod === 'Cash' ? (cashReceivedCents - amountCents) / 100 : null
    const date = businessDate()
    const sequence = await client.query('INSERT INTO receipt_sequences (business_date, last_number) VALUES ($1::date, 1) ON CONFLICT (business_date) DO UPDATE SET last_number = receipt_sequences.last_number + 1, updated_at = now() RETURNING last_number', [date])
    const receiptNumber = `R-${date.replaceAll('-', '')}-${String(sequence.rows[0].last_number).padStart(4, '0')}`
    const payment = await client.query('INSERT INTO payments (receipt_number, table_session_id, cashier_id, payment_method, amount, cash_received, change_amount, restaurant_name, shop_snapshot) VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT name FROM shop_settings WHERE id = 1), (SELECT jsonb_build_object(\'name\', name) || config FROM shop_settings WHERE id = 1)) RETURNING id, receipt_number AS "receiptNumber", amount, cash_received AS "cashReceived", change_amount AS "changeAmount", restaurant_name AS "restaurantName", paid_at AS "paidAt"', [receiptNumber, tableSessionId, request.user.id, paymentMethod, amount, cashReceived, changeAmount])
    await client.query('UPDATE payments SET order_snapshot = $1::jsonb, request_id = $2, request_fingerprint = $3 WHERE id = $4', [JSON.stringify(finalOrders), requestId, fingerprint, payment.rows[0].id])
    const memberIds = [...new Set(selected.map((order) => order.memberId))]
    let loyalty = null
    if (memberIds.length === 1 && memberIds[0]) {
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
    for (const order of finalOrders) {
      for (const item of order.items) await client.query('UPDATE order_items SET paid_quantity = paid_quantity + $1 WHERE id = $2', [item.quantity, item.id])
      await client.query(`UPDATE orders SET paid_subtotal = paid_subtotal + $1, discount_amount = discount_amount + $2,
        service_charge = paid_service_charge + $3 + $9, sst = paid_sst + $4 + $10,
        grand_total = paid_amount + $5 + $11, paid_service_charge = paid_service_charge + $3, paid_sst = paid_sst + $4,
        paid_amount = paid_amount + $5, payment_status = CASE WHEN $12 THEN 'paid'::payment_status ELSE 'pending'::payment_status END,
        receipt_number = $6, payment_method = $7,
        paid_at = CASE WHEN $12 THEN now() ELSE paid_at END, version = version + 1, updated_at = now() WHERE id = $8`,
      [order.subtotal, order.discountAmount, order.serviceCharge, order.sst, order.grandTotal, receiptNumber, paymentMethod, order.id, order.remaining.serviceCharge, order.remaining.sst, order.remaining.grandTotal, order.fullyPaid])
    }
    await client.query('COMMIT')
    void logAuditEvent({ action: 'COMPLETE_PAYMENT', actorId: request.user.id, targetType: 'receipt', targetId: receiptNumber, details: { tableNumber: orders[0].tableNumber, paymentMethod, amount, ...(paymentMethod === 'Cash' ? { cashReceived, changeAmount } : {}), ...(loyalty ? { pointsEarned: loyalty.points } : {}) } })
    return response.status(201).json({ payment: { ...payment.rows[0], tableSessionId, tableId: orders[0].tableId, tableNumber: orders[0].tableNumber, paymentMethod, orderIds: finalOrders.map((order) => order.id), loyalty } })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error instanceof PosValidationError) return response.status(error.status).json({ error: error.message })
    if (String(error.message).includes('orders') || String(error.message).includes('Only unpaid') || String(error.message).includes('invalid totals') || String(error.message).includes('discount')) return response.status(409).json({ error: error.message })
    return next(error)
  } finally { client.release() }
})

app.get('/api/v1/cashier/receipts/:receiptNumber', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT payments.receipt_number AS "receiptNumber", payments.payment_method AS "paymentMethod", payments.amount,
        payments.cash_received AS "cashReceived", payments.change_amount AS "changeAmount",
        payments.restaurant_name AS "restaurantName", payments.shop_snapshot AS "shopSnapshot",
        payments.paid_at AS "paidAt", restaurant_tables.table_number AS "tableNumber",
        users.display_name AS "cashierName",
        COALESCE(payments.order_snapshot, jsonb_agg(jsonb_build_object('id', orders.id, 'orderType', orders.order_type, 'subtotal', orders.subtotal, 'discountAmount', orders.discount_amount, 'serviceCharge', orders.service_charge, 'sst', orders.sst, 'grandTotal', orders.grand_total, 'customerNickname', customer_sessions.nickname, 'items', COALESCE(items.items, '[]'::jsonb)) ORDER BY orders.created_at) FILTER (WHERE orders.id IS NOT NULL), '[]'::jsonb) AS orders
      FROM payments
      JOIN table_sessions ON table_sessions.id = payments.table_session_id
      JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
      LEFT JOIN users ON users.id = payments.cashier_id
      LEFT JOIN orders ON orders.receipt_number = payments.receipt_number
      LEFT JOIN customer_sessions ON customer_sessions.id = orders.customer_session_id
      LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id', order_items.id, 'menuItemId', order_items.menu_item_id, 'name', order_items.item_name, 'price', order_items.unit_price, 'orderType', order_items.order_type, 'quantity', order_items.quantity, 'paidQuantity', order_items.paid_quantity, 'fulfilledQuantity', order_items.fulfilled_quantity, 'selections', order_items.selections, 'optionSnapshot', order_items.option_snapshot, 'notes', order_items.notes) ORDER BY order_items.id) AS items FROM order_items WHERE order_items.order_id = orders.id) items ON true
      WHERE payments.receipt_number = $1 AND ${paidReceiptCondition}
      GROUP BY payments.id, restaurant_tables.table_number, users.display_name
    `, [String(request.params.receiptNumber ?? '')])
    if (!rows[0]) return response.status(404).json({ error: 'Receipt not found.' })
    return response.status(200).json({ receipt: rows[0] })
  } catch (error) { return next(error) }
})

app.post('/api/v1/cashier/receipts/:receiptNumber/reprint', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  try {
    const { rows } = await pool.query(`SELECT payments.receipt_number AS "receiptNumber", restaurant_tables.table_number AS "tableNumber" FROM payments JOIN table_sessions ON table_sessions.id = payments.table_session_id JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id WHERE payments.receipt_number = $1 AND ${paidReceiptCondition}`, [String(request.params.receiptNumber ?? '')])
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
    const refundSummary = await loadDailyRefundTotals(pool, shiftDate)
    const summary = { ...breakdown, grandTotal, ...refundSummary, netReceipts: refundSummary.refundsAvailable ? roundMoney(grandTotal - refundSummary.refundTotal) : null, transactionCount: payments.length, averageBill: payments.length ? roundMoney(grandTotal / payments.length) : 0 }
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
  if (!['callWaiter', 'requestBill', 'water', 'extraSpoon'].includes(requestType)) return response.status(400).json({ error: 'Choose a service request type.' })
  try {
    const details = note ? { note } : {}
    if (requestType === 'requestBill') {
      if (!['table', 'split'].includes(request.body?.billMode ?? 'table')) return response.status(400).json({ error: 'Choose table bill or split bill.' })
      const bill = await pool.query("SELECT count(*)::int AS count, COALESCE(sum(grand_total - paid_amount), 0) AS amount FROM orders WHERE table_session_id = $1 AND payment_status <> 'paid' AND status <> 'cancelled'", [request.customerSession.tableSessionId])
      if (!bill.rows[0].count) return response.status(409).json({ error: 'There are no unpaid items on this table.' })
      details.billMode = request.body?.billMode ?? 'table'
      details.requestedAmount = details.billMode === 'table' ? Number(bill.rows[0].amount) : null
      details.note = details.billMode === 'split' ? 'Select dishes and quantities with the cashier.' : 'One bill for all remaining table items.'
    }
    const { rows } = await pool.query("INSERT INTO service_requests (table_session_id, customer_session_id, request_type, status, details) VALUES ($1, $2, $3, 'pending', $4::jsonb) RETURNING id, request_type AS \"requestType\", status, created_at AS \"createdAt\"", [request.customerSession.tableSessionId, request.customerSession.id, requestType, JSON.stringify(details)])
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
        SELECT count(*) AS count, COALESCE(sum(grand_total - paid_amount) FILTER (WHERE payment_status <> 'paid' AND status <> 'cancelled'), 0) AS unpaid_total,
          bool_and(status = 'served') FILTER (WHERE status <> 'cancelled' AND payment_status <> 'paid') AS all_served,
          bool_and((payment_status = 'paid' AND status = 'served') OR status = 'cancelled') AS ready_to_clear
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
      SELECT orders.id, orders.version, orders.order_type AS "orderType", orders.order_number AS "orderNumber", orders.table_session_id AS "tableSessionId", orders.member_id AS "memberId", orders.status,
        orders.paid_amount AS "paidAmount", orders.payment_status AS "paymentStatus", (orders.subtotal - orders.paid_subtotal) AS subtotal, orders.discount_amount AS "discountAmount",
        orders.service_charge_rate AS "serviceChargeRate", orders.sst_rate AS "sstRate", (orders.service_charge - orders.paid_service_charge) AS "serviceCharge", (orders.sst - orders.paid_sst) AS sst, (orders.grand_total - orders.paid_amount) AS "grandTotal",
        orders.created_at AS "createdAt", orders.updated_at AS "updatedAt", restaurant_tables.id AS "tableId", restaurant_tables.table_number AS "tableNumber",
        customer_sessions.id AS "sessionId", customer_sessions.nickname AS "customerNickname",
        COALESCE(jsonb_agg(jsonb_build_object('id', order_items.id, 'menuItemId', order_items.menu_item_id, 'name', order_items.item_name, 'price', order_items.unit_price, 'orderType', order_items.order_type, 'quantity', order_items.quantity, 'paidQuantity', order_items.paid_quantity, 'fulfilledQuantity', order_items.fulfilled_quantity, 'selections', order_items.selections, 'optionSnapshot', order_items.option_snapshot, 'notes', order_items.notes) ORDER BY order_items.id) FILTER (WHERE order_items.id IS NOT NULL), '[]'::jsonb) AS items
      FROM orders JOIN table_sessions ON table_sessions.id = orders.table_session_id
      JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
      JOIN customer_sessions ON customer_sessions.id = orders.customer_session_id
      LEFT JOIN order_items ON order_items.order_id = orders.id
      WHERE orders.status <> 'cancelled' AND orders.payment_status = 'pending'
      GROUP BY orders.id, restaurant_tables.id, restaurant_tables.table_number, customer_sessions.id, customer_sessions.nickname
      ORDER BY orders.updated_at DESC
    `)
    const { rows: clearableTables } = await pool.query(`
      SELECT restaurant_tables.id AS "tableId", restaurant_tables.table_number AS "tableNumber", table_sessions.id AS "tableSessionId"
      FROM restaurant_tables
      JOIN table_sessions ON table_sessions.table_id = restaurant_tables.id AND table_sessions.status = 'active'
      WHERE NOT EXISTS (
          SELECT 1 FROM orders
          WHERE orders.table_session_id = table_sessions.id
            AND (orders.payment_status <> 'paid' OR orders.status <> 'served')
            AND orders.status <> 'cancelled'
        )
      ORDER BY restaurant_tables.table_number ASC
    `)
    const { rows: [floorPlan] } = await pool.query('SELECT markers, revision FROM floor_plan_settings WHERE id = 1')
    const { rows: floorTables } = await pool.query(`
      SELECT restaurant_tables.id, restaurant_tables.table_number AS "tableNumber", restaurant_tables.capacity,
        restaurant_tables.floor_x AS "floorX", restaurant_tables.floor_y AS "floorY", restaurant_tables.floor_zone AS "floorZone", restaurant_tables.floor_style AS "floorStyle", restaurant_tables.floor_point AS "floorPoint",
        restaurant_tables.is_enabled AS "isEnabled", active_sessions.id AS "tableSessionId",
        COALESCE(participants.count, 0)::int AS "participantCount",
        COALESCE(order_data.unpaid_total, 0)::double precision AS "unpaidTotal",
        COALESCE(order_data.payable_total, 0)::double precision AS "payableTotal",
        COALESCE(order_data.paid_count, 0)::int AS "paidOrderCount",
        COALESCE(order_data.unpaid_count, 0)::int AS "unpaidOrderCount",
        order_data.status_counts AS "orderCounts",
        CASE WHEN restaurant_tables.is_enabled = false THEN 'inactive'
          WHEN active_sessions.id IS NULL THEN 'available'
          WHEN COALESCE(order_data.unpaid_count, 0) > 0 AND COALESCE(order_data.all_served, false) THEN 'awaiting_payment'
          WHEN COALESCE(order_data.ready_to_clear, false) AND order_data.paid_count > 0 THEN 'ready_to_clear'
          WHEN COALESCE(order_data.count, 0) > 0 THEN 'ordering'
          ELSE 'occupied' END AS status
      FROM restaurant_tables
      LEFT JOIN LATERAL (SELECT id FROM table_sessions WHERE table_id = restaurant_tables.id AND status = 'active' ORDER BY created_at DESC LIMIT 1) active_sessions ON true
      LEFT JOIN LATERAL (SELECT count(*) FROM customer_sessions WHERE table_session_id = active_sessions.id AND left_at IS NULL) participants ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS count, COALESCE(sum(grand_total - paid_amount) FILTER (WHERE payment_status <> 'paid' AND status <> 'cancelled'), 0) AS unpaid_total,
          COALESCE(sum(grand_total - paid_amount) FILTER (WHERE payment_status = 'pending' AND status <> 'cancelled'), 0) AS payable_total,
          count(*) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled') AS paid_count,
          count(*) FILTER (WHERE payment_status <> 'paid' AND status <> 'cancelled') AS unpaid_count,
          jsonb_build_object('received', count(*) FILTER (WHERE status = 'received'),
            'preparing', count(*) FILTER (WHERE status = 'preparing'), 'ready', count(*) FILTER (WHERE status = 'ready'),
            'served', count(*) FILTER (WHERE status = 'served'), 'cancelled', count(*) FILTER (WHERE status = 'cancelled')) AS status_counts,
          bool_and(status = 'served') FILTER (WHERE status <> 'cancelled' AND payment_status <> 'paid') AS all_served,
          bool_and((payment_status = 'paid' AND status = 'served') OR status = 'cancelled') AS ready_to_clear
        FROM orders WHERE table_session_id = active_sessions.id
      ) order_data ON true
      ORDER BY restaurant_tables.table_number ASC
    `)
    const { rows: [summary] } = await pool.query(`
      SELECT COALESCE(sum(amount), 0)::double precision AS sales,
        count(*)::int AS transactions,
        COALESCE(avg(amount), 0)::double precision AS "averageBill",
        COALESCE(sum(amount) FILTER (WHERE payment_method = 'Cash'), 0)::double precision AS cash,
        COALESCE(sum(amount) FILTER (WHERE payment_method <> 'Cash'), 0)::double precision AS "nonCash"
      FROM payments
      WHERE paid_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kuching') AT TIME ZONE 'Asia/Kuching')
        AND paid_at < ((date_trunc('day', now() AT TIME ZONE 'Asia/Kuching') + interval '1 day') AT TIME ZONE 'Asia/Kuching')
    `)
    const { rows: recentOrders } = await pool.query(`
      SELECT orders.id, orders.order_type AS "orderType", orders.order_number AS "orderNumber", orders.status,
        orders.paid_amount AS "paidAmount", orders.payment_status AS "paymentStatus", orders.grand_total::double precision AS "grandTotal",
        orders.created_at AS "createdAt", restaurant_tables.id AS "tableId", orders.table_session_id AS "tableSessionId", restaurant_tables.table_number AS "tableNumber"
      FROM orders JOIN table_sessions ON table_sessions.id = orders.table_session_id
      JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
      ORDER BY orders.created_at DESC, orders.id DESC LIMIT 8
    `)
    const { rows: billRequests } = await pool.query(`SELECT service_requests.id, table_sessions.table_id AS "tableId", service_requests.details FROM service_requests JOIN table_sessions ON table_sessions.id = service_requests.table_session_id WHERE request_type = 'requestBill' AND service_requests.status = 'pending' AND table_sessions.status = 'active'`)
    response.status(200).json({ orders: rows, clearableTables, floorTables, floorPlan, summary, recentOrders, billRequests })
  } catch (error) { next(error) }
})

app.get('/api/v1/cashier/order-setup', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (_request, response, next) => {
  try {
    const [tables, menu, settings] = await Promise.all([
      pool.query(`SELECT restaurant_tables.id, restaurant_tables.table_number AS "tableNumber",
        active_sessions.id AS "tableSessionId"
        FROM restaurant_tables
        LEFT JOIN LATERAL (
          SELECT id FROM table_sessions WHERE table_id = restaurant_tables.id AND status = 'active'
          ORDER BY created_at DESC LIMIT 1
        ) active_sessions ON true
        WHERE restaurant_tables.is_enabled = true ORDER BY restaurant_tables.table_number`),
      pool.query(`SELECT menu_items.id, menu_items.name, menu_items.price,
        menu_items.image_url AS "imageUrl", menu_items.option_groups AS "optionGroups", menu_items.is_available AS "isAvailable",
        categories.name AS "categoryName"
        FROM menu_items LEFT JOIN categories ON categories.id = menu_items.category_id
        WHERE categories.id IS NULL OR categories.is_enabled = true
        ORDER BY categories.sort_order NULLS LAST, menu_items.name`),
      loadStoreSettings(pool),
    ])
    response.status(200).json({ tables: tables.rows, items: menu.rows, settings: settings.config, settingsRevision: settings.revision })
  } catch (error) { next(error) }
})

app.post('/api/v1/cashier/orders', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  const requestId = String(request.get('idempotency-key') ?? '').trim()
  const tableId = String(request.body?.tableId ?? '').trim()
  const expectedSessionId = request.body?.expectedTableSessionId
  const nickname = String(request.body?.customerNickname ?? '').trim() || 'Guest'
  if (!uuid.test(requestId) || !uuid.test(tableId) || !Object.hasOwn(request.body ?? {}, 'expectedTableSessionId') || (expectedSessionId !== null && !uuid.test(String(expectedSessionId)))) {
    return response.status(400).json({ error: 'Select a table and refresh the order before trying again.' })
  }
  if (nickname.length > 80) return response.status(400).json({ error: 'Customer name must be 80 characters or fewer.' })
  let cartItems
  try { validateOrderType(request.body?.orderType); cartItems = orderCartItems(request.body?.items) } catch (error) { return response.status(400).json({ error: error.message }) }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existingOrder = await client.query(`SELECT orders.id, orders.order_type AS "orderType", orders.table_order_number AS "tableOrderNumber",
      orders.status, orders.paid_amount AS "paidAmount", orders.payment_status AS "paymentStatus", orders.grand_total AS "grandTotal",
      orders.created_at AS "createdAt", table_sessions.table_id AS "tableId"
      FROM orders JOIN table_sessions ON table_sessions.id = orders.table_session_id
      WHERE orders.client_request_id = $1`, [requestId])
    if (existingOrder.rows[0]) {
      await client.query('COMMIT')
      if (existingOrder.rows[0].tableId !== tableId) return response.status(409).json({ error: 'This request was already used for a different table.' })
      return response.status(200).json({ order: existingOrder.rows[0], duplicate: true })
    }
    const table = await client.query('SELECT id FROM restaurant_tables WHERE id = $1 AND is_enabled = true FOR UPDATE', [tableId])
    if (!table.rows[0]) {
      await client.query('ROLLBACK')
      return response.status(409).json({ error: 'This table is no longer available. Refresh and choose a table.' })
    }
    const activeSession = await client.query("SELECT id FROM table_sessions WHERE table_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [tableId])
    if ((activeSession.rows[0]?.id ?? null) !== expectedSessionId) {
      await client.query('ROLLBACK')
      return response.status(409).json({ error: 'This table visit changed. Refresh and review the order.' })
    }

    const tableSessionId = activeSession.rows[0]?.id ?? (await client.query("INSERT INTO table_sessions (table_id, status) VALUES ($1, 'active') RETURNING id", [tableId])).rows[0].id
    // Closed cashier-created sessions keep order ownership without appearing as
    // a guest participant or exposing an ordering token to another customer.
    const customerSession = await client.query('INSERT INTO customer_sessions (table_session_id, nickname, left_at, created_by_cashier) VALUES ($1, $2, now(), true) RETURNING id', [tableSessionId, nickname])
    const created = await insertPreparedOrder(client, { tableSessionId, customerSessionId: customerSession.rows[0].id, cartItems, requestId, settingsRevision: request.body?.settingsRevision, orderType: request.body?.orderType })
    await client.query('COMMIT')
    void logAuditEvent({ action: 'CREATE_COUNTER_ORDER', actorId: request.user.id, targetType: 'order', targetId: created.rows[0].id, details: { tableId, orderType: created.rows[0].orderType, itemCount: cartItems.length, isAddition: created.rows[0].isAddition } })
    return response.status(201).json({ order: created.rows[0], duplicate: false })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error instanceof CounterOrderValidationError || error instanceof PosValidationError) return response.status(error.status).json({ error: error.message })
    if (error.code === '23505') {
      const { rows } = await pool.query(`SELECT orders.id, orders.order_type AS "orderType", orders.table_order_number AS "tableOrderNumber", orders.status,
        orders.paid_amount AS "paidAmount", orders.payment_status AS "paymentStatus", orders.grand_total AS "grandTotal", orders.created_at AS "createdAt",
        table_sessions.table_id AS "tableId" FROM orders JOIN table_sessions ON table_sessions.id = orders.table_session_id
        WHERE orders.client_request_id = $1`, [requestId])
      if (rows[0]?.tableId === tableId) {
        return response.status(200).json({ order: rows[0], duplicate: true })
      }
    }
    return next(error)
  } finally { client.release() }
})

app.patch('/api/v1/cashier/table-layout', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
  const client = await pool.connect().catch(next)
  if (!client) return
  try {
    await client.query('BEGIN')
    const { rows: [settings] } = await client.query('SELECT markers, revision FROM floor_plan_settings WHERE id = 1 FOR UPDATE')
    const { rows: currentTables } = await client.query('SELECT id, floor_x AS "floorX", floor_y AS "floorY", floor_zone AS "floorZone", floor_style AS "floorStyle", floor_point AS "floorPoint" FROM restaurant_tables ORDER BY id FOR UPDATE')
    const positions = validateFloorLayoutUpdate(request.body, currentTables)
    let markers = settings.markers
    if (Object.hasOwn(request.body, 'markers')) {
      try { markers = validateFreePlan(request.body, positions, settings) }
      catch (error) {
        if (error.message === 'CONFLICT') throw new FloorLayoutConflictError('The layout changed in another window. Cancel and reload before saving.')
        throw new FloorLayoutValidationError(error.message)
      }
    } else if (positions.some((position) => position.point !== undefined)) {
      throw new FloorLayoutValidationError('Reload the full floor layout before saving.')
    }
    await client.query('UPDATE restaurant_tables SET floor_x = NULL, floor_y = NULL WHERE floor_x IS NOT NULL OR floor_y IS NOT NULL')
    for (const position of positions) {
      await client.query('UPDATE restaurant_tables SET floor_x = $1, floor_y = $2, floor_zone = $3, floor_style = $5, floor_point = $6 WHERE id = $4', [position.x, position.y, position.zone, position.tableId, position.style, position.point ?? null])
    }
    const { rows: [floorPlan] } = await client.query('UPDATE floor_plan_settings SET markers = $1, revision = revision + 1, updated_at = now() WHERE id = 1 RETURNING markers, revision', [JSON.stringify(markers)])
    await client.query('COMMIT')
    return response.status(200).json({ positions, floorPlan })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error instanceof FloorLayoutConflictError) return response.status(409).json({ error: error.message })
    if (error instanceof FloorLayoutValidationError) return response.status(400).json({ error: error.message })
    return next(error)
  } finally { client.release() }
})

app.get('/api/v1/cashier/receipts', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query(`SELECT payments.receipt_number AS "receiptNumber", payments.payment_method AS "paymentMethod", payments.amount, payments.paid_at AS "paidAt", restaurant_tables.table_number AS "tableNumber" FROM payments JOIN table_sessions ON table_sessions.id = payments.table_session_id JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id WHERE ${paidReceiptCondition} ORDER BY payments.paid_at DESC LIMIT 100`)
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
    const refundSummary = await loadDailyRefundTotals(pool, date)
    response.status(200).json({ paidPayments: paid.rows, todayOrders: todayOrders.rows, closings: closings.rows, refundSummary })
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
      SELECT orders.id, orders.order_type AS "orderType", orders.version, orders.order_number AS "orderNumber", orders.status, orders.paid_amount AS "paidAmount", orders.payment_status AS "paymentStatus", orders.subtotal,
        orders.discount_amount AS "discountAmount", orders.service_charge AS "serviceCharge", orders.sst,
        orders.grand_total AS "grandTotal", orders.created_at AS "createdAt", orders.updated_at AS "updatedAt",
        orders.paid_at AS "paidAt", orders.receipt_number AS "receiptNumber", orders.payment_method AS "paymentMethod",
        restaurant_tables.table_number AS "tableNumber", customer_sessions.nickname AS "customerNickname",
        COALESCE(jsonb_agg(jsonb_build_object('id', order_items.id, 'menuItemId', order_items.menu_item_id, 'name', order_items.item_name, 'price', order_items.unit_price, 'orderType', order_items.order_type, 'quantity', order_items.quantity, 'paidQuantity', order_items.paid_quantity, 'fulfilledQuantity', order_items.fulfilled_quantity, 'selections', order_items.selections, 'optionSnapshot', order_items.option_snapshot, 'notes', order_items.notes) ORDER BY order_items.id) FILTER (WHERE order_items.id IS NOT NULL), '[]'::jsonb) AS items
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

// Admin cancellation is handled transactionally by orderChanges.js.

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
      pool.query(`SELECT count(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kuching')::date = $1::date)::int AS "todayOrderCount", (SELECT COALESCE(sum(amount), 0) FROM payments WHERE (paid_at AT TIME ZONE 'Asia/Kuching')::date = $1::date) AS "todayRevenue", count(*) FILTER (WHERE status IN ('received', 'preparing', 'ready'))::int AS "activeOrderCount" FROM orders`, [today]),
      pool.query(`SELECT order_items.item_name AS name, sum(order_items.quantity)::int AS quantity FROM orders JOIN order_items ON order_items.order_id = orders.id WHERE orders.status <> 'cancelled' AND (orders.created_at AT TIME ZONE 'Asia/Kuching')::date = $1::date GROUP BY order_items.item_name ORDER BY quantity DESC, name ASC LIMIT 5`, [today]),
      pool.query(`SELECT orders.id, orders.order_type AS "orderType", orders.order_number AS "orderNumber", orders.status, orders.grand_total AS "grandTotal", orders.created_at AS "createdAt", restaurant_tables.table_number AS "tableNumber" FROM orders JOIN table_sessions ON table_sessions.id = orders.table_session_id JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id ORDER BY orders.created_at DESC LIMIT 5`),
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
    response.status(200).json({ transactions: rows.map((row) => ({ ...row, source: row.type === 'EARN' ? 'PAYMENT' : row.type === 'REFUND' ? 'REFUND' : 'REWARD' })) })
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
  const filter = "(paid_at AT TIME ZONE 'Asia/Kuching')::date >= $1::date AND (paid_at AT TIME ZONE 'Asia/Kuching')::date <= $2::date"
  try {
    const [summary, methods, topFoods, statuses] = await Promise.all([
      pool.query(`SELECT count(*)::int AS "transactionCount", COALESCE(sum(amount), 0) AS revenue, COALESCE(avg(amount), 0) AS "averageBill", COALESCE(max(amount), 0) AS "highestBill", COALESCE(min(amount), 0) AS "lowestBill" FROM payments WHERE ${filter}`, [range.start, range.end]),
      pool.query(`SELECT COALESCE(payment_method, 'Other') AS method, COALESCE(sum(amount), 0) AS amount, count(*)::int AS "transactionCount" FROM payments WHERE ${filter} GROUP BY COALESCE(payment_method, 'Other') ORDER BY amount DESC`, [range.start, range.end]),
      pool.query(`SELECT item->>'name' AS name, sum((item->>'quantity')::integer)::int AS quantity, sum((item->>'quantity')::numeric * (item->>'price')::numeric) AS sales FROM payments CROSS JOIN LATERAL jsonb_array_elements(COALESCE(order_snapshot, '[]'::jsonb)) ticket CROSS JOIN LATERAL jsonb_array_elements(ticket->'items') item WHERE ${filter} GROUP BY item->>'name' ORDER BY sales DESC, quantity DESC, name ASC LIMIT 10`, [range.start, range.end]),
      pool.query(`SELECT status, count(*)::int AS count FROM orders WHERE (created_at AT TIME ZONE 'Asia/Kuching')::date >= $1::date AND (created_at AT TIME ZONE 'Asia/Kuching')::date <= $2::date GROUP BY status ORDER BY status`, [range.start, range.end]),
    ])
    return response.status(200).json({ range, summary: summary.rows[0], paymentMethods: methods.rows, topFoods: topFoods.rows, orderStatuses: statuses.rows })
  } catch (error) { return next(error) }
})

app.get('/api/v1/admin/payment-events', requireAuthenticatedUser, requireRole('admin'), async (_request, response, next) => {
  try {
    const { rows } = await pool.query(`SELECT payments.id, payments.receipt_number AS "receiptNumber", payments.paid_at AS "paidAt", payments.payment_method AS "paymentMethod", payments.amount AS "grandTotal", COALESCE(payments.order_snapshot, '[]'::jsonb) AS orders FROM payments WHERE ${paidReceiptCondition} ORDER BY payments.paid_at DESC`)
    response.json({ payments: rows.map((payment) => ({ ...payment, sessionIds: payment.orders.map((order) => order.sessionId).filter(Boolean), status: 'paid', paymentStatus: 'paid', items: payment.orders.flatMap((order) => order.items ?? []) })) })
  } catch (error) { next(error) }
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
    if (Object.hasOwn(request.body ?? {}, 'expectedTableSessionId') && request.body.expectedTableSessionId !== tableSessionId) throw new PosValidationError('The table visit has changed. Refresh the table panel before clearing it.', 409)
    const outstanding = await client.query("SELECT 1 FROM orders WHERE table_session_id = $1 AND status <> 'cancelled' AND (payment_status <> 'paid' OR status <> 'served') LIMIT 1 FOR UPDATE", [tableSessionId])
    if (outstanding.rowCount) throw new Error('This table has unpaid or undelivered items and cannot be cleared.')
    await client.query("UPDATE customer_sessions SET left_at = COALESCE(left_at, now()) WHERE table_session_id = $1", [tableSessionId])
    await client.query("UPDATE table_sessions SET status = 'completed', updated_at = now() WHERE id = $1", [tableSessionId])
    await client.query('COMMIT')
    void logAuditEvent({ action: 'CLEAR_TABLE', actorId: request.user.id, targetType: 'table', targetId: table.rows[0].id, details: { tableNumber: table.rows[0].tableNumber } })
    return response.status(200).json({ cleared: true, tableNumber: table.rows[0].tableNumber })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error instanceof PosValidationError) return response.status(error.status).json({ error: error.message })
    if (String(error.message).includes('unpaid active orders') || String(error.message).includes('unpaid or undelivered')) return response.status(409).json({ error: error.message })
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
      SELECT menu_items.id, menu_items.name, menu_items.description, menu_items.price, menu_items.ingredients,
        menu_items.allergy_information AS "allergyInformation",
        menu_items.image_url AS "imageUrl", menu_items.option_groups AS "optionGroups", menu_items.is_available AS "isAvailable",
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
    const { rows } = await pool.query('INSERT INTO menu_items (category_id, name, description, price, image_url, ingredients, allergy_information, is_available, is_popular, option_groups) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10::jsonb) RETURNING id, name, description, price, image_url AS "imageUrl", ingredients, allergy_information AS "allergyInformation", is_available AS "isAvailable", is_popular AS "isPopular", category_id AS "categoryId", option_groups AS "optionGroups"', [input.categoryId, input.name, input.description, input.price, input.imageUrl, JSON.stringify(input.ingredients), JSON.stringify(input.allergyInformation), input.isAvailable, input.isPopular, JSON.stringify(input.optionGroups)])
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
    const { rows } = await pool.query('UPDATE menu_items SET category_id = $1, name = $2, description = $3, price = $4, image_url = $5, ingredients = $6::jsonb, allergy_information = $7::jsonb, is_available = $8, is_popular = $9, option_groups = $11::jsonb, updated_at = now() WHERE id = $10 RETURNING id, name, description, price, image_url AS "imageUrl", ingredients, allergy_information AS "allergyInformation", is_available AS "isAvailable", is_popular AS "isPopular", category_id AS "categoryId", option_groups AS "optionGroups"', [input.categoryId, input.name, input.description, input.price, input.imageUrl, JSON.stringify(input.ingredients), JSON.stringify(input.allergyInformation), input.isAvailable, input.isPopular, String(request.params.itemId ?? ''), JSON.stringify(input.optionGroups)])
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

startApiServer(app, port, { onError() {
  process.exitCode = 1
  void pool.end().catch(() => console.error('[API] Failed to close database pool after startup failure.'))
} })
  const textList = (value) => Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 50) : String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 50)
