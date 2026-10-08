export const takeAwayQueueSql = `
  SELECT orders.id, orders.order_number AS "orderNumber", orders.order_type AS "orderType",
    orders.status, orders.created_at AS "createdAt", restaurant_tables.table_number AS "tableNumber",
    customer_sessions.nickname AS "customerNickname",
    COALESCE(jsonb_agg(jsonb_build_object('id', order_items.id, 'name', order_items.item_name,
      'quantity', order_items.quantity - order_items.fulfilled_quantity, 'orderType', order_items.order_type, 'notes', order_items.notes, 'optionSnapshot', order_items.option_snapshot)
      ORDER BY order_items.id) FILTER (WHERE order_items.id IS NOT NULL), '[]'::jsonb) AS items
  FROM orders
  JOIN table_sessions ON table_sessions.id = orders.table_session_id
  JOIN restaurant_tables ON restaurant_tables.id = table_sessions.table_id
  JOIN customer_sessions ON customer_sessions.id = orders.customer_session_id
  JOIN order_items ON order_items.order_id = orders.id AND order_items.order_type = 'take_away' AND order_items.fulfilled_quantity < order_items.quantity
  WHERE orders.order_type IN ('take_away', 'mixed') AND orders.status IN ('received', 'preparing', 'ready')
    AND table_sessions.status = 'active'
  GROUP BY orders.id, restaurant_tables.table_number, customer_sessions.nickname
  ORDER BY CASE WHEN orders.status = 'ready' THEN 0 ELSE 1 END, orders.created_at ASC
`

export function registerTakeAwayRoutes(app, { pool, requireAuthenticatedUser, requireRole }) {
  app.get('/api/v1/staff/take-away-orders', requireAuthenticatedUser, requireRole('admin', 'staff'), async (_request, response, next) => {
    try {
      const { rows } = await pool.query(takeAwayQueueSql)
      response.status(200).json({ orders: rows })
    } catch (error) { next(error) }
  })
}
