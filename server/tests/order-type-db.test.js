import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import dotenv from 'dotenv'
import pg from 'pg'
import { validateOrderType, resolveItemOrderTypes, summarizeOrderType } from '../src/orderType.js'
import { PosValidationError } from '../src/posRules.js'
import { buildCounterOrder } from '../src/counterOrder.js'
import { takeAwayQueueSql } from '../src/takeAwayOrders.js'

const enabled = process.env.DINEOS_DATABASE_TESTS === '1'
const id = '11111111-1111-4111-8111-111111111111'
const itemId = '22222222-2222-4222-8222-222222222222'
async function connect() {
  dotenv.config({ path: new URL('../.env', import.meta.url) })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  return client
}

test('take-away migration and actual insertion/queue execute in connection-local temporary tables only', { skip: !enabled }, async () => {
  const client = await connect()
  try {
    await client.query('SET search_path TO pg_temp, public')
    await client.query(`CREATE TEMP TABLE orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), table_session_id uuid, customer_session_id uuid, member_id uuid, status text, payment_status text,
      subtotal numeric, service_charge numeric, sst numeric, grand_total numeric, client_request_id uuid UNIQUE, service_charge_rate numeric, sst_rate numeric, is_addition boolean,
      table_order_number text DEFAULT 'T1-TEST', order_number text DEFAULT 'TEST', created_at timestamptz DEFAULT now());
      CREATE TEMP TABLE order_items (id uuid DEFAULT gen_random_uuid(), order_id uuid, menu_item_id uuid, item_name text, unit_price numeric, quantity int, notes text, selections jsonb, option_snapshot jsonb, fulfilled_quantity integer DEFAULT 0);
      CREATE TEMP TABLE menu_items (id uuid, category_id uuid, name text, price numeric, option_groups jsonb DEFAULT '[]', is_available boolean);
      CREATE TEMP TABLE categories (id uuid, is_enabled boolean);
      CREATE TEMP TABLE restaurant_tables (id uuid, table_number int);
      CREATE TEMP TABLE table_sessions (id uuid, table_id uuid, status text);
      CREATE TEMP TABLE customer_sessions (id uuid, nickname text);`)
    await client.query("INSERT INTO orders (grand_total, status) VALUES (20, 'served')")
    const migration = await readFile(new URL('../db/023_take_away_order_type.sql', import.meta.url), 'utf8')
    await client.query(migration)
    await client.query(await readFile(new URL('../db/024_item_order_types.sql', import.meta.url), 'utf8'))
    // Run the compatibility trigger only in this connection's temporary schema.
    await client.query((await readFile(new URL('../db/025_legacy_item_order_type_default.sql', import.meta.url), 'utf8')).replaceAll('public.', 'pg_temp.'))
    const old = (await client.query('SELECT order_type, grand_total FROM orders')).rows[0]
    assert.equal(old.order_type, 'dine_in')
    assert.equal(Number(old.grand_total), 20)
    await assert.rejects(client.query("INSERT INTO orders (order_type) VALUES ('invalid')"), (error) => error.code === '23514')
    await client.query('INSERT INTO menu_items (id, name, price, is_available) VALUES ($1, $2, 5, true)', [itemId, 'Tea'])
    await client.query('INSERT INTO restaurant_tables VALUES ($1, 1)', [id])
    await client.query("INSERT INTO table_sessions VALUES ($1, $1, 'active')", [id])
    await client.query("INSERT INTO customer_sessions VALUES ($1, 'Test guest')", [id])
    const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
    const insertSource = source.slice(source.indexOf('async function insertPreparedOrder'), source.indexOf('registerTakeAwayRoutes(app,'))
    const insert = runInNewContext(insertSource + '; insertPreparedOrder', { validateOrderType, resolveItemOrderTypes, summarizeOrderType, PosValidationError, buildCounterOrder, loadStoreSettings: async () => ({ config: { serviceChargeRate: 10, sstRate: 6 }, revision: 1, isAcceptingOrders: true }) })
    const cartItems = [{ menuItemId: itemId, quantity: 2, notes: 'Less sweet' }]
    for (const [index, orderType] of ['dine_in', 'take_away'].entries()) {
      const result = await insert(client, { tableSessionId: id, customerSessionId: id, requestId: index ? itemId : id, orderType, cartItems })
      assert.equal(result.rows[0].orderType, orderType)
      assert.equal(Number(result.rows[0].grandTotal), 11.6)
    }
    let queue = (await client.query(takeAwayQueueSql)).rows
    assert.equal(queue.length, 1)
    assert.equal(queue[0].orderType, 'take_away')
    assert.equal(queue[0].items[0].notes, 'Less sweet')
    const legacyTicket = (await client.query("INSERT INTO orders (order_type, status) VALUES ('take_away', 'served') RETURNING id")).rows[0]
    const legacyItem = (await client.query("INSERT INTO order_items (order_id, item_name, quantity) VALUES ($1, 'Old client tea', 1) RETURNING order_type", [legacyTicket.id])).rows[0]
    assert.equal(legacyItem.order_type, 'take_away')
    await client.query("UPDATE orders SET status = 'ready' WHERE order_type = 'take_away'")
    assert.equal((await client.query(takeAwayQueueSql)).rows[0].status, 'ready')
    await client.query("UPDATE orders SET status = 'served' WHERE order_type = 'take_away'")
    assert.equal((await client.query(takeAwayQueueSql)).rows.length, 0)
    await client.query("UPDATE table_sessions SET status = 'active'")
    const mixed = await insert(client, { tableSessionId: id, customerSessionId: id, requestId: '33333333-3333-4333-8333-333333333333', cartItems: [
      { menuItemId: itemId, quantity: 1, notes: 'At table', orderType: 'dine_in' },
      { menuItemId: itemId, quantity: 1, notes: 'Pack separately', orderType: 'take_away' },
    ] })
    assert.equal(mixed.rows[0].orderType, 'mixed')
    assert.equal(Number(mixed.rows[0].grandTotal), 11.6)
    const mixedItems = (await client.query('SELECT quantity, order_type, notes FROM order_items WHERE order_id = $1 ORDER BY order_type', [mixed.rows[0].id])).rows
    assert.deepEqual(mixedItems.map((item) => item.order_type), ['dine_in', 'take_away'])
    assert.equal(mixedItems.reduce((sum, item) => sum + item.quantity, 0), 2)
    queue = (await client.query(takeAwayQueueSql)).rows
    const packingTicket = queue.find((ticket) => ticket.id === mixed.rows[0].id)
    assert.equal(packingTicket.items.length, 1)
    assert.equal(packingTicket.items[0].orderType, 'take_away')
    assert.equal(packingTicket.items[0].notes, 'Pack separately')
    await client.query("UPDATE orders SET status = 'received' WHERE order_type = 'take_away'")
    await client.query("UPDATE table_sessions SET status = 'completed'")
    assert.equal((await client.query(takeAwayQueueSql)).rows.length, 0)
  } finally { await client.end() }
})

test('all updated customer/staff/admin/cashier read projections work against the real schema read-only', { skip: !enabled }, async () => {
  const client = await connect()
  try {
    await client.query('BEGIN READ ONLY')
    const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
    for (const [start, end, params] of [
      ["app.get('/api/v1/public/orders'", "app.patch('/api/v1/public/orders", [id, id]],
      ["app.get('/api/v1/public/table-summary'", "app.get('/api/v1/kitchen/orders'", [id, id]],
      ["app.get('/api/v1/cashier/pending-orders'", "app.get('/api/v1/cashier/order-setup'", []],
      ["app.get('/api/v1/admin/orders'", "app.get('/api/v1/admin/dashboard'", []],
    ]) {
      const offset = source.indexOf(start)
      const section = source.slice(offset, source.indexOf('\n})', offset) + 3)
      assert.ok(end)
      const queries = [...section.matchAll(/pool\.query\(`([\s\S]*?)`/g)]
      assert.ok(queries.length, start)
      for (const [, sql] of queries) await client.query(sql, params)
    }
    await client.query(takeAwayQueueSql)
  } finally { await client.query('ROLLBACK'); await client.end() }
})
