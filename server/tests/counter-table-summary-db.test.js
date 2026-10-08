import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import dotenv from 'dotenv'
import pg from 'pg'

test('a cashier order appears on the shared table bill without becoming an active diner', { skip: process.env.DINEOS_DATABASE_TESTS !== '1' }, async () => {
  dotenv.config({ path: new URL('../.env', import.meta.url) })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  const query = source.split("app.get('/api/v1/public/table-summary'")[1].split('pool.query(`')[1].split('`, [request.customerSession.tableSessionId')[0]
  const visitId = '79e596a6-6dbf-40f2-8bb9-dd8dde684777'
  const qrId = '2469cbba-505f-458d-b178-1c99b0ff823f'
  const counterId = '1fab529e-b84e-408a-af81-5a1982e06c69'
  const leftId = 'cb914a72-d7ca-45ab-87a7-9b83fc1bca90'
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL search_path TO pg_temp, public')
    await client.query(`
      CREATE TEMP TABLE table_sessions (id uuid) ON COMMIT DROP;
      CREATE TEMP TABLE customer_sessions (id uuid PRIMARY KEY, table_session_id uuid, nickname text, joined_at timestamptz, left_at timestamptz, created_by_cashier boolean) ON COMMIT DROP;
      CREATE TEMP TABLE orders (id uuid, customer_session_id uuid, subtotal numeric, service_charge numeric, sst numeric, grand_total numeric, status text, payment_status text, created_at timestamptz, order_type text DEFAULT 'dine_in') ON COMMIT DROP;
    `)
    await client.query('INSERT INTO table_sessions VALUES ($1)', [visitId])
    await client.query(`INSERT INTO customer_sessions VALUES
      ($1,$4,'Guest',now(),NULL,false), ($2,$4,'Aiman',now(),now(),true), ($3,$4,'Former guest',now(),now(),false)`, [qrId, counterId, leftId, visitId])
    await client.query(`INSERT INTO orders VALUES
      (gen_random_uuid(),$1,10,1,0.60,11.60,'received','pending',now()),
      (gen_random_uuid(),$2,20,2,1.20,23.20,'received','pending',now()),
      (gen_random_uuid(),$3,99,9.90,5.94,114.84,'served','pending',now())`, [qrId, counterId, leftId])
    await client.query('ALTER TABLE orders ADD COLUMN paid_subtotal numeric DEFAULT 0, ADD COLUMN paid_service_charge numeric DEFAULT 0, ADD COLUMN paid_sst numeric DEFAULT 0, ADD COLUMN paid_amount numeric DEFAULT 0')
    const { rows } = await client.query(query, [visitId, qrId])
    assert.equal(rows.length, 2)
    assert.equal(rows.find((row) => row.id === counterId).isCounterOrder, true)
    assert.equal(rows.find((row) => row.id === counterId).grandTotal, '23.20')
    assert.equal(rows.find((row) => row.id === qrId).grandTotal, '11.60')
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
})

