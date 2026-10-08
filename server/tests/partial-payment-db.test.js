import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import dotenv from 'dotenv'
import pg from 'pg'
import { paymentPlan, selectPaymentOrders } from '../src/paymentSelection.js'
import { cashTenderInCents } from '../src/cashTender.js'
import { PosValidationError, roundMoney } from '../src/posRules.js'
import { paidReceiptCondition } from '../src/paidReceipt.js'
import { registerHandoffRoutes } from '../src/handoffs.js'

test('actual payment/handoff handlers: partial receipts, stale submits, retry, independent fulfilment and constraints (temporary tables only)', { skip: process.env.DINEOS_DATABASE_TESTS !== '1' }, async () => {
  dotenv.config({ path: new URL('../.env', import.meta.url) })
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    await db.query('SET search_path TO pg_temp, public')
    for (const table of ['orders', 'order_items', 'payments', 'receipt_sequences', 'table_sessions', 'restaurant_tables', 'shop_settings', 'audit_logs', 'customer_sessions', 'users', 'menu_items']) {
      await db.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`)
    }
    const id = randomUUID(), orderId = randomUUID(), itemId = randomUUID(), takeawayId = randomUUID()
    await db.query('INSERT INTO restaurant_tables (id, table_number, capacity) VALUES ($1, 1, 4)', [id])
    await db.query("INSERT INTO table_sessions (id, table_id, status) VALUES ($1, $1, 'active')", [id])
    await db.query("INSERT INTO customer_sessions (id, table_session_id, nickname) VALUES ($1, $1, 'TEST')", [id])
    await db.query("INSERT INTO users (id, email, display_name, role) VALUES ($1, 'temporary@example.invalid', 'Test cashier', 'cashier')", [id])
    await db.query("INSERT INTO shop_settings (id, name) VALUES (1, 'Temporary test restaurant')")
    await db.query("INSERT INTO orders (id, table_session_id, customer_session_id, subtotal, service_charge, sst, grand_total, order_number, table_order_number, order_type, status) VALUES ($1, $2, $2, 23, 2.3, 1.38, 26.68, 'TEST-1', 1, 'mixed', 'ready')", [orderId, id])
    await db.query("INSERT INTO order_items (id, order_id, item_name, unit_price, quantity, order_type) VALUES ($1, $3, 'Mee', 9, 2, 'dine_in'), ($2, $3, 'Tea', 5, 1, 'take_away')", [itemId, takeawayId, orderId])
    const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
    let paymentHandler
    const pool = { connect: async () => ({ query: db.query.bind(db), release() {} }), query: db.query.bind(db) }
    const noop = () => {}
    runInNewContext(source.slice(source.indexOf("app.post('/api/v1/cashier/payments'"), source.indexOf("app.get('/api/v1/cashier/receipts/:receiptNumber'")), {
      app: { post(_path, _auth, _role, callback) { paymentHandler = callback } }, pool, requireAuthenticatedUser: noop, requireRole: noop,
      uuid: /^[0-9a-f-]{36}$/i, paymentMethods: new Set(['Cash']), createHash, paymentPlan, selectPaymentOrders, cashTenderInCents, PosValidationError, roundMoney,
      businessDate: () => '2099-01-01', discountInput: () => ({ amount: 0 }), logAuditEvent: async () => {},
    })
    async function invoke(handler, body, params = {}) {
      let code = 200, result
      await handler({ body, params, user: { id, role: 'cashier' } }, { status(value) { code = value; return this }, json(value) { result = value; return this } }, (error) => { throw error })
      return { code, result }
    }
    const version = async () => (await db.query('SELECT version FROM orders WHERE id = $1', [orderId])).rows[0].version
    const firstBody = { requestId: randomUUID(), orderIds: [orderId], versions: { [orderId]: await version() }, selections: [{ itemId, quantity: 1 }], paymentMethod: 'Cash', cashReceived: 20, expectedAmount: 10.44 }
    const first = await invoke(paymentHandler, firstBody)
    assert.equal(first.code, 201)
    assert.equal(Number(first.result.payment.changeAmount), 9.56)
    const retry = await invoke(paymentHandler, firstBody)
    assert.equal(retry.result.payment.receiptNumber, first.result.payment.receiptNumber)
    assert.equal((await db.query('SELECT count(*)::int AS count FROM payments')).rows[0].count, 1)
    const stale = await invoke(paymentHandler, { ...firstBody, requestId: randomUUID() })
    assert.equal(stale.code, 409)
    const mismatchedRetry = await invoke(paymentHandler, { ...firstBody, cashReceived: 50 })
    assert.equal(mismatchedRetry.code, 409)
    const receipt = (await db.query(`SELECT order_snapshot FROM payments WHERE ${paidReceiptCondition}`)).rows[0]
    assert.equal(receipt.order_snapshot[0].items[0].quantity, 1)
    const receiptQuery = source.split("app.get('/api/v1/cashier/receipts/:receiptNumber'")[1].split('pool.query(`')[1].split('`, [String(request.params.receiptNumber')[0].replace('${paidReceiptCondition}', paidReceiptCondition)
    const printed = (await db.query(receiptQuery, [first.result.payment.receiptNumber])).rows[0]
    assert.equal(printed.orders[0].items[0].quantity, 1)
    assert.equal(printed.orders[0].customerNickname, 'TEST')
    assert.equal(printed.orders[0].orderType, 'dine_in')
    assert.equal(Number(printed.amount), 10.44)
    let saved = (await db.query('SELECT * FROM orders WHERE id = $1', [orderId])).rows[0]
    assert.equal(saved.payment_status, 'pending')
    assert.equal(saved.status, 'ready')
    assert.equal(Math.round(Number(saved.grand_total) * 100) - Math.round(Number(saved.paid_amount) * 100), 1624)
    const remaining = await invoke(paymentHandler, { ...firstBody, requestId: randomUUID(), versions: { [orderId]: await version() }, selections: [{ itemId, quantity: 1 }, { itemId: takeawayId, quantity: 1 }], expectedAmount: 16.24 })
    assert.equal(remaining.code, 201)
    assert.notEqual(remaining.result.payment.receiptNumber, first.result.payment.receiptNumber)
    saved = (await db.query('SELECT * FROM orders WHERE id = $1', [orderId])).rows[0]
    assert.equal(saved.payment_status, 'paid')
    assert.equal(saved.status, 'ready')
    assert.equal(Number(saved.paid_amount), 26.68)
    assert.equal((await db.query(`SELECT 1 FROM orders WHERE status <> 'cancelled' AND (payment_status <> 'paid' OR status <> 'served')`)).rowCount, 1)
    let handoffHandler
    registerHandoffRoutes({ get() {}, patch(_p, _a, _r, handler) { handoffHandler = handler } }, { pool, requireAuthenticatedUser: noop, requireRole: noop })
    const handoffBody = { itemId, quantity: 2, expectedVersion: await version() }
    assert.equal((await invoke(handoffHandler, handoffBody, { orderId })).code, 200)
    assert.equal((await invoke(handoffHandler, handoffBody, { orderId })).code, 409)
    assert.equal((await db.query('SELECT status FROM orders')).rows[0].status, 'ready')
    assert.equal((await invoke(handoffHandler, { itemId: takeawayId, quantity: 1, expectedVersion: await version() }, { orderId })).code, 200)
    assert.equal((await db.query('SELECT status FROM orders')).rows[0].status, 'served')
    assert.equal((await db.query(`SELECT 1 FROM orders WHERE status <> 'cancelled' AND (payment_status <> 'paid' OR status <> 'served')`)).rowCount, 0)
    assert.equal((await db.query(`SELECT order_snapshot FROM payments WHERE receipt_number = $1`, [first.result.payment.receiptNumber])).rows[0].order_snapshot[0].items[0].quantity, 1)
    await assert.rejects(db.query('UPDATE order_items SET paid_quantity = quantity + 1'), (error) => error.code === '23514')
  } finally { await db.end() }
})
