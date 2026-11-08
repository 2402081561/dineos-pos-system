import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import dotenv from 'dotenv'
import pg from 'pg'

test('PostgreSQL floor summary separates served bills from all unpaid orders and ignores previous visits', { skip: process.env.DINEOS_DATABASE_TESTS !== '1' }, async () => {
  dotenv.config({ path: new URL('../.env', import.meta.url) })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  const query = source.split('const { rows: floorTables } = await pool.query(`')[1].split('`)')[0]
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL search_path TO pg_temp, public')
    // Temporary tables shadow production names for this connection only.
    await client.query(`
      CREATE TEMP TABLE restaurant_tables (id text, table_number int, capacity int DEFAULT 4, floor_x int, floor_y int, floor_zone text DEFAULT 'Main hall', floor_style jsonb DEFAULT '{"shape":"square","size":"medium","orientation":"horizontal"}', floor_point jsonb, is_enabled bool DEFAULT true) ON COMMIT DROP;
      CREATE TEMP TABLE table_sessions (id text, table_id text, status text, created_at timestamptz DEFAULT now()) ON COMMIT DROP;
      CREATE TEMP TABLE customer_sessions (table_session_id text, left_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE shop_settings (id int, config jsonb) ON COMMIT DROP;
      INSERT INTO shop_settings VALUES (1, '{}');
      CREATE TEMP TABLE orders (table_session_id text, grand_total numeric, status text, payment_status text, paid_amount numeric DEFAULT 0) ON COMMIT DROP;
      INSERT INTO restaurant_tables (id, table_number) VALUES ('t1',1), ('t2',2), ('t3',3), ('t4',4), ('t5',5);
      INSERT INTO table_sessions (id, table_id, status) VALUES ('s1','t1','active'), ('old','t1','completed'), ('s3','t3','active'), ('s4','t4','active'), ('s5','t5','active');
      INSERT INTO customer_sessions VALUES ('s1',NULL), ('s1',now());
      INSERT INTO orders VALUES ('s1',20,'preparing','pending'), ('s1',10,'served','pending'), ('s1',90,'cancelled','pending'), ('s1',5,'served','paid'),
        ('old',999,'served','pending'), ('s3',0,'served','pending'), ('s4',10,'served','paid'), ('s5',10,'cancelled','pending');
    `)
    await client.query(`UPDATE restaurant_tables SET floor_style = '{"shape":"round","size":"large","orientation":"horizontal"}' WHERE id = 't1'`)
    await client.query(`UPDATE restaurant_tables SET floor_point = '{"x":120,"y":200}' WHERE id = 't1'`)
    const { rows } = await client.query(query)
    const mixed = rows.find((row) => row.id === 't1')
    assert.deepEqual(mixed.floorStyle, { shape: 'round', size: 'large', orientation: 'horizontal' })
    assert.deepEqual(mixed.floorPoint, { x: 120, y: 200 })
    assert.equal(mixed.unpaidTotal, 30)
    assert.equal(mixed.payableTotal, 30)
    assert.equal(mixed.paidOrderCount, 1)
    assert.equal(mixed.unpaidOrderCount, 2)
    assert.equal(mixed.participantCount, 1)
    assert.deepEqual(mixed.orderCounts, { received: 0, preparing: 1, ready: 0, served: 2, cancelled: 1 })
    assert.equal(mixed.status, 'ordering')
    assert.equal(rows.find((row) => row.id === 't2').status, 'available')
    assert.equal(rows.find((row) => row.id === 't2').unpaidTotal, 0)
    assert.equal(rows.find((row) => row.id === 't3').status, 'awaiting_payment')
    assert.equal(rows.find((row) => row.id === 't4').status, 'ready_to_clear')
    assert.notEqual(rows.find((row) => row.id === 't5').status, 'ready_to_clear')
    await client.query("INSERT INTO orders VALUES ('s5',10,'ready','paid')")
    assert.notEqual((await client.query(query)).rows.find((row) => row.id === 't5').status, 'ready_to_clear')
    await client.query("UPDATE shop_settings SET config = '{\"requireHandoffConfirmation\":false}' WHERE id = 1")
    assert.equal((await client.query(query)).rows.find((row) => row.id === 't5').status, 'ready_to_clear')
    await client.query("INSERT INTO orders VALUES ('s5',5,'preparing','paid')")
    assert.notEqual((await client.query(query)).rows.find((row) => row.id === 't5').status, 'ready_to_clear')
    await client.query("UPDATE orders SET status = 'ready', payment_status = 'pending' WHERE table_session_id = 's5' AND grand_total = 5")
    assert.notEqual((await client.query(query)).rows.find((row) => row.id === 't5').status, 'ready_to_clear')
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
})
