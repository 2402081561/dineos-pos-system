import { paidReceiptCondition } from './paidReceipt.js'

// A single ticket, including historical visits. Reading it never alters payment
// or handoff state and is restricted to the same roles as receipt access.
export function registerOrderDetailsRoute(app, { pool, requireAuthenticatedUser, requireRole }) {
  app.get('/api/v1/cashier/orders/:orderId', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (request, response, next) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.orderId)) return response.status(400).json({ error: 'Invalid order.' })
    try {
      const { rows } = await pool.query(`SELECT orders.id, orders.order_number AS "orderNumber", orders.order_type AS "orderType",
        orders.status, orders.payment_status AS "paymentStatus", orders.paid_amount AS "paidAmount", orders.version,
        orders.subtotal, orders.discount_amount AS "discountAmount", orders.service_charge AS "serviceCharge", orders.sst,
        orders.grand_total AS "grandTotal", orders.created_at AS "createdAt", orders.updated_at AS "updatedAt", orders.paid_at AS "paidAt",
        orders.table_session_id AS "tableSessionId", table_sessions.status AS "tableSessionStatus",
        restaurant_tables.id AS "tableId", restaurant_tables.table_number AS "tableNumber", customer_sessions.nickname AS "customerNickname",
        receipt.receipt_number AS "receiptNumber", receipt.payment_method AS "paymentMethod", receipt.paid_at AS "latestPaymentAt",
        receipt.cashier_name AS "cashierName", COALESCE(items.items, '[]'::jsonb) AS items
        FROM orders JOIN table_sessions ON table_sessions.id = orders.table_session_id
        JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
        LEFT JOIN customer_sessions ON customer_sessions.id = orders.customer_session_id
        LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id', id, 'menuItemId', menu_item_id, 'name', item_name,
          'price', unit_price, 'quantity', quantity, 'paidQuantity', paid_quantity, 'fulfilledQuantity', fulfilled_quantity,
          'orderType', order_type, 'notes', notes, 'optionSnapshot', option_snapshot) ORDER BY id) AS items
          FROM order_items WHERE order_id = orders.id) items ON true
        LEFT JOIN LATERAL (SELECT payments.receipt_number, payments.payment_method, payments.paid_at, users.display_name AS cashier_name
          FROM payments LEFT JOIN users ON users.id = payments.cashier_id
          WHERE payments.receipt_number = orders.receipt_number AND payments.table_session_id = orders.table_session_id
          AND ${paidReceiptCondition} LIMIT 1) receipt ON true
        WHERE orders.id = $1`, [request.params.orderId])
      if (!rows[0]) return response.status(404).json({ error: 'Order not found.' })
      return response.set('Cache-Control', 'no-store').json({ order: rows[0] })
    } catch (error) { return next(error) }
  })
}
