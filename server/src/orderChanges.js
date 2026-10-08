import { summarizeOrderType } from './orderType.js'
import { orderAmounts, PosValidationError } from './posRules.js'

export function validateOrderChange(order, items, body, role) {
  if (items.some((item) => Number(item.paidQuantity) > 0 || Number(item.fulfilledQuantity) > 0)) throw new PosValidationError('This ticket has paid or handed-over items. Add a new order instead of changing its history.', 409)
  if (order.paymentStatus === 'paid' || !['received', 'preparing', 'ready'].includes(order.status)) throw new PosValidationError('Paid, served or cancelled orders cannot be changed.', 409)
  if (role !== 'admin' && order.status !== 'received') throw new PosValidationError('Preparation has started. Ask an administrator to make this change.', 403)
  if (!Number.isInteger(body?.expectedVersion) || body.expectedVersion !== order.version) throw new PosValidationError('The order changed in another window. Reload before editing.', 409)
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason || reason.length > 300) throw new PosValidationError('Enter a reason for the change (up to 300 characters).')
  if (!Array.isArray(body.items) || body.items.length !== items.length) throw new PosValidationError('Reload all order items before making changes.')
  const seen = new Set()
  const changed = body.items.map((entry) => {
    const original = items.find((item) => item.id === entry?.id)
    if (!original || seen.has(entry.id) || !Number.isInteger(entry.quantity) || entry.quantity < 0 || entry.quantity > 50 || typeof entry.notes !== 'string' || entry.notes.length > 500) throw new PosValidationError('Invalid order item, quantity or notes.')
    seen.add(entry.id)
    return { ...original, quantity: entry.quantity, notes: entry.notes.trim() }
  })
  if (!changed.some((item) => item.quantity !== items.find((entry) => entry.id === item.id).quantity || item.notes !== (items.find((entry) => entry.id === item.id).notes ?? ''))) throw new PosValidationError('There are no changes to save.')
  const remaining = changed.filter((item) => item.quantity > 0)
  return { reason, items: remaining, status: remaining.length ? (order.status === 'ready' ? 'preparing' : order.status) : 'cancelled', ...orderAmounts(remaining.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0), order) }
}

