import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import dotenv from 'dotenv'
import pg from 'pg'

test('cashier setup reads enabled tables and current menu without changing data', { skip: process.env.DINEOS_DATABASE_TESTS !== '1' }, async () => {
  dotenv.config({ path: new URL('../.env', import.meta.url) })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  const route = source.split("app.get('/api/v1/cashier/order-setup'")[1].split("app.post('/api/v1/cashier/orders'")[0]
  const queries = route.split('pool.query(`').slice(1).map((part) => part.split('`)')[0])
  assert.equal(queries.length, 2)
  await client.connect()
  try {
    await client.query('BEGIN READ ONLY')
    const [tables, items] = await Promise.all(queries.map((query) => client.query(query)))
    assert.ok(Array.isArray(tables.rows))
    assert.ok(Array.isArray(items.rows))
    assert.ok(tables.rows.every((table) => Number.isInteger(table.tableNumber) && table.tableNumber > 0))
    assert.ok(items.rows.every((item) => typeof item.name === 'string'))
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
})
