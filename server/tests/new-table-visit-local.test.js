import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import pg from 'pg'
import { prepareNewTableVisit } from '../src/newTableVisit.js'
import { loadStoreSettings } from '../src/shopSettings.js'
import { PosValidationError } from '../src/posRules.js'

test('local new-table confirmation: unpaid protection, concurrent scans, retry, history and old-session isolation', {
  skip: process.env.DINEOS_LOCAL_RECOVERY_TEST !== '1', timeout: 30000,
}, async () => {
  // New cluster only. No dotenv, no inherited PG variables/URLs, no hosted DB.
  const binary = '/opt/homebrew/opt/postgresql@17/bin'
  const directory = await mkdtemp(join(tmpdir(), 'dineos-new-table-'))
  const data = join(directory, 'cluster')
  let running = false, pool
  const run = (command, args) => {
    const result = spawnSync(join(binary, command), args, { encoding: 'utf8', timeout: 15000 })
    assert.equal(result.status, 0, result.stderr)
  }
  try {
    run('initdb', ['-D', data, '-U', 'isolated', '--encoding=UTF8', '--locale=C', '--auth-local=trust', '--auth-host=scram-sha-256'])
    run('pg_ctl', ['-D', data, '-o', `-k ${directory} -p 54339 -c listen_addresses=''`, '-l', join(directory, 'postgres.log'), '-w', 'start']); running = true
    pool = new pg.Pool({ connectionString: `postgresql://isolated@localhost:54339/postgres?host=${encodeURIComponent(directory)}` })
    await pool.query('CREATE ROLE anon; CREATE ROLE authenticated')
    const migrations = new URL('../db/', import.meta.url)
    for (const file of (await readdir(migrations)).filter(file => /^\d{3}.*\.sql$/.test(file) && (Number(file.slice(0, 3)) <= 31 || (Number(file.slice(0, 3)) >= 34 && Number(file.slice(0, 3)) <= 37))).sort()) await pool.query(await readFile(new URL(file, migrations), 'utf8'))
    await pool.query('INSERT INTO restaurant_tables(table_number,capacity) VALUES(1,4)')
    const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
    let handler
    const start = source.indexOf("app.post('/api/v1/public/tables/:tableNumber/join'")
    runInNewContext(source.slice(start, source.indexOf("app.get('/api/v1/public/customer-session'", start)), {
      app: { post(_path, callback) { handler = callback } }, pool, prepareNewTableVisit, loadStoreSettings, PosValidationError,
      positiveInteger: value => /^[1-9]\d*$/.test(String(value)) ? Number(value) : null,
    })
    async function request(body = {}) {
      let status, result
      await handler({ params: { tableNumber: '1' }, body }, { status(value) { status = value; return this }, json(value) { result = value } }, error => { throw error })
      return { status, ...result }
    }
    const old = (await request()).session
    const customerId = (await pool.query('SELECT id FROM customer_sessions WHERE access_token=$1', [old.sessionId])).rows[0].id
    const order = (await pool.query('INSERT INTO orders(table_session_id,customer_session_id,subtotal,grand_total) VALUES($1,$2,9,9) RETURNING id', [old.tableSessionId, customerId])).rows[0]
    const confirmation = { expectedTableSessionId: old.tableSessionId, newTableSessionId: randomUUID() }
    assert.equal((await request(confirmation)).status, 409, 'Unpaid / split bill cannot start a new table')
    assert.equal((await request()).session.tableSessionId, old.tableSessionId, 'Current unpaid party can still join')
    await pool.query("UPDATE orders SET payment_status='paid',paid_amount=9,paid_subtotal=9,status='preparing' WHERE id=$1", [order.id])
    assert.equal((await request(confirmation)).status, 409, 'Paid but undelivered is not finished')
    await pool.query("UPDATE orders SET status='served' WHERE id=$1", [order.id])
    const second = (await pool.query("INSERT INTO orders(table_session_id,customer_session_id,subtotal,grand_total,status,paid_amount,paid_subtotal) VALUES($1,$2,9,9,'served',4.5,4.5) RETURNING id", [old.tableSessionId, customerId])).rows[0]
    assert.equal((await request(confirmation)).status, 409, 'Another partly paid order blocks rollover even when the first order is paid')
    await pool.query("UPDATE orders SET payment_status='paid',paid_amount=9,paid_subtotal=9 WHERE id=$1", [second.id])
    const before = await request()
    assert.equal(before.status, 409); assert.equal(before.newTableRequired, true)
    assert.equal(before.expectedTableSessionId, old.tableSessionId)
    // A new order after the confirmation screen was shown must be rechecked.
    await pool.query("UPDATE orders SET payment_status='pending',paid_amount=4.5,paid_subtotal=4.5 WHERE id=$1", [second.id])
    assert.equal((await request(confirmation)).status, 409)
    await pool.query("UPDATE orders SET payment_status='paid',paid_amount=9,paid_subtotal=9 WHERE id=$1", [second.id])
    assert.equal((await pool.query('SELECT status FROM table_sessions WHERE id=$1', [old.tableSessionId])).rows[0].status, 'active', 'Merely scanning never ends old visit')
    const [one, retry] = await Promise.all([request(confirmation), request(confirmation)])
    assert.equal(one.status, 201); assert.equal(retry.status, 201)
    assert.equal(one.session.sessionId, retry.session.sessionId, 'Concurrent same request has one shared customer')
    assert.equal(one.session.tableSessionId, confirmation.newTableSessionId)
    assert.notEqual(one.session.sessionId, old.sessionId)
    const competitor = await request({ ...confirmation, newTableSessionId: randomUUID() })
    assert.equal(competitor.status, 409, 'Stale different confirmation cannot close the new group')
    assert.equal((await request()).session.tableSessionId, confirmation.newTableSessionId, 'Other new guests join the one new visit')
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM table_sessions WHERE table_id IS NOT NULL AND status='active'")).rows[0].n, 1)
    assert.ok((await pool.query('SELECT left_at FROM customer_sessions WHERE access_token=$1', [old.sessionId])).rows[0].left_at)
    assert.equal((await pool.query('SELECT table_session_id FROM orders WHERE id=$1', [order.id])).rows[0].table_session_id, old.tableSessionId, 'Old orders never move into new bill')
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM orders WHERE table_session_id=$1', [confirmation.newTableSessionId])).rows[0].n, 0)
    assert.equal((await request({ newTableSessionId: randomUUID() })).status, 400)
    console.info('Local-only actual join handler: explicit rollover and concurrent/replayed confirmation passed; no production access.')
  } finally {
    if (pool) await pool.end()
    if (running) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
  }
})
