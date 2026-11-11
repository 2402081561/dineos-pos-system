import { PosValidationError } from './posRules.js'

// Caller holds the physical table and active visit row locks. Order creation
// also locks that visit, so eligibility cannot race a newly submitted order.
export async function prepareNewTableVisit(client, table, active, input, loadSettings) {
  const expected = input?.expectedTableSessionId
  const nextId = input?.newTableSessionId
  const requested = expected !== undefined || nextId !== undefined
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (requested && (!uuid.test(expected ?? '') || !uuid.test(nextId ?? '') || expected === nextId)) throw new PosValidationError('Refresh the table before starting a new visit.', 400)
  if (requested && active?.id === nextId) return active // Same explicit request, lost-response replay.
  if (requested && active?.id !== expected) throw new PosValidationError('The table visit has changed. Please scan the table again.', 409)
  if (!active) return null
  const settings = await loadSettings(client)
  const { rows: [eligibility] } = await client.query(`SELECT EXISTS(SELECT 1 FROM orders WHERE table_session_id=$1) AS "hasOrders",
    EXISTS(SELECT 1 FROM orders WHERE table_session_id=$1 AND status<>'cancelled'
      AND (payment_status<>'paid' OR (status<>'served' AND NOT(status='ready' AND $2::boolean=false)))) AS outstanding`, [active.id, settings.config.requireHandoffConfirmation])
  if (!requested) {
    if (eligibility.hasOrders && !eligibility.outstanding) {
      const error = new PosValidationError('The previous bill is settled. Confirm that you are starting a new table visit.', 409)
      error.newTableRequired = true
      error.expectedTableSessionId = active.id
      throw error
    }
    return active
  }
  if (!eligibility.hasOrders || eligibility.outstanding) throw new PosValidationError('This table still has unpaid or undelivered items. Continue the current visit.', 409)
  // A proposed UUID is also the idempotency identity; reject reuse on a different
  // or completed visit. There is no separate mapping table or schema migration.
  const previous = await client.query('SELECT id FROM table_sessions WHERE id=$1', [nextId])
  if (previous.rowCount) throw new PosValidationError('Please scan the table again before starting a new visit.', 409)
  await client.query('UPDATE customer_sessions SET left_at=COALESCE(left_at,now()) WHERE table_session_id=$1', [active.id])
  await client.query("UPDATE table_sessions SET status='completed',updated_at=now() WHERE id=$1", [active.id])
  await client.query("UPDATE service_requests SET status='completed',updated_at=now() WHERE table_session_id=$1 AND status='pending'", [active.id])
  return (await client.query("INSERT INTO table_sessions(id,table_id,status) VALUES($1,$2,'active') RETURNING id", [nextId, table.id])).rows[0]
}