export function registerOrderChangeRoutes(app, { pool, requireAuthenticatedUser, requireRole }) {
  app.get('/api/v1/cashier/tables/:tableId/orders', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
    try {
      if (!/^[0-9a-f-]{36}$/i.test(request.params.tableId)) return response.status(400).json({ error: 'Select a valid table.' })
      const sessionId = request.query?.tableSessionId || null
      if (sessionId && !/^[0-9a-f-]{36}$/i.test(sessionId)) return response.status(400).json({ error: 'Invalid table visit.' })
      const { rows } = await pool.query(`SELECT orders.id, orders.order_type AS "orderType", orders.order_number AS "orderNumber", orders.status,
        orders.payment_status AS "paymentStatus", orders.version, orders.grand_total AS "grandTotal",
        orders.is_addition AS "isAddition", orders.revision_note AS "revisionNote", orders.created_at AS "createdAt", table_sessions.status AS "tableSessionStatus",
        customer_sessions.nickname AS "customerNickname",
        COALESCE(items.items, '[]') AS items, COALESCE(revisions.history, '[]') AS history
        FROM orders JOIN table_sessions ON table_sessions.id = orders.table_session_id
        LEFT JOIN customer_sessions ON customer_sessions.id = orders.customer_session_id
        LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id', id, 'name', item_name, 'price', unit_price,
          'quantity', quantity, 'paidQuantity', paid_quantity, 'fulfilledQuantity', fulfilled_quantity, 'orderType', order_type, 'notes', notes, 'optionSnapshot', option_snapshot) ORDER BY id) AS items FROM order_items WHERE order_id = orders.id) items ON true
        LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id', order_revisions.id, 'reason', reason,
          'createdAt', order_revisions.created_at, 'actorName', users.display_name, 'before', before_snapshot,
          'after', after_snapshot) ORDER BY order_revisions.created_at DESC) AS history FROM order_revisions
          JOIN users ON users.id = order_revisions.actor_id WHERE order_id = orders.id) revisions ON true
        WHERE table_sessions.table_id = $1 AND (($2::uuid IS NULL AND table_sessions.status = 'active') OR table_sessions.id = $2::uuid) ORDER BY orders.created_at DESC`, [request.params.tableId, sessionId])
      response.set('Cache-Control', 'no-store').json({ orders: rows })
    } catch (error) { next(error) }
  })
  async function changeOrder(request, response, next) {
    if (!/^[0-9a-f-]{36}$/i.test(request.params.orderId)) return response.status(400).json({ error: 'Invalid order.' })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(`SELECT id, order_type AS "orderType", status, payment_status AS "paymentStatus", version,
        service_charge_rate AS "serviceChargeRate", sst_rate AS "sstRate" FROM orders WHERE id = $1 FOR UPDATE`, [request.params.orderId])
      if (!rows[0]) throw new PosValidationError('Order not found.', 404)
      const { rows: items } = await client.query('SELECT id, item_name AS name, unit_price AS price, quantity, paid_quantity AS "paidQuantity", fulfilled_quantity AS "fulfilledQuantity", notes, order_type AS "orderType", option_snapshot AS "optionSnapshot" FROM order_items WHERE order_id = $1 ORDER BY id', [rows[0].id])
      const body = request.cancelEntireOrder ? { ...request.body, items: items.map((item) => ({ id: item.id, quantity: 0, notes: item.notes ?? '' })) } : request.body
      const change = validateOrderChange(rows[0], items, body, request.user.role)
      for (const original of items) {
        const updated = change.items.find((item) => item.id === original.id)
        // Only unpaid tickets are editable. The complete original and amended
        // ticket are durably retained below in the same transaction.
        if (updated) await client.query('UPDATE order_items SET quantity = $1, notes = $2 WHERE id = $3', [updated.quantity, updated.notes, original.id])
        else await client.query('DELETE FROM order_items WHERE id = $1', [original.id])
      }
      await client.query(`UPDATE orders SET status = $1, subtotal = $2, service_charge = $3, sst = $4, grand_total = $5,
        version = version + 1, revision_note = $6, order_type = $8, updated_at = now() WHERE id = $7`, [change.status, change.subtotal, change.serviceCharge, change.sst, change.grandTotal, change.reason, rows[0].id, summarizeOrderType(change.items.map((item) => ({ ...item, orderType: item.orderType ?? 'dine_in' })), rows[0].orderType)])
      const before = { status: rows[0].status, orderType: rows[0].orderType, version: rows[0].version, items }
      const after = { status: change.status, orderType: summarizeOrderType(change.items.map((item) => ({ ...item, orderType: item.orderType ?? 'dine_in' })), rows[0].orderType), version: rows[0].version + 1, items: change.items, grandTotal: change.grandTotal }
      await client.query('INSERT INTO order_revisions (order_id, actor_id, reason, before_snapshot, after_snapshot) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)', [rows[0].id, request.user.id, change.reason, JSON.stringify(before), JSON.stringify(after)])
      await client.query("INSERT INTO audit_logs (actor_id, action, target_type, target_id, details) VALUES ($1, 'CHANGE_ORDER', 'order', $2, $3::jsonb)", [request.user.id, rows[0].id, JSON.stringify({ reason: change.reason, before, after })])
      await client.query('COMMIT')
      response.json({ order: after })
    } catch (error) {
      await client.query('ROLLBACK')
      if (error instanceof PosValidationError) return response.status(error.status).json({ error: error.message })
      next(error)
    } finally { client.release() }
  }
  app.patch('/api/v1/cashier/orders/:orderId/items', requireAuthenticatedUser, requireRole('admin', 'cashier'), changeOrder)
  app.patch('/api/v1/admin/orders/:orderId/cancel', requireAuthenticatedUser, requireRole('admin'), (request, response, next) => { request.cancelEntireOrder = true; return changeOrder(request, response, next) })
}
