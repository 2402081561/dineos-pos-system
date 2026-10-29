import { PosValidationError } from './posRules.js'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function identifierInput(body) {
  const result = {}
  for (const key of ['ticketSeat', 'ticketReference']) {
    const value = body?.[key] ?? ''
    if (typeof value !== 'string' || value.length > 80 || /[\p{Cc}\p{Cf}]/u.test(value)) throw new PosValidationError('Order identifiers must be plain text up to 80 characters.')
    result[key] = value.trim()
  }
  return result
}
export function registerOrderIdentifierRoutes(app, { pool, requireAuthenticatedUser, requireRole }) {
  const guards = [requireAuthenticatedUser, requireRole('admin', 'cashier', 'kitchen')]
  app.get('/api/v1/operations/orders/:orderId/identifiers', ...guards, async (req, res, next) => {
    if (!uuid.test(req.params.orderId)) return res.status(400).json({ error: 'Invalid order.' })
    try {
      const { rows } = await pool.query('SELECT id, ticket_seat AS "ticketSeat", ticket_reference AS "ticketReference", ticket_revision AS "ticketRevision" FROM orders WHERE id=$1', [req.params.orderId])
      if (!rows[0]) return res.status(404).json({ error: 'Order not found.' })
      res.set('Cache-Control', 'no-store').json({ order: rows[0] })
    } catch (error) { if(['42703','42P01'].includes(error.code)) return res.status(503).json({error:'This feature needs database upgrade 032 before use.'}); next(error) }
  })
  app.patch('/api/v1/operations/orders/:orderId/identifiers', ...guards, async (req, res, next) => {
    let input
    try {
      input = identifierInput(req.body)
      if (!uuid.test(req.params.orderId) || !Number.isSafeInteger(req.body?.expectedRevision) || req.body.expectedRevision < 0) throw new PosValidationError('Reload the order identifiers before saving.')
    } catch (error) { return res.status(400).json({ error: error.message }) }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: [order] } = await client.query('SELECT id,status,ticket_seat AS "ticketSeat",ticket_reference AS "ticketReference",ticket_revision AS "ticketRevision" FROM orders WHERE id=$1 FOR UPDATE', [req.params.orderId])
      if (!order || order.status === 'cancelled') throw new PosValidationError('Order identifiers cannot be changed for this order.', 409)
      // Identical retry after a lost response is safe, even with an old revision.
      if (order.ticketSeat !== input.ticketSeat || order.ticketReference !== input.ticketReference) {
        if (order.ticketRevision !== req.body.expectedRevision) throw new PosValidationError('Order identifiers changed. Reload before saving.', 409)
        await client.query('UPDATE orders SET ticket_seat=$1,ticket_reference=$2,ticket_revision=ticket_revision+1 WHERE id=$3', [input.ticketSeat,input.ticketReference,order.id])
        await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,details) VALUES($1,'ORDER_IDENTIFIERS','order',$2,$3::jsonb)", [req.user.id,order.id,JSON.stringify({ before: { ticketSeat: order.ticketSeat,ticketReference: order.ticketReference },after: input })])
        order.ticketRevision++
      }
      await client.query('COMMIT')
      res.json({ order: { id: order.id,...input,ticketRevision: order.ticketRevision } })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      if (error instanceof PosValidationError) return res.status(error.status).json({ error: error.message })
      next(error)
    } finally { client.release() }
  })
}
