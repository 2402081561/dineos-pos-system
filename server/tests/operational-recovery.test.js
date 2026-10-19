import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { runInNewContext } from 'node:vm'
import { PosValidationError } from '../src/posRules.js'
import { registerPaymentRecoveryRoute } from '../src/paymentRecovery.js'
import { registerCustomerRequestHistory } from '../src/customerRequests.js'
import { registerRefundRoutes, refundInput, pointsToReverse, loadDailyRefundTotals } from '../src/refunds.js'

const actor = '66b195a3-18e0-4f2d-a337-42797a0ba97f'
const key = 'a98b5086-dff8-4aca-b8a7-f42459604745'
const body = { requestId: key, amount: '4.00', reason: 'Wrong item', method: 'Cash', fundsReturned: true }
function res() { return { statusCode: 200, status(code) { this.statusCode = code; return this }, set() { return this }, json(data) { this.body = data; return this } } }
function registry(register, pool) {
  const routes = {}, roles = [], auth = () => {}, session = () => {}
  const app = { get(path, ...handlers) { routes['GET ' + path] = handlers }, post(path, ...handlers) { routes['POST ' + path] = handlers } }
  register(app, { pool, requireAuthenticatedUser: auth, requireCustomerSession: session, requireRole: (...allowed) => { const guard = { allowed }; roles.push(guard); return guard } })
  return { routes, roles, auth, session, async run(path, req) { const result = res(); await routes[path].at(-1)(req, result, (error) => { throw error }); return result } }
}
test('payment recovery is read-only, cashier-owned, parameterized and role guarded', async () => {
  const queries = []
  const h = registry(registerPaymentRecoveryRoute, { query: async (sql, args) => { queries.push({ sql, args }); return { rows: [] } } })
  const path = 'GET /api/v1/cashier/payment-requests/:requestId'
  assert.equal(h.routes[path][0], h.auth); assert.deepEqual(h.roles[0].allowed, ['admin', 'cashier'])
  const response = await h.run(path, { params: { requestId: key }, user: { id: actor } })
  assert.equal(response.body.payment, null); assert.deepEqual(queries[0].args, [key, actor]); assert.match(queries[0].sql, /cashier_id = \$2/)
  assert.equal((await h.run(path, { params: { requestId: 'invalid' } })).statusCode, 400)
  assert.equal(queries.length, 1)
})
test('customer service history reads only the authenticated table visit, never a caller-supplied visit', async () => {
  let args, sql
  const h = registry(registerCustomerRequestHistory, { query: async (query, params) => { sql = query; args = params; return { rows: [{ status: 'completed' }] } } })
  const path = 'GET /api/v1/public/service-requests'
  assert.equal(h.routes[path][0], h.session)
  const response = await h.run(path, { customerSession: { tableSessionId: 'own-visit' }, query: { tableSessionId: 'other-visit' } })
  assert.deepEqual(args, ['own-visit']); assert.match(sql, /LIMIT 100/); assert.match(sql, /updated_at/); assert.equal(response.body.requests[0].status, 'completed')
})
test('refund validation requires a positive cent amount, bounded reason, method and explicit external-money confirmation', () => {
  assert.equal(refundInput(body).cents, 400)
  for (const extra of [{ amount: '1.001' }, { amount: '-1' }, { amount: 0 }, { reason: 'x' }, { reason: 'x'.repeat(501) }, { method: 'Online automatic' }, { fundsReturned: false }, { requestId: 'bad' }]) assert.throws(() => refundInput({ ...body, ...extra }))
})
test('point reversals carry rounding across partial refunds and reach the exact original points at full refund', () => {
  assert.equal(pointsToReverse(9, 400, 1000, 0), 3)
  assert.equal(pointsToReverse(9, 500, 1000, 3), 1)
  assert.equal(pointsToReverse(9, 1000, 1000, 4), 5)
})

