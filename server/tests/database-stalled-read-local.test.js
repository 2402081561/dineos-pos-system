import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import express from 'express'
import pg from 'pg'
import { createDatabasePool, apiErrorHandler, boundedDatabaseRead } from '../src/databaseConnection.js'
import { createAuthenticatedUserMiddleware } from '../src/authentication.js'

// A brand-new Unix-socket cluster and loopback TCP fault proxy only. Never
// load dotenv, DATABASE_URL, production credentials or an existing database.
test('staff identity bounds a silently stalled established DB socket and reconnects without restarting', {
  skip: process.env.DINEOS_LOCAL_RECOVERY_TEST !== '1', timeout: 35000,
}, async () => {
  const binary = '/opt/homebrew/opt/postgresql@17/bin'
  const directory = mkdtempSync(join(tmpdir(), 'dineos-stalled-read-'))
  const data = join(directory, 'cluster'), sockets = new Set()
  let running = false, proxy, pool, server, dropReplies = false
  const run = (command, args) => {
    const result = spawnSync(join(binary, command), args, { encoding: 'utf8', timeout: 15000 })
    assert.equal(result.status, 0, result.stderr)
  }
  try {
    run('initdb', ['-D', data, '-U', 'isolated', '--encoding=UTF8', '--locale=C', '--auth-local=trust', '--auth-host=scram-sha-256'])
    run('pg_ctl', ['-D', data, '-o', `-k ${directory} -p 54337 -c listen_addresses=''`, '-l', join(directory, 'postgres.log'), '-w', 'start'])
    running = true
    proxy = net.createServer((downstream) => {
      const upstream = net.connect(join(directory, '.s.PGSQL.54337'))
      for (const socket of [downstream, upstream]) {
        sockets.add(socket)
        socket.on('error', () => {})
        socket.on('close', () => { sockets.delete(socket); downstream.destroy(); upstream.destroy() })
      }
      downstream.on('data', (chunk) => upstream.write(chunk))
      upstream.on('data', (chunk) => { if (!dropReplies) downstream.write(chunk) })
    })
    proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening')
    pool = createDatabasePool(pg.Pool, `postgresql://isolated@127.0.0.1:${proxy.address().port}/postgres`, { error() {} })
    await pool.query('CREATE TABLE users(id text, email text, display_name text, role text, auth_user_id text)')
    await pool.query("INSERT INTO users VALUES('synthetic','test@example.invalid','Local only','cashier','local-sub')")
    const app = express()
    app.get('/livez', (_req, res) => res.json({ status: 'ok' }))
    app.get('/health', async (_req, res, next) => {
      try { await boundedDatabaseRead(pool, 'SELECT 1'); res.json({ status: 'ok' }) }
      catch (error) { next(error) }
    })
    app.get('/api/v1/me', createAuthenticatedUserMiddleware({ verifyToken: async () => ({ sub: 'local-sub' }), pool }), (req, res) => res.json({ user: req.user }))
    app.use(apiErrorHandler)
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
    const base = `http://127.0.0.1:${server.address().port}`
    const read = () => fetch(base + '/api/v1/me', { headers: { authorization: 'Bearer synthetic-local-only' }, signal: AbortSignal.timeout(13000) })
    assert.equal((await read()).status, 200)
    // TCP stays connected and the query reaches PostgreSQL, but replies vanish.
    // connectionTimeoutMillis and browser-side cancellation cannot bound it.
    dropReplies = true
    const started = Date.now()
    const stalled = read()
    assert.equal((await fetch(base + '/livez')).status, 200)
    const failed = await stalled
    assert.equal(failed.status, 503)
    assert.ok(Date.now() - started < 12500)
    assert.equal(pool.totalCount, 0, 'Timed-out client must be removed, not reused')
    dropReplies = false
    const recovered = await read()
    assert.equal(recovered.status, 200)
    assert.equal((await recovered.json()).user.id, 'synthetic')
    // Health uses the same bounded read without imposing timeouts on writes.
    dropReplies = true
    const health = fetch(base + '/health', { signal: AbortSignal.timeout(13000) })
    assert.equal((await fetch(base + '/livez')).status, 200)
    assert.equal((await health).status, 503)
    assert.equal(pool.totalCount, 0)
    dropReplies = false
    assert.equal((await fetch(base + '/health')).status, 200)
    assert.equal(server.listening, true)
    console.info('Silent established-socket loss: bounded identity read, broken-client discard and same-process recovery passed.')
  } finally {
    for (const socket of sockets) socket.destroy()
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    if (pool) await pool.end()
    if (proxy) await new Promise(resolve => proxy.close(resolve))
    if (running) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
  }
})
