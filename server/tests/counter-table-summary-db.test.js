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
      CREATE TEMP TABLE orders (id uuid, customer_session_id uuid, subtotal numeric, service_charge numeric, sst numeric, grand_total numeric, status text, payment_status text, created_at timestamptz) ON COMMIT DROP;
    `)
    await client.query('INSERT INTO table_sessions VALUES ($1)', [visitId])
    await client.query(`INSERT INTO customer_sessions VALUES
      ($1,$4,'Guest',now(),NULL,false), ($2,$4,'Aiman',now(),now(),true), ($3,$4,'Former guest',now(),now(),false)`, [qrId, counterId, leftId, visitId])
    await client.query(`INSERT INTO orders VALUES
      (gen_random_uuid(),$1,10,1,0.60,11.60,'received','pending',now()),
      (gen_random_uuid(),$2,20,2,1.20,23.20,'received','pending',now()),
      (gen_random_uuid(),$3,99,9.90,5.94,114.84,'served','pending',now())`, [qrId, counterId, leftId])
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
