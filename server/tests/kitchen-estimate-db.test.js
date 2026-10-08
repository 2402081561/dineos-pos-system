import assert from 'node:assert/strict'
import test from 'node:test'
import dotenv from 'dotenv'
import pg from 'pg'
import { loadKitchenEstimates } from '../src/kitchenEstimate.js'

test('actual SQL sums remaining portions across active visits, ignores closed visits and terminal orders', { skip: process.env.DINEOS_DATABASE_TESTS !== '1' }, async () => {
  dotenv.config({ path: new URL('../.env', import.meta.url) })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL search_path TO pg_temp, public')
    await client.query(`
      CREATE TEMP TABLE shop_settings (id integer, config jsonb) ON COMMIT DROP;
      CREATE TEMP TABLE table_sessions (id text, status text) ON COMMIT DROP;
      CREATE TEMP TABLE orders (id text, table_session_id text, status text, created_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE order_items (order_id text, quantity integer, fulfilled_quantity integer) ON COMMIT DROP;
      INSERT INTO shop_settings VALUES (1, '{}');
      INSERT INTO table_sessions VALUES ('s1','active'), ('s2','active'), ('old','completed');
      INSERT INTO orders VALUES ('preparing','s1','preparing','2026-10-08T01:00Z'), ('waiting','s2','received','2026-10-08T01:01Z'),
        ('ready','s1','ready',now()), ('cancelled','s1','cancelled',now()), ('closed','old','received',now());
      INSERT INTO order_items VALUES ('preparing',4,1), ('waiting',1,0), ('ready',50,0), ('cancelled',50,0), ('closed',50,0);
    `)
    const result = await loadKitchenEstimates(client)
    assert.equal(result.byOrder.get('waiting').label, '6–8 mins')
    assert.equal(result.byOrder.size, 1)
    assert.equal(result.preview.label, '6–8 mins')
    await client.query("UPDATE orders SET status = 'ready' WHERE id = 'preparing'")
    assert.equal((await loadKitchenEstimates(client)).byOrder.get('waiting').label, '3–4 mins')
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
})
