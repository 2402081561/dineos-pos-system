import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import pg from 'pg'
import express from 'express'
import { createDatabasePool, apiErrorHandler } from '../src/databaseConnection.js'

// Opt-in only. NEVER reads .env or DATABASE_URL and NEVER touches an existing
// cluster. Requires installed PostgreSQL binaries; creates a private empty DB.
test('real local PostgreSQL: idle/active disconnects and server outage recover without restarting the HTTP API', { skip: process.env.DINEOS_LOCAL_RECOVERY_TEST !== '1', timeout: 60000 }, async () => {
  const binary = process.env.DINEOS_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const directory = mkdtempSync(join(tmpdir(), 'dineos-network-'))
  const data = join(directory, 'cluster'), logs = [], originalPid = process.pid
  const run = (command, args) => {
    const result = spawnSync(join(binary, command), args, { encoding: 'utf8', timeout: 20000 })
    assert.equal(result.status, 0, `${command} failed: ${result.stderr}`)
  }
  run('initdb', ['-D', data, '-U', 'recovery_test', '--encoding=UTF8', '--locale=C', '--auth-local=trust', '--auth-host=scram-sha-256'])
  let running = false, pool, admin, server
  const start = () => { run('pg_ctl', ['-D', data, '-o', `-k ${directory} -p 54331 -c listen_addresses=''`, '-l', join(directory, 'postgres.log'), '-w', 'start']); running = true }
  const stop = () => { run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); running = false }
  const connectionString = `postgresql://recovery_test@localhost:54331/postgres?host=${encodeURIComponent(directory)}`
  try {
    start()
    pool = createDatabasePool(pg.Pool, connectionString, { error: (message) => logs.push(message) })
    admin = new pg.Client({ connectionString }); await admin.connect()
    const { rows } = await pool.query('SELECT pg_backend_pid() AS pid')
    const idleLost = once(pool, 'error')
    await admin.query('SELECT pg_terminate_backend($1)', [rows[0].pid])
    await idleLost
    assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok, 1)

    const client = await pool.connect()
    const activePid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const interrupted = assert.rejects(client.query('SELECT pg_sleep(30)'), (error) => error.code === '57P01' || /terminated/.test(error.message))
    await admin.query('SELECT pg_terminate_backend($1)', [activePid])
    await interrupted; client.release(true)
    assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok, 1)
    await admin.end(); admin = null

    const app = express()
    app.get('/health', async (_request, response, next) => { try { await pool.query('SELECT 1'); response.json({ status: 'ok' }) } catch (error) { next(error) } })
    app.use(apiErrorHandler)
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
    const url = `http://127.0.0.1:${server.address().port}/health`
    assert.equal((await fetch(url)).status, 200)
    // Release idle sockets before deliberately stopping this isolated DB.
    const disconnected = once(pool, 'error')
    stop(); await disconnected
    assert.equal((await fetch(url)).status, 503)
    start()
    assert.equal((await fetch(url)).status, 200)
    assert.equal(server.listening, true)
    assert.equal(process.pid, originalPid)
    assert.ok(logs.some((message) => message.includes('connection lost')))
    console.info('Local-only PostgreSQL outage rehearsal passed; API PID unchanged; temporary cluster stopped in cleanup.')
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (admin) await admin.end().catch(() => {})
    if (pool) await pool.end()
    if (running) stop()
  }
})
