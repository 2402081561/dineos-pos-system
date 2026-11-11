import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import dotenv from 'dotenv'
import pg from 'pg'

test('cashier sales use payment amounts and Malaysian day boundaries, including zero-value bills', { skip: process.env.DINEOS_DATABASE_TESTS !== '1' }, async () => {
  dotenv.config({ path: new URL('../.env', import.meta.url) })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  const query = source.match(/SELECT COALESCE\(sum\(amount\), 0\)::double precision AS sales,[\s\S]*?FROM payments[\s\S]*?(?=`)/)?.[0]
  assert.ok(query, 'Cashier summary SELECT must remain available for validation')
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL search_path TO pg_temp, public')
    await client.query('CREATE TEMP TABLE payments (amount numeric, payment_method text, paid_at timestamptz) ON COMMIT DROP')
    assert.deepEqual((await client.query(query)).rows[0], { sales: 0, transactions: 0, averageBill: 0, cash: 0, nonCash: 0 })
    await client.query(`INSERT INTO payments SELECT amount, method,
      (date_trunc('day', now() AT TIME ZONE 'Asia/Kuching') AT TIME ZONE 'Asia/Kuching') + delta
      FROM (VALUES (10,'Cash',interval '0 seconds'), (20,'Credit/Debit Card',interval '12 hours'),
        (0,'Cash',interval '23 hours'), (999,'Cash',interval '-1 second'), (999,'Cash',interval '1 day')) AS cases(amount, method, delta)`)
    assert.deepEqual((await client.query(query)).rows[0], { sales: 30, transactions: 3, averageBill: 10, cash: 10, nonCash: 20 })
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
})
