import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'

const directory = path.dirname(fileURLToPath(import.meta.url))
const serverDirectory = path.resolve(directory, '..')
dotenv.config({ path: path.join(serverDirectory, '.env') })

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in server/.env before applying the schema.')

const migrations = ['001_initial_schema.sql', '002_firebase_snapshot.sql', '003_source_mapping.sql', '004_order_import_support.sql', '005_operational_import_support.sql', '006_supabase_auth_identities.sql', '007_lock_down_direct_database_access.sql', '008_customer_session_tokens.sql', '009_order_idempotency.sql', '010_receipt_sequences.sql', '011_new_operational_records.sql', '012_shared_table_mode.sql', '013_menu_category_metadata.sql', '014_customer_member_sessions.sql', '015_daily_order_numbers.sql', '016_table_order_numbers.sql', '017_cash_tender.sql', '018_table_floor_layout.sql']
migrations.push('019_table_floor_areas.sql')
migrations.push('020_counter_order_idempotency.sql')
migrations.push('021_shop_settings.sql')
const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

try {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  for (const filename of migrations) {
    const alreadyApplied = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename])
    if (alreadyApplied.rowCount) {
      console.info(`[Schema] ${filename} was already applied.`)
      continue
    }
    const sql = await readFile(path.join(serverDirectory, 'db', filename), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename])
      await client.query('COMMIT')
      console.info(`[Schema] Applied ${filename}.`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }
} finally {
  await pool.end()
}
