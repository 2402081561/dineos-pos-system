import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readdir, readFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import net from 'node:net'
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto'
import pg from 'pg'

// Explicit opt-in: synthetic data in a new private Unix-socket PostgreSQL
// cluster. Never load .env, use DATABASE_URL, or contact a hosted service.
test('old and released API: upgraded schema, staff verification, idle and DB recovery', {
  skip: process.env.DINEOS_RELEASE_COMPARISON !== '1', timeout: 120000,
}, async () => {
  const root = resolve(import.meta.dirname, '../..')
  const directory = await mkdtemp(join(tmpdir(), 'dineos-release-'))
  const binary = '/opt/homebrew/opt/postgresql@17/bin'
  const data = join(directory, 'cluster')
  const pgPort = 54335
  const baseConnection = `postgresql://comparison@localhost:${pgPort}/postgres?host=${encodeURIComponent(directory)}`
  function run(command, args, options = {}) {
    const result = spawnSync(command, args, { cwd: root, timeout: 20000, ...options })
    assert.equal(result.status, 0, `${command} failed: ${result.stderr?.toString()}`)
    return result.stdout
  }
  run(join(binary, 'initdb'), ['-D', data, '-U', 'comparison', '--encoding=UTF8', '--locale=C', '--auth-local=trust', '--auth-host=scram-sha-256'])
  let dbRunning = false, admin, child, jwksServer
  const startDb = () => {
    run(join(binary, 'pg_ctl'), ['-D', data, '-o', `-k ${directory} -p ${pgPort} -c listen_addresses=''`, '-l', join(directory, 'postgres.log'), '-w', 'start'])
    dbRunning = true
  }
  const stopDb = () => { run(join(binary, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']); dbRunning = false }
  async function stopChild() {
    if (!child || child.exitCode !== null) return
    const ended = once(child, 'exit')
    child.kill('SIGTERM')
    const force = setTimeout(() => child?.kill('SIGKILL'), 5000)
    try { await ended } finally { clearTimeout(force) }
    child = null
  }
  async function freePort() {
    const socket = net.createServer()
    socket.listen(0, '127.0.0.1'); await once(socket, 'listening')
    const port = socket.address().port
    await new Promise(resolve => socket.close(resolve))
    return port
  }
  try {
    startDb()
    admin = new pg.Client({ connectionString: baseConnection }); await admin.connect()
    await admin.query('CREATE ROLE anon; CREATE ROLE authenticated')
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const kid = 'local-comparison-only'
    const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'EdDSA', use: 'sig' }
    jwksServer = http.createServer((_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ keys: [publicJwk] }))
    })
    jwksServer.listen(0, '127.0.0.1'); await once(jwksServer, 'listening')
    const issuer = `http://127.0.0.1:${jwksServer.address().port}`
    const actorId = randomUUID()
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const unsigned = `${encode({ alg: 'EdDSA', kid })}.${encode({ sub: actorId, iss: issuer + '/auth/v1', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 })}`
    const token = unsigned + '.' + sign(null, Buffer.from(unsigned), privateKey).toString('base64url')
    const revisions = ['072a9b9', 'f9595fd', 'ed373ca']
    for (const [number, revision] of revisions.entries()) {
      const workspace = join(directory, revision)
      await mkdir(workspace)
      const archive = run('git', ['archive', revision, 'server'], { maxBuffer: 8 * 1024 * 1024 })
      run('tar', ['-x', '-C', workspace], { input: archive })
      await symlink(join(root, 'server/node_modules'), join(workspace, 'server/node_modules'))
      const database = `comparison_${number}`
      await admin.query(`CREATE DATABASE ${database}`)
      const dbUrl = baseConnection.replace('/postgres?', `/${database}?`)
      const fixture = new pg.Client({ connectionString: dbUrl }); await fixture.connect()
      try {
        const migrations = join(root, 'server/db')
        for (const file of (await readdir(migrations)).filter(file => /^\d{3}.*\.sql$/.test(file) && (Number(file.slice(0, 3)) <= 31 || (Number(file.slice(0, 3)) >= 34 && Number(file.slice(0, 3)) <= 37))).sort()) {
          await fixture.query(await readFile(join(migrations, file), 'utf8'))
        }
        await fixture.query("INSERT INTO users(email,display_name,role,auth_user_id) VALUES('test@example.invalid','Synthetic admin','admin',$1)", [actorId])
      } finally { await fixture.end() }
      const port = await freePort(), base = `http://127.0.0.1:${port}`
      const logs = []
      child = spawn(process.execPath, ['src/index.js'], {
        cwd: join(workspace, 'server'),
        env: { PATH: process.env.PATH, NODE_ENV: 'production', PORT: String(port), DATABASE_URL: dbUrl, SUPABASE_URL: issuer,
          CLIENT_ORIGINS: 'https://dine-os.netlify.app', ORDER_PUSH_ENABLED: 'false', MEMBER_EMAIL_OTP_ENABLED: 'false', MEMBER_WELCOME_EMAIL_ENABLED: 'false' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      child.stdout.on('data', value => logs.push(value.toString()))
      child.stderr.on('data', value => logs.push(value.toString()))
      const started = Date.now()
      while (!logs.join('').includes('listening on port')) {
        assert.equal(child.exitCode, null, `API ${revision} exited: ${logs.join('')}`)
        assert.ok(Date.now() - started < 10000, `API ${revision} startup timeout`)
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      const startupMs = Date.now() - started
      async function request(path, options = {}) {
        const start = Date.now()
        const result = await fetch(base + path, { ...options, signal: AbortSignal.timeout(10000) })
        await result.text()
        return { status: result.status, ms: Date.now() - start }
      }
      const health = await request('/health'); assert.equal(health.status, 200)
      const preflight = await request('/api/v1/me', { method: 'OPTIONS', headers: { Origin: 'https://dine-os.netlify.app', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } })
      assert.equal(preflight.status, 204)
      const me = await request('/api/v1/me', { headers: { authorization: `Bearer ${token}` } }); assert.equal(me.status, 200)
      await new Promise(resolve => setTimeout(resolve, 1000))
      assert.equal((await request('/api/v1/me', { headers: { authorization: `Bearer ${token}` } })).status, 200)
      // Simulate DB loss, not Render spin-down. OPTIONS must remain independent.
      await admin.end(); admin = null; stopDb()
      assert.equal((await request('/api/v1/me', { method: 'OPTIONS', headers: { Origin: 'https://dine-os.netlify.app', 'Access-Control-Request-Method': 'GET' } })).status, 204)
      assert.equal((await request('/health')).status, 503)
      if (revision === 'ed373ca') assert.equal((await request('/livez')).status, 200)
      startDb()
      assert.equal((await request('/api/v1/me', { headers: { authorization: `Bearer ${token}` } })).status, 200)
      assert.equal((await request('/health')).status, 200)
      console.info(JSON.stringify({ revision, startupMs, initialHealth: health, initialPreflight: preflight, initialStaffVerification: me, localIdleAndDatabaseRecovery: 'passed', renderWakeTest: false }))
      await stopChild()
      admin = new pg.Client({ connectionString: baseConnection }); await admin.connect()
    }
  } finally {
    await stopChild()
    if (admin) await admin.end()
    if (jwksServer) await new Promise(resolve => jwksServer.close(resolve))
    if (dbRunning) stopDb()
  }
})