function refundHarness({ auditFailure = false, missingPayment = false } = {}) {
  let state = { refunds: [], points: 2, reversals: [], audits: [] }
  const queries = [], locks = new Map()
  async function acquire(key) {
    const prior = locks.get(key) ?? Promise.resolve(); let release
    const next = new Promise((resolve) => { release = resolve }); locks.set(key, next)
    await prior; return release
  }
  const pool = { async connect() {
    let working = null
    const releases = []
    return { async query(sql, args = []) {
      queries.push({ sql, args })
      if (sql === 'BEGIN') return { rows: [] }
      if (sql === 'COMMIT') { if (working) state = working; releases.splice(0).forEach((release) => release()); return { rows: [] } }
      if (sql === 'ROLLBACK') { working = null; releases.splice(0).forEach((release) => release()); return { rows: [] } }
      if (sql.includes('pg_advisory_xact_lock')) { releases.push(await acquire('request:' + args[0])); return { rows: [] } }
      if (sql.includes('WHERE r.request_id =')) return { rows: state.refunds.filter((row) => row.request_id === args[0]) }
      if (sql.includes('FROM payments') && sql.includes('FOR UPDATE')) {
        releases.push(await acquire('payment')); working = structuredClone(state)
        return { rows: missingPayment ? [] : [{ id: 'payment-id', amount: '10.00' }] }
      }
      if (sql.startsWith('SELECT COALESCE(sum(amount)')) return { rows: [{ amount: working.refunds.reduce((sum, row) => sum + Number(row.amount), 0) }] }
      if (sql.includes('sum(points)::int AS earned')) return { rows: [{ member_id: 'member-id', earned: 9 }] }
      if (sql.includes('COALESCE(-sum(points)')) return { rows: [{ points: working.reversals.reduce((sum, value) => sum + value, 0) }] }
      if (sql.startsWith('UPDATE members')) { working.points -= args[0]; return { rows: [] } }
      if (sql.includes('INSERT INTO member_point_transactions')) { working.reversals.push(-args[1]); return { rows: [] } }
      if (sql.includes('INSERT INTO payment_refunds')) {
        const row = { refund_number: args[0], payment_id: args[1], actor_id: args[2], amount: args[3], reason: args[4], method: args[5], request_id: args[6], request_fingerprint: args[7], points_reversed: args[8], created_at: '2026-10-16T04:00:00Z', receiptNumber: 'R-test' }
        working.refunds.push(row); return { rows: [{ refundNumber: row.refund_number, amount: row.amount, createdAt: row.created_at }] }
      }
      if (sql.includes('INSERT INTO audit_logs')) { if (auditFailure) throw new Error('Test audit unavailable'); working.audits.push(args); return { rows: [] } }
      throw new Error('Unhandled mocked query: ' + sql)
    }, release() { releases.splice(0).forEach((release) => release()) } }
  } }
  const h = registry(registerRefundRoutes, pool)
  const path = 'POST /api/v1/admin/receipts/:receiptNumber/refunds'
  return { ...h, state: () => state, queries, runRefund: (input = body, user = actor) => h.run(path, { user: { id: user }, params: { receiptNumber: 'R-test' }, body: input }) }
}
test('refunds are admin-only, immutable additions; replay returns one record, one audit and one point reversal', async () => {
  const h = refundHarness()
  assert.deepEqual(h.roles.at(-1).allowed, ['admin'])
  const first = await h.runRefund(), second = await h.runRefund()
  assert.equal(first.statusCode, 201); assert.equal(second.body.duplicate, true)
  assert.equal(first.body.refund.refundNumber, second.body.refund.refundNumber)
  assert.equal(h.state().refunds.length, 1); assert.equal(h.state().audits.length, 1); assert.equal(h.state().points, -1)
  assert.equal(h.queries.some((query) => /UPDATE (orders|order_items|payments)/.test(query.sql)), false)
  assert.match(h.queries.find((q) => q.sql.includes('FROM payments')).sql, /paid_at IS NOT NULL/)
})
test('different payload/actor cannot reuse a refund key; over-refunds and missing receipts never commit', async () => {
  const h = refundHarness(); await h.runRefund()
  assert.equal((await h.runRefund({ ...body, reason: 'Different reason' })).statusCode, 409)
  assert.equal((await h.runRefund(body, 'different-admin')).statusCode, 409)
  assert.equal((await h.runRefund({ ...body, requestId: crypto.randomUUID(), amount: '6.01' })).statusCode, 409)
  assert.equal(h.state().refunds.length, 1)
  assert.equal((await refundHarness({ missingPayment: true }).runRefund()).statusCode, 404)
})
test('two concurrent refund keys serialize on the receipt and cannot exceed its paid amount', async () => {
  const h = refundHarness()
  const results = await Promise.all([h.runRefund({ ...body, amount: '7.00' }), h.runRefund({ ...body, amount: '7.00', requestId: crypto.randomUUID() })])
  assert.deepEqual(results.map((result) => result.statusCode).sort(), [201, 409])
  assert.equal(h.state().refunds.length, 1); assert.equal(h.state().refunds[0].amount, 7)
})
test('same-key concurrent refund requests commit once and audit failure rolls back points and refund together', async () => {
  const h = refundHarness(); await Promise.all([h.runRefund(), h.runRefund()]); assert.equal(h.state().refunds.length, 1)
  const failing = refundHarness({ auditFailure: true })
  await assert.rejects(failing.runRefund(), /audit unavailable/)
  assert.equal(failing.state().refunds.length, 0); assert.equal(failing.state().points, 2)
})
test('full cumulative refunds reverse exactly the earned points, even when they were already spent', async () => {
  const h = refundHarness(); await h.runRefund(); await h.runRefund({ ...body, requestId: crypto.randomUUID(), amount: '6.00' })
  assert.equal(h.state().reversals.reduce((sum, amount) => sum + amount, 0), 9)
  assert.equal(h.state().points, -7)
})
test('refund daily totals use the recorded Malaysian date, preserve payment method, and distinguish missing upgrade from outage', async () => {
  const totals = await loadDailyRefundTotals({ query: async (sql, args) => { assert.match(sql, /r.created_at AT TIME ZONE 'Asia\/Kuching'/); assert.match(sql, /Original payment method/); assert.deepEqual(args, ['2026-10-16']); return { rows: [{ method: 'Cash', amount: '2.01' }, { method: 'FPX', amount: '3.09' }] } } }, '2026-10-16')
  assert.equal(totals.refundTotal, 5.10); assert.equal(totals.refundBreakdown.FPX, 3.09)
  assert.equal((await loadDailyRefundTotals({ query: async () => { throw { code: '42P01' } } }, '')).refundsAvailable, false)
  await assert.rejects(loadDailyRefundTotals({ query: async () => { throw new Error('offline') } }, ''), /offline/)
})
test('refund migration restricts browser access and updates point sign constraints without touching paid receipts', () => {
  const sql = fs.readFileSync(new URL('../db/030_refund_records.sql', import.meta.url), 'utf8')
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/); assert.match(sql, /REVOKE ALL/); assert.match(sql, /BEFORE UPDATE OR DELETE/)
  assert.match(sql, /type::text IN \('redeem', 'refund'\)/); assert.doesNotMatch(sql, /UPDATE (orders|payments|order_items)/)
})

