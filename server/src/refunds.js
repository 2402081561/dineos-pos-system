import { createHash, randomUUID } from 'node:crypto'
import { cashTenderInCents } from './cashTender.js'
import { paidReceiptCondition } from './paidReceipt.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
class RefundError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
export function refundInput(body) {
  const cents = cashTenderInCents(body?.amount), reason = String(body?.reason ?? '').trim()
  if (!uuid.test(body?.requestId ?? '') || cents === null || cents <= 0 || reason.length < 3 || reason.length > 500 ||
      !['Cash', 'Original payment method', 'Other'].includes(body?.method) || body?.fundsReturned !== true) {
    throw new RefundError('Enter a valid refund amount, reason and method, and confirm the money was returned outside DineOS.')
  }
  return { cents, reason, method: body.method, requestId: body.requestId, fundsReturned: true }
}
export function pointsToReverse(earned, refundedCents, totalCents, alreadyReversed) {
  return Math.max(0, Math.floor(earned * refundedCents / totalCents) - alreadyReversed)
}
const fields = `r.refund_number AS "refundNumber", r.request_id AS "requestId", p.restaurant_name AS "restaurantName", p.receipt_number AS "receiptNumber", r.amount, r.reason, r.method,
  r.created_at AS "createdAt", r.points_reversed AS "pointsReversed", u.display_name AS "actorName"`
const joins = 'FROM payment_refunds r JOIN payments p ON p.id = r.payment_id JOIN users u ON u.id = r.actor_id'
const upgradeMessage = 'Refund records are not available until the database upgrade is applied.'

export async function loadDailyRefundTotals(pool, date) {
  try {
    const { rows } = await pool.query(`SELECT CASE WHEN r.method = 'Original payment method' THEN p.payment_method ELSE r.method END AS method,
      sum(r.amount) AS amount FROM payment_refunds r JOIN payments p ON p.id = r.payment_id
      WHERE (r.created_at AT TIME ZONE 'Asia/Kuching')::date = $1::date GROUP BY 1`, [date])
    const refundBreakdown = Object.fromEntries(rows.map((row) => [row.method, Number(row.amount)]))
    return { refundsAvailable: true, refundTotal: Math.round(rows.reduce((sum, row) => sum + Number(row.amount), 0) * 100) / 100, refundBreakdown }
  } catch (error) { if (error.code === '42P01') return { refundsAvailable: false, refundTotal: null }; throw error }
}

