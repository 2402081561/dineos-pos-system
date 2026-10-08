import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import dotenv from 'dotenv'
import pg from 'pg'
import { registerOrderChangeRoutes } from '../src/orderChanges.js'
import { registerShopSettingsRoutes } from '../src/shopSettings.js'
import { paidReceiptCondition } from '../src/paidReceipt.js'

const enabled = process.env.DINEOS_DATABASE_TESTS === '1'
const id = '11111111-1111-4111-8111-111111111111'
const itemId = '22222222-2222-4222-8222-222222222222'
const tableId = '33333333-3333-4333-8333-333333333333'
function routes() {
  const handlers = new Map()
  const app = Object.fromEntries(['get', 'patch'].map((method) => [method, (path, ...list) => handlers.set(method + path, list.at(-1))]))
  return { app, async run(method, path, request = {}) {
    let status = 200, body
    const response = { status(code) { status = code; return this }, set() { return this }, json(value) { body = value; return this } }
    await handlers.get(method + path)(request, response, (error) => { throw error })
    return { status, body }
  } }
}
async function connection() {
  dotenv.config({ path: new URL('../.env', import.meta.url) })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  return client
}

test('new production read queries execute against PostgreSQL without changing data', { skip: !enabled }, async () => {
  const client = await connection()
  try {
    await client.query('BEGIN READ ONLY')
    const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
    for (const [start, end, parameters] of [
      ["app.get('/api/v1/public/menu'", "app.get('/api/v1/public/tables", []],
      ["app.get('/api/v1/kitchen/orders'", "app.patch('/api/v1/kitchen/orders", []],
      ["app.get('/api/v1/admin/menu-items'", "app.post('/api/v1/admin/menu-items'", []],
      ["app.get('/api/v1/cashier/receipts/:receiptNumber'", "app.post('/api/v1/cashier/receipts/:receiptNumber/reprint'", ['nonexistent-test-receipt']],
    ]) {
      const section = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
      const queries = [...section.matchAll(/pool\.query\(`([\s\S]*?)`/g)]
      assert.ok(queries.length, start)
      for (const [, sql] of queries) await client.query(sql.replace('${paidReceiptCondition}', paidReceiptCondition), parameters)
    }
    const fixture = routes()
    registerOrderChangeRoutes(fixture.app, { pool: client, requireAuthenticatedUser() {}, requireRole() {} })
    assert.equal((await fixture.run('get', '/api/v1/cashier/tables/:tableId/orders', { params: { tableId } })).status, 200)
  } finally { await client.query('ROLLBACK'); await client.end() }
})

test('settings CAS, unpaid edits, history and stale-save rejection use temporary tables only', { skip: !enabled }, async () => {
  const client = await connection()
  try {
    // All mutated names are shadowed by connection-local temporary tables.
    // Production settings, orders, users and audit history are never written.
    await client.query('SET search_path TO pg_temp, public')
    await client.query(`CREATE TEMP TABLE shop_settings (id int, name text, config jsonb, revision int, updated_at timestamptz);
      CREATE TEMP TABLE orders (id uuid, order_type text DEFAULT 'dine_in', table_session_id uuid, customer_session_id uuid, order_number text, status text, payment_status text, version int, subtotal numeric, service_charge numeric, sst numeric, grand_total numeric, service_charge_rate numeric, sst_rate numeric, revision_note text, is_addition boolean, created_at timestamptz, updated_at timestamptz);
      CREATE TEMP TABLE order_items (id uuid, order_id uuid, item_name text, unit_price numeric, quantity int, notes text, option_snapshot jsonb, order_type text DEFAULT 'dine_in', paid_quantity integer DEFAULT 0, fulfilled_quantity integer DEFAULT 0);
      CREATE TEMP TABLE order_revisions (id uuid DEFAULT gen_random_uuid(), order_id uuid, actor_id uuid, reason text, before_snapshot jsonb, after_snapshot jsonb, created_at timestamptz DEFAULT now());
      CREATE TEMP TABLE audit_logs (actor_id uuid, action text, target_type text, target_id uuid, details jsonb);
      CREATE TEMP TABLE table_sessions (id uuid, table_id uuid, status text);
      CREATE TEMP TABLE customer_sessions (id uuid, nickname text);
      CREATE TEMP TABLE users (id uuid, display_name text);
      INSERT INTO shop_settings VALUES (1, 'Test restaurant', '{}', 0, now());`)
    await client.query(`INSERT INTO table_sessions VALUES ($1, $2, 'active');`, [id, tableId])
    await client.query('INSERT INTO users VALUES ($1, $2)', [id, 'Test cashier'])
    await client.query(`INSERT INTO orders (id, table_session_id, order_number, status, payment_status, version, service_charge_rate, sst_rate, grand_total, is_addition, created_at) VALUES ($1, $1, 'TEST-TICKET', 'received', 'pending', 0, 0, 0, 10, false, now())`, [id])
    await client.query('INSERT INTO order_items (id, order_id, item_name, unit_price, quantity, notes, option_snapshot) VALUES ($1, $2, $3, 5, 2, $4, $5::jsonb)', [itemId, id, 'Tea', '', JSON.stringify([{ groupName: 'Temperature', options: [{ label: 'Hot', price: 0 }] }])])
    const fixture = routes()
    const pool = { query: (...args) => client.query(...args), connect: async () => ({ query: (...args) => client.query(...args), release() {} }) }
    registerOrderChangeRoutes(fixture.app, { pool, requireAuthenticatedUser() {}, requireRole() {} })
    registerShopSettingsRoutes(fixture.app, { pool, requireAuthenticatedUser() {}, requireRole() {}, logAuditEvent: async () => {} })
    const settings = { user: { id, role: 'admin' }, body: { name: 'Updated test restaurant', config: { serviceChargeRate: 0, sstRate: 0 }, expectedRevision: 0 } }
    assert.equal((await fixture.run('patch', '/api/v1/admin/shop-settings', settings)).status, 200)
    assert.equal((await fixture.run('patch', '/api/v1/admin/shop-settings', settings)).status, 409)
    const request = { params: { orderId: id }, user: { id, role: 'cashier' }, body: { expectedVersion: 0, reason: 'Customer corrected quantity', items: [{ id: itemId, quantity: 1, notes: 'Less sugar' }] } }
    assert.equal((await fixture.run('patch', '/api/v1/cashier/orders/:orderId/items', request)).status, 200)
    assert.equal((await fixture.run('patch', '/api/v1/cashier/orders/:orderId/items', request)).status, 409)
    const result = await fixture.run('get', '/api/v1/cashier/tables/:tableId/orders', { params: { tableId } })
    assert.equal(result.body.orders[0].history.length, 1)
    assert.equal(result.body.orders[0].history[0].before.items[0].quantity, 2)
    assert.equal(result.body.orders[0].items[0].quantity, 1)
    assert.equal(Number(result.body.orders[0].grandTotal), 5)
    assert.equal((await client.query('SELECT count(*) FROM audit_logs')).rows[0].count, '1')
    // Removing just the take-away line must not leave the whole ticket marked
    // as mixed, and its immutable audit must retain the original packing type.
    const takeAwayId = '44444444-4444-4444-8444-444444444444'
    await client.query("INSERT INTO order_items (id, order_id, item_name, unit_price, quantity, notes, order_type) VALUES ($1, $2, 'Tea', 5, 1, 'To go', 'take_away')", [takeAwayId, id])
    await client.query("UPDATE orders SET order_type = 'mixed', grand_total = 10 WHERE id = $1", [id])
    const edited = await fixture.run('patch', '/api/v1/cashier/orders/:orderId/items', {
      params: { orderId: id }, user: { id, role: 'cashier' }, body: { expectedVersion: 1, reason: 'Remove take-away tea',
        items: [{ id: itemId, quantity: 1, notes: 'Less sugar' }, { id: takeAwayId, quantity: 0, notes: 'To go' }] },
    })
    assert.equal(edited.status, 200)
    assert.equal(edited.body.order.orderType, 'dine_in')
    assert.equal(edited.body.order.grandTotal, 5)
    const ticket = (await client.query('SELECT order_type FROM orders WHERE id = $1', [id])).rows[0]
    assert.equal(ticket.order_type, 'dine_in')
    const revision = (await client.query("SELECT before_snapshot, after_snapshot FROM order_revisions WHERE reason = 'Remove take-away tea'")).rows[0]
    assert.equal(revision.before_snapshot.orderType, 'mixed')
    assert.equal(revision.before_snapshot.items.find((item) => item.id === takeAwayId).orderType, 'take_away')
    assert.equal(revision.after_snapshot.orderType, 'dine_in')
  } finally { await client.query('ROLLBACK'); await client.end() }
})
