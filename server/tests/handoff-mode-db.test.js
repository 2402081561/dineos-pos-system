import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import pg from 'pg'

test('clear-table guard enforces payment and kitchen readiness in both handoff modes', { skip: process.env.DINEOS_DATABASE_TESTS !== '1' }, async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  const query = source.match(/const outstanding = await client\.query\("([^"]+)"/)[1]
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('CREATE TEMP TABLE orders (table_session_id text, status text, payment_status text) ON COMMIT DROP')
    await client.query("INSERT INTO orders VALUES ('visit', 'ready', 'paid')")
    assert.equal((await client.query(query, ['visit', true])).rowCount, 1)
    assert.equal((await client.query(query, ['visit', false])).rowCount, 0)
    await client.query("UPDATE orders SET payment_status = 'pending'")
    assert.equal((await client.query(query, ['visit', false])).rowCount, 1)
    await client.query("UPDATE orders SET payment_status = 'paid', status = 'preparing'")
    assert.equal((await client.query(query, ['visit', false])).rowCount, 1)
    await client.query("UPDATE orders SET status = 'served'")
    assert.equal((await client.query(query, ['visit', true])).rowCount, 0)
    await client.query("INSERT INTO orders VALUES ('visit', 'cancelled', 'pending')")
    assert.equal((await client.query(query, ['visit', false])).rowCount, 0)
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
})
