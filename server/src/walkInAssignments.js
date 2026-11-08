import { createHash } from 'node:crypto'
import { PosValidationError } from './posRules.js'
import { orderVersions } from './tableVisitMoves.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const versions = (rows) => {
  if (!Array.isArray(rows) || rows.length > 1000 || rows.some((row) => !uuid.test(row?.id) || !Number.isSafeInteger(row.version) || row.version < 0) || new Set(rows.map((row) => row.id)).size !== rows.length) throw new PosValidationError('Reload the current table orders.')
  return orderVersions(rows)
}
export function assignmentInput(body) {
  if (!body || !uuid.test(body.requestId) || !uuid.test(body.sourceSessionId) || !uuid.test(body.targetTableId) || (body.targetSessionId !== null && !uuid.test(body.targetSessionId))) throw new PosValidationError('Choose a table and reload the walk-in bill.')
  return { requestId: body.requestId, sourceSessionId: body.sourceSessionId, targetTableId: body.targetTableId, targetSessionId: body.targetSessionId, sourceOrders: versions(body.sourceOrders), targetOrders: versions(body.targetOrders) }
}
async function ready(db) {
  if (!(await db.query("SELECT to_regclass('public.walk_in_table_assignments') AS ready")).rows[0]?.ready) throw new PosValidationError('Assigning walk-ins needs database upgrade 035 before use.', 503)
}
export function registerWalkInAssignmentRoutes(app, { pool, requireAuthenticatedUser, requireRole }) {
  const guards = [requireAuthenticatedUser, requireRole('admin', 'cashier')]
  app.get('/api/v1/cashier/walk-in-visits/:sessionId/tables', ...guards, async (req, res, next) => {
    if (!uuid.test(req.params.sessionId)) return res.status(400).json({ error: 'Choose a table and reload the walk-in bill.' })
    try {
      await ready(pool)
      const { rows: source } = await pool.query("SELECT id FROM table_sessions WHERE id=$1 AND table_id IS NULL AND status='active'", [req.params.sessionId])
      if (!source.length) throw new PosValidationError('This walk-in bill has changed. Reopen its order details.', 409)
      if ((await pool.query("SELECT 1 FROM customer_sessions WHERE table_session_id=$1 AND to_jsonb(customer_sessions)->>'takeaway_join_hash' IS NOT NULL",[req.params.sessionId])).rowCount) throw new PosValidationError('Take-away QR orders stay separate from table bills.',409)
      const { rows: sourceOrders } = await pool.query('SELECT id,version FROM orders WHERE table_session_id=$1 ORDER BY id', [req.params.sessionId])
      const paid = await pool.query("SELECT 1 FROM payments WHERE table_session_id=$1 UNION ALL SELECT 1 FROM orders WHERE table_session_id=$1 AND (payment_status='paid' OR paid_amount>0 OR receipt_number IS NOT NULL) UNION ALL SELECT 1 FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.table_session_id=$1 AND i.paid_quantity>0 LIMIT 1", [req.params.sessionId])
      const { rows: tables } = await pool.query(`SELECT t.id,t.table_number AS "tableNumber",s.id AS "tableSessionId",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'version',o.version) ORDER BY o.id) FROM orders o WHERE o.table_session_id=s.id),'[]'::jsonb) AS orders,
        (EXISTS(SELECT 1 FROM payments p WHERE p.table_session_id=s.id) OR EXISTS(SELECT 1 FROM orders o LEFT JOIN order_items i ON i.order_id=o.id WHERE o.table_session_id=s.id AND (o.payment_status='paid' OR o.paid_amount>0 OR o.receipt_number IS NOT NULL OR i.paid_quantity>0))) AS "hasPayments",
        COALESCE((SELECT sum(grand_total-paid_amount) FROM orders o WHERE o.table_session_id=s.id AND status<>'cancelled'),0) AS "unpaidTotal"
        FROM restaurant_tables t LEFT JOIN table_sessions s ON s.table_id=t.id AND s.status='active' WHERE t.is_enabled ORDER BY t.table_number`)
      res.set('Cache-Control', 'no-store').json({ source: { tableSessionId: req.params.sessionId, orders: sourceOrders, hasPayments: paid.rowCount > 0 }, tables })
    } catch (error) { if (error instanceof PosValidationError) return res.status(error.status).json({ error: error.message }); next(error) }
  })
  app.post('/api/v1/cashier/walk-in-visits/assign-table', ...guards, async (req, res, next) => {
    let input
    try { input = assignmentInput(req.body) } catch (error) { return res.status(400).json({ error: error.message }) }
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await ready(client)
      await client.query("SET LOCAL lock_timeout='5s'")
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [input.requestId])
      const previous = (await client.query('SELECT actor_id,fingerprint,result FROM walk_in_table_assignments WHERE request_id=$1', [input.requestId])).rows[0]
      if (previous) {
        if (previous.actor_id !== req.user.id || previous.fingerprint !== fingerprint) throw new PosValidationError('This assignment request belongs to a different operation.', 409)
        await client.query('COMMIT')
        return res.json({ result: previous.result, duplicate: true })
      }
      const table = await client.query('SELECT id,table_number FROM restaurant_tables WHERE id=$1 AND is_enabled FOR UPDATE', [input.targetTableId])
      if (!table.rowCount) throw new PosValidationError('The selected table is unavailable.', 409)
      const visits = (await client.query("SELECT id,table_id,last_order_number FROM table_sessions WHERE (id=$1 OR table_id=$2) AND status='active' ORDER BY id FOR UPDATE", [input.sourceSessionId, input.targetTableId])).rows
      const source = visits.find((row) => row.id === input.sourceSessionId), target = visits.find((row) => row.table_id === input.targetTableId)
      if (!source || source.table_id !== null || (target?.id ?? null) !== input.targetSessionId) throw new PosValidationError('Table visits changed. Reload and confirm again.', 409)
      if ((await client.query("SELECT 1 FROM customer_sessions WHERE table_session_id=$1 AND to_jsonb(customer_sessions)->>'takeaway_join_hash' IS NOT NULL",[source.id])).rowCount) throw new PosValidationError('Take-away QR orders stay separate from table bills.',409)
      const sessions = [source.id, ...(target ? [target.id] : [])]
      const orders = (await client.query('SELECT id,table_session_id,version,payment_status,paid_amount,receipt_number,table_order_number FROM orders WHERE table_session_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [sessions])).rows
      const from = orders.filter((row) => row.table_session_id === source.id), to = orders.filter((row) => row.table_session_id === target?.id)
      if (!from.length || JSON.stringify(orderVersions(from)) !== JSON.stringify(input.sourceOrders) || JSON.stringify(orderVersions(to)) !== JSON.stringify(input.targetOrders)) throw new PosValidationError('Table orders changed. Reload and confirm again.', 409)
      const payments = await client.query('SELECT 1 FROM payments WHERE table_session_id=ANY($1::uuid[]) LIMIT 1', [sessions])
      const paidItems = await client.query('SELECT 1 FROM order_items WHERE order_id=ANY($1::uuid[]) AND paid_quantity>0 LIMIT 1', [orders.map((row) => row.id)])
      if (payments.rowCount || paidItems.rowCount || orders.some((row) => row.payment_status === 'paid' || Number(row.paid_amount) > 0 || row.receipt_number)) throw new PosValidationError('Bills with any payment cannot be assigned to another table.', 409)
      // No item, price, payment or kitchen-state changes. The original order IDs
      // stay intact, and a lost counter-order response remains safely retryable.
      await client.query('UPDATE orders SET counter_request_walk_in=true WHERE table_session_id=$1', [source.id])
      if (!target) {
        await client.query('UPDATE table_sessions SET table_id=$1,updated_at=now() WHERE id=$2', [input.targetTableId, source.id])
        await client.query('UPDATE orders SET version=version+1,updated_at=now() WHERE table_session_id=$1', [source.id])
      } else {
        const customers = await client.query('SELECT id,created_by_cashier FROM customer_sessions WHERE table_session_id=$1 ORDER BY id FOR UPDATE', [source.id])
        if (customers.rows.some((row) => !row.created_by_cashier)) throw new PosValidationError('This walk-in bill has changed. Reopen its order details.', 409)
        await client.query('UPDATE customer_sessions SET table_session_id=$1 WHERE table_session_id=$2', [target.id, source.id])
        let counter = BigInt(target.last_order_number)
        for (const order of from.sort((a, b) => BigInt(a.table_order_number) < BigInt(b.table_order_number) ? -1 : 1)) {
          counter++
          await client.query('UPDATE orders SET table_session_id=$1,table_order_number=$2,version=version+1,updated_at=now() WHERE id=$3', [target.id, counter.toString(), order.id])
        }
        await client.query('UPDATE orders SET version=version+1,updated_at=now() WHERE table_session_id=$1 AND NOT(id=ANY($2::uuid[]))', [target.id, from.map((row) => row.id)])
        await client.query('UPDATE service_requests SET table_session_id=$1 WHERE table_session_id=$2', [target.id, source.id])
        await client.query('UPDATE table_sessions SET last_order_number=$1,updated_at=now() WHERE id=$2', [counter.toString(), target.id])
        await client.query("UPDATE table_sessions SET status='completed',updated_at=now() WHERE id=$1", [source.id])
      }
      const result = { sourceSessionId: source.id, tableSessionId: target?.id ?? source.id, tableId: input.targetTableId, tableNumber: table.rows[0].table_number, merged: Boolean(target) }
      await client.query('INSERT INTO walk_in_table_assignments(request_id,actor_id,fingerprint,result) VALUES($1,$2,$3,$4::jsonb)', [input.requestId, req.user.id, fingerprint, JSON.stringify(result)])
      await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,details) VALUES($1,'WALK_IN_TABLE_ASSIGNED','tableSession',$2,$3::jsonb)", [req.user.id, source.id, JSON.stringify(result)])
      await client.query('COMMIT')
      res.json({ result, duplicate: false })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      if (error instanceof PosValidationError) return res.status(error.status).json({ error: error.message })
      if (['40P01', '55P03', '23505'].includes(error.code)) return res.status(409).json({ error: 'Table visits changed. Reload and confirm again.' })
      next(error)
    } finally { client.release() }
  })
}
