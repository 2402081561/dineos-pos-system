import { mkdtemp, chmod, readFile, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import pg from 'pg'
import dotenv from 'dotenv'

const mode = process.argv[2]
if (!['--local', '--current'].includes(mode)) throw new Error('Choose --local or --current explicitly.')
if (mode === '--current') dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true })
const connectionString = mode === '--local' ? 'postgresql://dineos_local@127.0.0.1:55434/postgres' : process.env.DATABASE_URL
const target = new URL(connectionString)
const directory = await mkdtemp(new URL('../../.local-tools/walkin-assignment-backup-', import.meta.url).pathname)
await chmod(directory, 0o700)
const backup = directory + '/before-assignment.dump'
const env = { ...process.env, PGHOST: target.hostname, PGPORT: target.port || '5432', PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password), PGDATABASE: target.pathname.slice(1), PGSSLMODE: mode === '--local' ? 'disable' : target.searchParams.get('sslmode') || 'require', PGCONNECT_TIMEOUT: '15' }
const dump = spawnSync('/opt/homebrew/opt/postgresql@17/bin/pg_dump', ['--schema=public', '--format=custom', '--no-owner', '--no-acl', '--file', backup], { env, encoding: 'utf8', timeout: 120000 })
if (dump.status !== 0) throw new Error('Backup failed; no schema changes made.')
await chmod(backup, 0o600)
const verify = spawnSync('/opt/homebrew/opt/postgresql@17/bin/pg_restore', ['--list', backup], { encoding: 'utf8' })
if (verify.status !== 0 || (await stat(backup)).size < 1000) throw new Error('Backup verification failed; no schema changes made.')
console.info(JSON.stringify({ mode, host: target.hostname, backup, bytes: (await stat(backup)).size }))
const client = new pg.Client({ connectionString })
await client.connect()
try {
  await client.query('BEGIN')
  await client.query("SET LOCAL lock_timeout='5s'")
  const before = (await client.query('SELECT (SELECT count(*)::int FROM orders) AS orders,(SELECT count(*)::int FROM payments) AS payments')).rows[0]
  for (const name of ['034_walk_in_orders.sql', '035_walk_in_table_assignment.sql']) {
    if ((await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [name])).rowCount) continue
    await client.query(await readFile(new URL('../db/' + name, import.meta.url), 'utf8'))
    await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [name])
    console.info('Prepared migration ' + name)
  }
  const after = (await client.query('SELECT (SELECT count(*)::int FROM orders) AS orders,(SELECT count(*)::int FROM payments) AS payments')).rows[0]
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Unexpected record count change; rolling back.')
  await client.query('COMMIT')
  console.info(JSON.stringify({ committed: true, before, after }))
} catch (error) { await client.query('ROLLBACK'); throw error }
finally { await client.end() }
