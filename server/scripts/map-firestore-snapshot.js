import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'

const directory = path.dirname(fileURLToPath(import.meta.url))
const serverDirectory = path.resolve(directory, '..')
dotenv.config({ path: path.join(serverDirectory, '.env') })
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in server/.env before mapping the snapshot.')

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

function string(value, fallback = '') { return String(value ?? '').trim() || fallback }
function boolean(value, fallback = false) { return typeof value === 'boolean' ? value : fallback }
function number(value, fallback = 0) { const result = Number(value); return Number.isFinite(result) ? result : fallback }
function positiveInteger(value, fallback = 1) {
  const result = Math.floor(number(value, Number.NaN))
  if (Number.isFinite(result) && result > 0) return result
  const embeddedNumber = String(value ?? '').match(/\d+/)?.[0]
  const parsedEmbeddedNumber = Math.floor(Number(embeddedNumber))
  return Number.isFinite(parsedEmbeddedNumber) && parsedEmbeddedNumber > 0 ? parsedEmbeddedNumber : fallback
}
function mapStatus(value, allowed, fallback) { const status = string(value).toLowerCase(); return allowed.includes(status) ? status : fallback }
function timestamp(value) {
  const seconds = Number(value?.seconds)
  const nanos = Number(value?.nanoseconds ?? value?.nanoseconds ?? 0)
  if (Number.isFinite(seconds)) return new Date(seconds * 1000 + Math.floor(nanos / 1e6))
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}
function jsonObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }

async function snapshotRows(client, collection) {
  const { rows } = await client.query('SELECT source_document_id, source_data FROM firebase_import_documents WHERE source_collection = $1 ORDER BY source_document_id', [collection])
  return rows
}

async function mappedId(client, collection, documentId, targetTable) {
  const { rows } = await client.query('SELECT target_id FROM firebase_source_map WHERE source_collection = $1 AND source_document_id = $2 AND target_table = $3', [collection, documentId, targetTable])
  return rows[0]?.target_id ?? null
}

