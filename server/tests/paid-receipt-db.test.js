import assert from 'node:assert/strict'
import test from 'node:test'
import dotenv from 'dotenv'
import pg from 'pg'
import { paidReceiptCondition } from '../src/paidReceipt.js'

test('receipts require a completed payment and only paid linked orders', { skip: process.env.DINEOS_DATABASE_TESTS !== '1' }, async () => {
  dotenv.config({ path: new URL('../.env', import.meta.url) })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL search_path TO pg_temp, public')
    await client.query(`
      CREATE TEMP TABLE payments (receipt_number text, paid_at timestamptz, order_snapshot jsonb) ON COMMIT DROP;
      CREATE TEMP TABLE orders (receipt_number text, payment_status text) ON COMMIT DROP;
      INSERT INTO payments VALUES ('paid',now()), ('pending',now()), ('mixed',now()), ('missing-time',NULL), ('orphan',now()), ('unknown',now());
      INSERT INTO orders VALUES ('paid','paid'), ('paid','paid'), ('pending','pending'), ('mixed','paid'), ('mixed','pending'), ('missing-time','paid'), ('unknown','paid'), ('unknown',NULL);
    `)
    const { rows } = await client.query(`SELECT receipt_number FROM payments WHERE ${paidReceiptCondition}`)
    assert.deepEqual(rows, [{ receipt_number: 'paid' }])
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
})
