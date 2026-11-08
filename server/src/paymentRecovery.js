export function registerPaymentRecoveryRoute(app, { pool, requireAuthenticatedUser, requireRole }) {
  app.get('/api/v1/cashier/payment-requests/:requestId', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (req, res, next) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.requestId)) return res.status(400).json({ error: 'Invalid payment request.' })
    try {
      const { rows } = await pool.query(`SELECT p.receipt_number AS "receiptNumber", p.table_session_id AS "tableSessionId", p.amount, p.paid_at AS "paidAt",
        p.payment_method AS "paymentMethod", p.cash_received AS "cashReceived", p.change_amount AS "changeAmount",
        t.id AS "tableId", t.table_number AS "tableNumber", t.table_number IS NULL AS "isWalkIn"
        FROM payments p JOIN table_sessions s ON s.id = p.table_session_id LEFT JOIN restaurant_tables t ON t.id = s.table_id
        WHERE p.request_id = $1 AND p.cashier_id = $2`, [req.params.requestId, req.user.id])
      return res.set('Cache-Control', 'no-store').json({ payment: rows[0] ?? null })
    } catch (error) { return next(error) }
  })
}