async function remember(client, collection, documentId, targetTable, targetId) {
  await client.query('INSERT INTO firebase_source_map (source_collection, source_document_id, target_table, target_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [collection, documentId, targetTable, targetId])
}

async function mapCategories(client) {
  for (const row of await snapshotRows(client, 'categories')) {
    if (await mappedId(client, 'categories', row.source_document_id, 'categories')) continue
    const data = row.source_data
    const { rows } = await client.query('INSERT INTO categories (name, sort_order, is_enabled) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [string(data.name, `Legacy category ${row.source_document_id}`), Math.max(0, Math.floor(number(data.sortOrder))), boolean(data.isActive, true)])
    await remember(client, 'categories', row.source_document_id, 'categories', rows[0].id)
  }
}

async function mapTables(client) {
  for (const row of await snapshotRows(client, 'tables')) {
    if (await mappedId(client, 'tables', row.source_document_id, 'restaurant_tables')) continue
    const data = row.source_data
    const tableNumber = positiveInteger(data.tableNumber, Number(row.source_document_id))
    if (!tableNumber) continue
    const { rows } = await client.query('INSERT INTO restaurant_tables (table_number, capacity, is_enabled) VALUES ($1, $2, $3) ON CONFLICT (table_number) DO UPDATE SET table_number = EXCLUDED.table_number RETURNING id', [tableNumber, positiveInteger(data.capacity, 1), boolean(data.isActive, true)])
    await remember(client, 'tables', row.source_document_id, 'restaurant_tables', rows[0].id)
  }
}

async function mapMembers(client) {
  for (const row of await snapshotRows(client, 'members')) {
    const data = row.source_data
    const existingId = await mappedId(client, 'members', row.source_document_id, 'members')
    if (existingId) {
      await client.query('UPDATE members SET legacy_member_id = COALESCE(legacy_member_id, $1) WHERE id = $2', [string(data.memberId) || null, existingId])
      continue
    }
    const phone = string(data.normalizedPhone ?? data.phone, `legacy-${row.source_document_id}`)
    const { rows } = await client.query('INSERT INTO members (name, phone_normalized, phone_display, email, points_balance, status, email_notifications_enabled, legacy_member_id) VALUES ($1, $2, $3, $4, $5, $6::member_status, $7, $8) ON CONFLICT (phone_normalized) DO UPDATE SET legacy_member_id = COALESCE(members.legacy_member_id, EXCLUDED.legacy_member_id) RETURNING id', [string(data.name, 'Legacy member'), phone, string(data.phone, phone), string(data.email) || null, Math.max(0, Math.floor(number(data.pointsBalance))), mapStatus(data.status, ['active', 'inactive'], 'active'), boolean(data.emailNotificationsEnabled, true), string(data.memberId) || null])
    await remember(client, 'members', row.source_document_id, 'members', rows[0].id)
  }
}

async function tableIdForNumber(client, value) {
  const { rows } = await client.query('SELECT id FROM restaurant_tables WHERE table_number = $1', [positiveInteger(value, 0)])
  return rows[0]?.id ?? null
}

async function memberIdForLegacyMemberId(client, value) {
  const { rows } = await client.query('SELECT id FROM members WHERE legacy_member_id = $1', [string(value).toUpperCase()])
  return rows[0]?.id ?? null
}

async function mapTableSessions(client) {
  for (const row of await snapshotRows(client, 'tableSessions')) {
    if (await mappedId(client, 'tableSessions', row.source_document_id, 'table_sessions')) continue
    const data = row.source_data
    const tableId = await tableIdForNumber(client, data.tableNumber)
    if (!tableId) { console.warn(`[Mapping] Skipped table session ${row.source_document_id}: table is missing.`); continue }
    const { rows } = await client.query("INSERT INTO table_sessions (table_id, status) VALUES ($1, $2) RETURNING id", [tableId, mapStatus(data.status, ['active', 'completed'], 'completed')])
    const tableSessionId = rows[0].id
    await remember(client, 'tableSessions', row.source_document_id, 'table_sessions', tableSessionId)
    for (const participant of Array.isArray(data.participants) ? data.participants : []) {
      const sessionId = string(participant?.sessionId)
      if (!sessionId) continue
      const { rows: participantRows } = await client.query('INSERT INTO customer_sessions (table_session_id, member_id, nickname) VALUES ($1, $2, $3) RETURNING id', [tableSessionId, await memberIdForLegacyMemberId(client, participant.memberId), string(participant.customerNickname, 'Guest')])
      await remember(client, `tableSessions:${row.source_document_id}`, sessionId, 'customer_sessions', participantRows[0].id)
    }
  }
}

async function tableSessionForOrder(client, order) {
  const tableNumber = positiveInteger(order.tableNumber ?? order.tableId, 0)
  const { rows } = await client.query("SELECT target_id FROM firebase_source_map WHERE source_collection = 'tableSessions' AND target_table = 'table_sessions' AND source_document_id = $1", [`table-${tableNumber}`])
  if (rows[0]?.target_id) return rows[0].target_id
  const sourceDocumentId = `table-${tableNumber}`
  const historicalId = await mappedId(client, 'historicalTableSessions', sourceDocumentId, 'table_sessions')
  if (historicalId) return historicalId
  let tableId = await tableIdForNumber(client, tableNumber)
  if (!tableId && tableNumber > 0) {
    const { rows: createdTable } = await client.query('INSERT INTO restaurant_tables (table_number, capacity, is_enabled) VALUES ($1, 1, false) ON CONFLICT (table_number) DO UPDATE SET table_number = EXCLUDED.table_number RETURNING id', [tableNumber])
    tableId = createdTable[0].id
    await remember(client, 'legacyOrderTables', sourceDocumentId, 'restaurant_tables', tableId)
    console.info(`[Mapping] Created disabled legacy table ${tableNumber} for historical orders.`)
  }
  if (!tableId) return null
  const { rows: created } = await client.query("INSERT INTO table_sessions (table_id, status) VALUES ($1, 'completed') RETURNING id", [tableId])
  await remember(client, 'historicalTableSessions', sourceDocumentId, 'table_sessions', created[0].id)
  console.info(`[Mapping] Created completed historical table session for Table ${tableNumber}.`)
  return created[0].id
}

async function customerSessionForOrder(client, tableSessionId, order) {
  const sessionId = string(order.sessionId)
  if (!sessionId) return null
  const { rows } = await client.query("SELECT target_id FROM firebase_source_map WHERE source_collection LIKE 'tableSessions:%' AND source_document_id = $1 AND target_table = 'customer_sessions'", [sessionId])
  if (rows[0]?.target_id) return rows[0].target_id
  const { rows: created } = await client.query('INSERT INTO customer_sessions (table_session_id, member_id, nickname) VALUES ($1, $2, $3) RETURNING id', [tableSessionId, await memberIdForLegacyMemberId(client, order.memberId), string(order.customerNickname, 'Guest')])
  await remember(client, `orders:${tableSessionId}`, sessionId, 'customer_sessions', created[0].id)
  return created[0].id
}

async function mapOrders(client) {
  for (const row of await snapshotRows(client, 'orders')) {
    const data = row.source_data
    const existingId = await mappedId(client, 'orders', row.source_document_id, 'orders')
    if (existingId) {
      await client.query('UPDATE orders SET receipt_number = COALESCE(receipt_number, $1), payment_method = COALESCE(payment_method, $2), paid_at = COALESCE(paid_at, $3) WHERE id = $4', [string(data.receiptNumber) || null, string(data.paymentMethod) || null, data.paidAt ? timestamp(data.paidAt) : null, existingId])
      continue
    }
    const tableSessionId = await tableSessionForOrder(client, data)
    if (!tableSessionId) { console.warn(`[Mapping] Skipped order ${row.source_document_id}: table session is missing (tableNumber=${JSON.stringify(data.tableNumber ?? null)}, tableId=${JSON.stringify(data.tableId ?? null)}, sessionId=${JSON.stringify(data.sessionId ?? null)}).`); continue }
    const customerSessionId = await customerSessionForOrder(client, tableSessionId, data)
    if (!customerSessionId) { console.warn(`[Mapping] Skipped order ${row.source_document_id}: customer session is missing.`); continue }
    const items = Array.isArray(data.items) ? data.items : []
    if (!items.length) { console.warn(`[Mapping] Skipped order ${row.source_document_id}: item data is missing.`); continue }
    const subtotal = Math.max(0, number(data.subtotal, items.reduce((total, item) => total + (Math.max(0, number(item?.price)) * positiveInteger(item?.quantity)), 0)))
    const discount = Math.max(0, number(data.discountAmount))
    const serviceCharge = Math.max(0, number(data.serviceCharge))
    const sst = Math.max(0, number(data.sst))
    const grandTotal = Math.max(0, number(data.grandTotal, subtotal - discount + serviceCharge + sst))
    const { rows } = await client.query('INSERT INTO orders (table_session_id, customer_session_id, member_id, status, payment_status, subtotal, discount_amount, service_charge, sst, grand_total, receipt_number, payment_method, paid_at, legacy_source_id) VALUES ($1, $2, $3, $4::order_status, $5::payment_status, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id', [tableSessionId, customerSessionId, await memberIdForLegacyMemberId(client, data.memberId), mapStatus(data.status, ['received', 'preparing', 'ready', 'served', 'cancelled'], 'received'), mapStatus(data.paymentStatus, ['pending', 'paid'], 'pending'), subtotal, discount, serviceCharge, sst, grandTotal, string(data.receiptNumber) || null, string(data.paymentMethod) || null, data.paidAt ? timestamp(data.paidAt) : null, row.source_document_id])
    const orderId = rows[0].id
    await remember(client, 'orders', row.source_document_id, 'orders', orderId)
    for (const item of items) {
      await client.query('INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, notes) VALUES ($1, $2, $3, $4, $5, $6)', [orderId, await mappedId(client, 'menuItems', string(item?.menuItemId), 'menu_items'), string(item?.name, 'Legacy item'), Math.max(0, number(item?.price)), positiveInteger(item?.quantity), string(item?.notes)])
    }
  }
}

async function mapPayments(client) {
  // Payments are embedded in Firebase order documents, so group the already-imported orders by receipt.
  const { rows } = await client.query("SELECT receipt_number, (array_agg(table_session_id))[1] AS table_session_id, sum(grand_total) AS amount FROM orders WHERE payment_status = 'paid' AND receipt_number IS NOT NULL GROUP BY receipt_number")
  for (const receipt of rows) {
    if (await mappedId(client, 'receipts', receipt.receipt_number, 'payments')) continue
    const sourceOrders = await client.query("SELECT source_document_id, source_data FROM firebase_import_documents WHERE source_collection = 'orders' AND source_data->>'receiptNumber' = $1 ORDER BY source_document_id", [receipt.receipt_number])
    const first = sourceOrders.rows[0]?.source_data ?? {}
    const { rows: inserted } = await client.query('INSERT INTO payments (receipt_number, legacy_receipt_number, table_session_id, payment_method, amount, paid_at) VALUES ($1, $1, $2, $3, $4, $5) ON CONFLICT (receipt_number) DO UPDATE SET legacy_receipt_number = EXCLUDED.legacy_receipt_number RETURNING id', [receipt.receipt_number, receipt.table_session_id, string(first.paymentMethod, 'Other'), Math.max(0, number(receipt.amount)), timestamp(first.paidAt)])
    await remember(client, 'receipts', receipt.receipt_number, 'payments', inserted[0].id)
  }
}

async function mapServiceRequests(client) {
  for (const row of await snapshotRows(client, 'serviceRequests')) {
    if (await mappedId(client, 'serviceRequests', row.source_document_id, 'service_requests')) continue
    const data = row.source_data
    const tableSessionId = await tableSessionForOrder(client, data)
    const customerSessionId = tableSessionId ? await customerSessionForOrder(client, tableSessionId, data) : null
    const { rows } = await client.query('INSERT INTO service_requests (table_session_id, customer_session_id, request_type, status, details, created_at, updated_at, legacy_source_id) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8) RETURNING id', [tableSessionId, customerSessionId, string(data.requestType, 'General request'), mapStatus(data.status, ['pending', 'completed'], 'pending'), JSON.stringify(jsonObject(data)), timestamp(data.createdAt), timestamp(data.updatedAt ?? data.createdAt), row.source_document_id])
    await remember(client, 'serviceRequests', row.source_document_id, 'service_requests', rows[0].id)
  }
}

async function mapShiftClosings(client) {
  for (const row of await snapshotRows(client, 'shiftClosings')) {
    if (await mappedId(client, 'shiftClosings', row.source_document_id, 'shift_closings')) continue
    const data = row.source_data
    const { rows } = await client.query('INSERT INTO shift_closings (closing_id, shift_date, cashier_name, summary, closed_at, legacy_source_id) VALUES ($1, $2, $3, $4::jsonb, $5, $6) ON CONFLICT (closing_id) DO UPDATE SET legacy_source_id = EXCLUDED.legacy_source_id RETURNING id', [string(data.closingId, row.source_document_id), string(data.shiftDate) || null, string(data.cashierName) || null, JSON.stringify(jsonObject(data)), timestamp(data.closedAt), row.source_document_id])
    await remember(client, 'shiftClosings', row.source_document_id, 'shift_closings', rows[0].id)
  }
}

async function mapAuditLogs(client) {
  for (const row of await snapshotRows(client, 'auditLogs')) {
    if (await mappedId(client, 'auditLogs', row.source_document_id, 'audit_logs')) continue
    const data = row.source_data
    const details = { ...jsonObject(data.details), category: string(data.category) || undefined, actorId: string(data.actorId) || undefined, actorName: string(data.actorName) || undefined, tableNumber: data.tableNumber ?? undefined, orderId: string(data.orderId) || undefined, receiptNumber: string(data.receiptNumber) || undefined }
    Object.keys(details).forEach((key) => details[key] === undefined && delete details[key])
    const { rows } = await client.query('INSERT INTO audit_logs (action, target_type, target_id, details, created_at, legacy_source_id) VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING id', [string(data.action, 'LEGACY_EVENT'), string(data.targetType) || null, string(data.targetId) || null, JSON.stringify(details), timestamp(data.createdAt), row.source_document_id])
    await remember(client, 'auditLogs', row.source_document_id, 'audit_logs', rows[0].id)
  }
}

async function mapPointTransactions(client) {
  for (const row of await snapshotRows(client, 'memberPointTransactions')) {
    if (await mappedId(client, 'memberPointTransactions', row.source_document_id, 'member_point_transactions')) continue
    const data = row.source_data
    const memberId = await memberIdForLegacyMemberId(client, data.memberId)
    const type = mapStatus(data.type, ['earn', 'redeem'], '')
    const points = Math.trunc(number(data.points))
    if (!memberId || !type || (type === 'earn' && points <= 0) || (type === 'redeem' && points >= 0)) { console.warn(`[Mapping] Skipped point transaction ${row.source_document_id}: invalid member, type, or points.`); continue }
    const paymentId = data.receiptNumber ? await mappedId(client, 'receipts', string(data.receiptNumber), 'payments') : null
    const rewardId = data.rewardDocumentId ? await mappedId(client, 'rewards', string(data.rewardDocumentId), 'rewards') : null
    const { rows } = await client.query('INSERT INTO member_point_transactions (member_id, type, points, eligible_spending, payment_id, reward_id, redemption_reference, created_at, legacy_source_id) VALUES ($1, $2::point_transaction_type, $3, $4, $5, $6, $7, $8, $9) RETURNING id', [memberId, type, points, type === 'earn' ? Math.max(0, number(data.eligibleSpending)) : null, paymentId, rewardId, string(data.redemptionReference) || null, timestamp(data.createdAt), row.source_document_id])
    await remember(client, 'memberPointTransactions', row.source_document_id, 'member_point_transactions', rows[0].id)
  }
}

async function mapMenuItems(client) {
  for (const row of await snapshotRows(client, 'menuItems')) {
    if (await mappedId(client, 'menuItems', row.source_document_id, 'menu_items')) continue
    const data = row.source_data
    const categoryId = await mappedId(client, 'categories', string(data.categoryId), 'categories')
    const { rows } = await client.query('INSERT INTO menu_items (category_id, name, description, price, image_url, is_available, is_popular) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [categoryId, string(data.name, `Legacy item ${row.source_document_id}`), string(data.description), Math.max(0, number(data.price)), string(data.imageUrl) || null, boolean(data.isAvailable, true), boolean(data.isPopular)])
    await remember(client, 'menuItems', row.source_document_id, 'menu_items', rows[0].id)
  }
}

async function mapRewards(client) {
  for (const row of await snapshotRows(client, 'rewards')) {
    if (await mappedId(client, 'rewards', row.source_document_id, 'rewards')) continue
    const data = row.source_data
    const menuItemId = await mappedId(client, 'menuItems', string(data.menuItemId), 'menu_items')
    const points = positiveInteger(data.pointsRequired, 0)
    if (!menuItemId || !points) continue
    const { rows } = await client.query('INSERT INTO rewards (name, menu_item_id, points_required, is_available) VALUES ($1, $2, $3, $4) ON CONFLICT (menu_item_id, points_required) DO UPDATE SET name = EXCLUDED.name RETURNING id', [string(data.name, 'Legacy reward'), menuItemId, points, boolean(data.isAvailable, true)])
    await remember(client, 'rewards', row.source_document_id, 'rewards', rows[0].id)
  }
}

async function report(client) {
  const { rows } = await client.query("SELECT target_table, count(*)::int AS mapped FROM firebase_source_map GROUP BY target_table ORDER BY target_table")
  console.info('[Mapping] Completed:', JSON.stringify(rows))
}

try {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await mapCategories(client)
    await mapTables(client)
    await mapMembers(client)
    await mapMenuItems(client)
    await mapRewards(client)
    await mapTableSessions(client)
    await mapOrders(client)
    await mapPayments(client)
    await mapPointTransactions(client)
    await mapServiceRequests(client)
    await mapShiftClosings(client)
    await mapAuditLogs(client)
    await client.query('COMMIT')
    await report(client)
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
} finally { await pool.end() }
