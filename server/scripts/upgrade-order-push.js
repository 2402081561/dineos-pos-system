import { mkdtemp, chmod, readFile, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

// This helper deliberately targets the existing independent LOCAL preview only.
// A hosted rollout requires its own explicit backup/deployment approval.
if (process.argv[2] !== '--local') throw new Error('Use --local. This script never changes a hosted database.')
const connectionString = 'postgresql://dineos_local@127.0.0.1:55434/postgres'
const directory = await mkdtemp(new URL('../../.local-tools/order-push-backup-', import.meta.url).pathname)
await chmod(directory, 0o700)
const backup = directory + '/before-push.dump'
const env = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '55434', PGUSER: 'dineos_local', PGPASSWORD: '', PGDATABASE: 'postgres', PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '10' }
const dump = spawnSync('/opt/homebrew/opt/postgresql@17/bin/pg_dump', ['--schema=public', '--format=custom', '--no-owner', '--no-acl', '--file', backup], { env, encoding: 'utf8', timeout: 60000 })
if (dump.status !== 0) throw new Error('Backup failed; no changes made.')
await chmod(backup, 0o600)
const verify = spawnSync('/opt/homebrew/opt/postgresql@17/bin/pg_restore', ['--list', backup], { encoding: 'utf8', timeout: 10000 })
if (verify.status !== 0 || (await stat(backup)).size < 1000) throw new Error('Backup verification failed; no changes made.')
const db = new pg.Client({ connectionString }); await db.connect()
try {
  await db.query('BEGIN')
  await db.query("SET LOCAL lock_timeout='5s'")
  const before = (await db.query('SELECT (SELECT count(*)::int FROM orders) AS orders,(SELECT count(*)::int FROM payments) AS payments')).rows[0]
  const name = '036_order_push.sql'
  if (!(await db.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [name])).rowCount) {
    await db.query(await readFile(new URL('../db/' + name, import.meta.url), 'utf8'))
    await db.query('INSERT INTO schema_migrations(filename) VALUES($1)', [name])
  }
  const after = (await db.query('SELECT (SELECT count(*)::int FROM orders) AS orders,(SELECT count(*)::int FROM payments) AS payments')).rows[0]
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Unexpected business record count change.')
  await db.query('COMMIT')
  console.info(JSON.stringify({ localOnly: true, backup, before, after, pushSendingEnabled: false }))
} catch (error) { await db.query('ROLLBACK'); throw error }
finally { await db.end() }