test('My Orders includes current-visit counter tickets but excludes other diners, tables and previous visits', { skip: process.env.DINEOS_DATABASE_TESTS !== '1' }, async () => {
  dotenv.config({ path: new URL('../.env', import.meta.url) })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  const query = source.split("app.get('/api/v1/public/orders'")[1].split('pool.query(`')[1].split('`, [request.customerSession.id')[0]
  const ids = Array.from({ length: 13 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`)
  const [table1, table2, visit, oldVisit, otherVisit, qr, counter, otherDiner, oldCounter, otherCounter] = ids
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL search_path TO pg_temp, public')
    await client.query(`
      CREATE TEMP TABLE restaurant_tables (id uuid, table_number int) ON COMMIT DROP;
      CREATE TEMP TABLE table_sessions (id uuid, table_id uuid) ON COMMIT DROP;
      CREATE TEMP TABLE customer_sessions (id uuid, table_session_id uuid, created_by_cashier boolean) ON COMMIT DROP;
      CREATE TEMP TABLE menu_items (id uuid, image_url text) ON COMMIT DROP;
      CREATE TEMP TABLE orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), table_session_id uuid, customer_session_id uuid,
        order_type text DEFAULT 'dine_in', table_order_number int, status text DEFAULT 'received', payment_status text DEFAULT 'pending',
        subtotal numeric DEFAULT 10, discount_amount numeric DEFAULT 0, service_charge_rate numeric DEFAULT 0, sst_rate numeric DEFAULT 0,
        service_charge numeric DEFAULT 0, sst numeric DEFAULT 0, grand_total numeric DEFAULT 10,
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()) ON COMMIT DROP;
      CREATE TEMP TABLE order_items (id uuid DEFAULT gen_random_uuid(), order_id uuid, menu_item_id uuid, item_name text,
        unit_price numeric, quantity int, selections jsonb, option_snapshot jsonb, notes text, order_type text DEFAULT 'dine_in') ON COMMIT DROP;
    `)
    await client.query('INSERT INTO restaurant_tables VALUES ($1,1),($2,2)', [table1, table2])
    await client.query('INSERT INTO table_sessions VALUES ($1,$4),($2,$4),($3,$5)', [visit, oldVisit, otherVisit, table1, table2])
    await client.query(`INSERT INTO customer_sessions VALUES ($1,$6,false),($2,$6,true),($3,$6,false),($4,$7,true),($5,$8,true)`, [qr, counter, otherDiner, oldCounter, otherCounter, visit, oldVisit, otherVisit])
    const created = await client.query(`INSERT INTO orders (table_session_id,customer_session_id,table_order_number,order_type,payment_status)
      VALUES ($1,$4,1,'dine_in','pending'),($1,$5,2,'take_away','paid'),($1,$6,3,'dine_in','pending'),
        ($2,$7,1,'dine_in','pending'),($3,$8,1,'take_away','pending') RETURNING id`, [visit, oldVisit, otherVisit, qr, counter, otherDiner, oldCounter, otherCounter])
    await client.query('INSERT INTO menu_items VALUES ($1,\'https://example.invalid/food.png\')', [ids[10]])
    await client.query(`INSERT INTO order_items (order_id,menu_item_id,item_name,unit_price,quantity,notes)
      VALUES ($1,$2,'Fried Mee',10,1,'Less spicy')`, [created.rows[1].id, ids[10]])
    await client.query('ALTER TABLE orders ADD COLUMN paid_amount numeric DEFAULT 0; ALTER TABLE order_items ADD COLUMN paid_quantity integer DEFAULT 0, ADD COLUMN fulfilled_quantity integer DEFAULT 0')
    const { rows } = await client.query(query, [qr, visit])
    assert.equal(rows.length, 2)
    assert.deepEqual(new Set(rows.map((row) => row.id)), new Set(created.rows.slice(0, 2).map((row) => row.id)))
    const ticket = rows.find((row) => row.isCounterOrder)
    assert.equal(ticket.customerSessionId, counter)
    assert.equal(ticket.isCurrentCustomer, false)
    assert.equal(ticket.tableNumber, 1)
    assert.equal(ticket.orderType, 'take_away')
    assert.equal(ticket.paymentStatus, 'paid')
    assert.equal(ticket.items[0].name, 'Fried Mee')
    assert.equal(ticket.items[0].notes, 'Less spicy')
    assert.equal(ticket.items[0].imageUrl, 'https://example.invalid/food.png')
    assert.equal(rows.find((row) => !row.isCounterOrder).isCurrentCustomer, true)
    const otherGuestOrders = (await client.query(query, [otherDiner, visit])).rows
    assert.equal(otherGuestOrders.length, 2)
    assert.equal(otherGuestOrders.some((row) => row.customerSessionId === qr), false)
  } finally { await client.query('ROLLBACK'); await client.end() }
})
