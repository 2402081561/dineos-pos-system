import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerOrderDetailsRoute } from '../src/orderDetails.js'

const orderId = 'd01be883-6c4e-468a-9d22-1006dfe622b4'
function harness(query) {
  let handler
  const roles = []
  const auth = () => {}
  const roleGuard = () => {}
  registerOrderDetailsRoute({ get(path, first, second, callback) {
    assert.equal(path, '/api/v1/cashier/orders/:orderId')
    assert.equal(first, auth)
    assert.equal(second, roleGuard)
    handler = callback
  } }, { pool: { query }, requireAuthenticatedUser: auth, requireRole(...values) { roles.push(...values); return roleGuard } })
  assert.deepEqual(roles, ['admin', 'cashier'])
  const response = { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this }, set(key, value) { this.headers[key] = value; return this }, json(body) { this.body = body; return this } }
  return { response, run: (id = orderId, next = (error) => { throw error }) => handler({ params: { orderId: id } }, response, next) }
}

test('single-ticket detail route is authenticated, role restricted, parameterized and read only', async () => {
  const order = { id: orderId, tableNumber: 1, tableSessionStatus: 'completed', items: [{ id: 'item-1' }], receiptNumber: 'R001' }
  const route = harness(async (sql, params) => {
    assert.deepEqual(params, [orderId])
    assert.match(sql, /WHERE orders\.id = \$1/)
    assert.match(sql, /payments\.paid_at IS NOT NULL/)
    assert.match(sql, /payments\.table_session_id = orders\.table_session_id/)
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|FOR UPDATE)\b/)
    return { rows: [order] }
  })
  await route.run()
  assert.equal(route.response.statusCode, 200)
  assert.equal(route.response.headers['Cache-Control'], 'no-store')
  assert.deepEqual(route.response.body.order, order)
})

test('invalid IDs never query the database; a missing ticket returns 404', async () => {
  const invalid = harness(() => { throw new Error('Must not query') })
  await invalid.run('temporary-session')
  assert.equal(invalid.response.statusCode, 400)
  const missing = harness(async () => ({ rows: [] }))
  await missing.run()
  assert.equal(missing.response.statusCode, 404)
})

test('database failure is forwarded to the normal API error handler', async () => {
  const failure = new Error('database offline')
  const route = harness(async () => { throw failure })
  let received
  await route.run(orderId, (error) => { received = error })
  assert.equal(received, failure)
})