test('cashier clear rejects a replaced table visit before changing any customer or session', async () => {
  const source = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  const handlerSource = source.slice(source.indexOf("app.post('/api/v1/admin/tables/:tableId/clear'"), source.indexOf("app.get('/api/v1/admin/categories'"))
  let handler
  const queries = [], client = { async query(sql) {
    queries.push(sql)
    if (sql.includes('FROM restaurant_tables')) return { rows: [{ id: 'table', tableNumber: 1 }] }
    if (sql.includes('FROM table_sessions')) return { rows: [{ id: 'new-visit' }] }
    return { rows: [] }
  }, release() {} }
  runInNewContext(handlerSource, { app: { post(_path, _auth, _role, callback) { handler = callback } }, pool: { connect: async () => client }, requireAuthenticatedUser() {}, requireRole() {}, PosValidationError, logAuditEvent: async () => {} })
  const result = res()
  await handler({ params: { tableId: 'table' }, body: { expectedTableSessionId: 'old-visit' }, user: { id: actor } }, result, (error) => { throw error })
  assert.equal(result.statusCode, 409); assert.match(result.body.error, /visit has changed/)
  assert.equal(queries.some((sql) => sql.startsWith('UPDATE')), false); assert.equal(queries.at(-1), 'ROLLBACK')
})
