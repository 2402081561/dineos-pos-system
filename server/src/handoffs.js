import { PosValidationError } from './posRules.js'
import { pickupFieldsSql } from './takeawayQr.js'

export function validateHandoff(order, item, quantity, version) {
  if (!order || order.status !== 'ready') throw new PosValidationError('The kitchen has not marked this order ready.', 409)
  if (order.version !== version) throw new PosValidationError('This order changed. Refresh before confirming handoff.', 409)
  if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity - item.fulfilledQuantity) throw new PosValidationError('That quantity is no longer waiting for handoff.', 409)
}

export function registerHandoffRoutes(app, { pool, requireAuthenticatedUser, requireRole }) {
  app.get('/api/v1/staff/handoffs', requireAuthenticatedUser, requireRole('admin', 'cashier', 'staff'), async (_request, response, next) => {
    try {
      const { rows } = await pool.query(`SELECT orders.id, ${pickupFieldsSql}, orders.version, orders.order_number AS "orderNumber", orders.status, orders.payment_status AS "paymentStatus", restaurant_tables.table_number AS "tableNumber", restaurant_tables.table_number IS NULL AS "isWalkIn", restaurant_tables.id AS "tableId",
        jsonb_agg(jsonb_build_object('id', order_items.id, 'name', item_name, 'quantity', quantity, 'fulfilledQuantity', fulfilled_quantity, 'orderType', order_items.order_type, 'notes', notes, 'optionSnapshot', option_snapshot) ORDER BY order_items.id) AS items
        FROM orders JOIN order_items ON order_items.order_id = orders.id JOIN table_sessions ON table_sessions.id = orders.table_session_id LEFT JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
        WHERE orders.status = 'ready' AND fulfilled_quantity < quantity AND table_sessions.status = 'active' GROUP BY orders.id, restaurant_tables.id ORDER BY orders.created_at`)
      response.json({ orders: rows })
    } catch (error) { next(error) }
  })
  app.patch('/api/v1/staff/orders/:orderId/handoff', requireAuthenticatedUser, requireRole('admin', 'cashier', 'staff'), async (request, response, next) => {
    if (!/^[0-9a-f-]{36}$/i.test(request.params.orderId) || !/^[0-9a-f-]{36}$/i.test(String(request.body?.itemId ?? ''))) return response.status(400).json({ error: 'Invalid order item.' })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: [order] } = await client.query('SELECT id, status, version FROM orders WHERE id = $1 FOR UPDATE', [request.params.orderId])
      const { rows: [item] } = await client.query('SELECT id, quantity, fulfilled_quantity AS "fulfilledQuantity", order_type AS "orderType" FROM order_items WHERE id = $1 AND order_id = $2', [request.body.itemId, request.params.orderId])
      validateHandoff(order, item, request.body.quantity, request.body.expectedVersion)
      await client.query('UPDATE order_items SET fulfilled_quantity = fulfilled_quantity + $1 WHERE id = $2', [request.body.quantity, item.id])
      await client.query(`UPDATE orders SET status = CASE WHEN EXISTS (SELECT 1 FROM order_items WHERE order_id = $1 AND fulfilled_quantity < quantity) THEN 'ready'::order_status ELSE 'served'::order_status END, version = version + 1, updated_at = now() WHERE id = $1`, [order.id])
      await client.query("INSERT INTO audit_logs (actor_id, action, target_type, target_id, details) VALUES ($1, 'HANDOFF_ITEMS', 'order', $2, $3::jsonb)", [request.user.id, order.id, JSON.stringify({ itemId: item.id, quantity: request.body.quantity, orderType: item.orderType })])
      await client.query('COMMIT')
      response.json({ completed: true })
    } catch (error) {
      await client.query('ROLLBACK')
      if (error instanceof PosValidationError) return response.status(error.status).json({ error: error.message })
      next(error)
    } finally { client.release() }
  })
}