export function registerRefundRoutes(app, { pool, requireAuthenticatedUser, requireRole }) {
  app.get('/api/v1/admin/refund-events', requireAuthenticatedUser, requireRole('admin'), async (_req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT ${fields} ${joins} ORDER BY r.created_at DESC`)
      return res.set('Cache-Control', 'no-store').json({ refunds: rows, refundsAvailable: true })
    } catch (error) {
      if (error.code === '42P01') return res.json({ refunds: [], refundsAvailable: false })
      return next(error)
    }
  })
  app.get('/api/v1/cashier/receipts/:receiptNumber/refunds', requireAuthenticatedUser, requireRole('admin', 'cashier'), async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT payments.id, payments.amount, payments.payment_method AS "paymentMethod"
        FROM payments WHERE payments.receipt_number = $1 AND ${paidReceiptCondition}`, [req.params.receiptNumber])
      if (!rows[0]) return res.status(404).json({ error: 'Receipt not found.' })
      const records = await pool.query(`SELECT ${fields} ${joins} WHERE r.payment_id = $1 ORDER BY r.created_at DESC`, [rows[0].id])
      const totalCents = cashTenderInCents(rows[0].amount)
      const refunded = records.rows.reduce((sum, row) => sum + cashTenderInCents(row.amount), 0)
      return res.set('Cache-Control', 'no-store').json({ receiptNumber: req.params.receiptNumber, amount: rows[0].amount,
        paymentMethod: rows[0].paymentMethod, refundedAmount: refunded / 100, refundableAmount: (totalCents - refunded) / 100, refunds: records.rows })
    } catch (error) { if (error.code === '42P01') return res.status(503).json({ error: upgradeMessage }); return next(error) }
  })
  app.post('/api/v1/admin/receipts/:receiptNumber/refunds', requireAuthenticatedUser, requireRole('admin'), async (req, res, next) => {
    let input
    try { input = refundInput(req.body) } catch (error) { return res.status(error.status).json({ error: error.message }) }
    const fingerprint = createHash('sha256').update(JSON.stringify({ receipt: req.params.receiptNumber, ...input })).digest('hex')
    let client
    try {
      client = await pool.connect()
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.requestId])
      const previous = await client.query(`SELECT r.*, p.receipt_number AS "receiptNumber" ${joins} WHERE r.request_id = $1`, [input.requestId])
      if (previous.rows[0]) {
        const row = previous.rows[0]
        if (row.actor_id !== req.user.id || row.request_fingerprint !== fingerprint) throw new RefundError('This refund request was already used for different details.', 409)
        await client.query('COMMIT')
        return res.json({ refund: { refundNumber: row.refund_number, receiptNumber: row.receiptNumber, amount: row.amount, createdAt: row.created_at }, duplicate: true })
      }
      const { rows: payments } = await client.query(`SELECT payments.id, payments.amount FROM payments
        WHERE payments.receipt_number = $1 AND ${paidReceiptCondition} FOR UPDATE`, [req.params.receiptNumber])
      const payment = payments[0]
      if (!payment) throw new RefundError('Receipt not found.', 404)
      const totals = await client.query('SELECT COALESCE(sum(amount), 0) AS amount FROM payment_refunds WHERE payment_id = $1', [payment.id])
      const totalCents = cashTenderInCents(payment.amount), previousCents = cashTenderInCents(totals.rows[0].amount)
      if (totalCents === null || previousCents === null || input.cents + previousCents > totalCents) throw new RefundError('Refund exceeds the remaining refundable amount. Refresh the receipt.', 409)
      const number = `RF-${randomUUID().replaceAll('-', '').toUpperCase()}`
      const earns = await client.query(`SELECT member_id, sum(points)::int AS earned FROM member_point_transactions
        WHERE payment_id = $1 AND type = 'earn' GROUP BY member_id ORDER BY member_id`, [payment.id])
      let pointsReversed = 0
      for (const earn of earns.rows) {
        const reversed = await client.query(`SELECT COALESCE(-sum(points), 0)::int AS points FROM member_point_transactions
          WHERE payment_id = $1 AND member_id = $2 AND type = 'refund'`, [payment.id, earn.member_id])
        const points = pointsToReverse(Number(earn.earned), previousCents + input.cents, totalCents, Number(reversed.rows[0].points))
        if (!points) continue
        await client.query('UPDATE members SET points_balance = points_balance - $1, updated_at = now() WHERE id = $2', [points, earn.member_id])
        await client.query(`INSERT INTO member_point_transactions (member_id, type, points, payment_id, redemption_reference)
        VALUES ($1, 'refund', $2, $3, $4)`, [earn.member_id, -points, payment.id, `${number}:${earn.member_id}`])
        pointsReversed += points
      }
      const result = await client.query(`INSERT INTO payment_refunds (refund_number, payment_id, actor_id, amount, reason, method,
        funds_returned, request_id, request_fingerprint, points_reversed) VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9)
        RETURNING refund_number AS "refundNumber", amount, created_at AS "createdAt"`,
      [number, payment.id, req.user.id, input.cents / 100, input.reason, input.method, input.requestId, fingerprint, pointsReversed])
      // The audit entry is in the same transaction, not a best-effort async write.
      await client.query(`INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
        VALUES ($1, 'RECORD_MANUAL_REFUND', 'receipt', $2, $3::jsonb)`,
      [req.user.id, req.params.receiptNumber, JSON.stringify({ refundNumber: number, amount: input.cents / 100, reason: input.reason, method: input.method, pointsReversed, bankTransferExecuted: false })])
      await client.query('COMMIT')
      return res.status(201).json({ refund: { ...result.rows[0], receiptNumber: req.params.receiptNumber, pointsReversed }, duplicate: false })
    } catch (error) {
      if (client) await client.query('ROLLBACK')
      if (error instanceof RefundError) return res.status(error.status).json({ error: error.message })
      if (error.code === '42P01' || error.code === '22P02') return res.status(503).json({ error: upgradeMessage })
      return next(error)
    } finally { client?.release() }
  })
}
