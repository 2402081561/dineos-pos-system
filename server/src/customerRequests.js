export function registerCustomerRequestHistory(app, { pool, requireCustomerSession }) {
  app.get('/api/v1/public/service-requests', requireCustomerSession, async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT id, request_type AS "requestType", status,
        created_at AS "createdAt", updated_at AS "updatedAt"
        FROM service_requests WHERE table_session_id = $1
        ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 100`, [req.customerSession.tableSessionId])
      return res.set('Cache-Control', 'no-store').json({ requests: rows })
    } catch (error) { return next(error) }
  })
}
