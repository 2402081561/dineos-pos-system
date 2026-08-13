import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'

const directory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(directory, '..', '.env') })

const [authUserId, email, displayName, role] = process.argv.slice(2)
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const allowedRoles = new Set(['admin', 'cashier', 'kitchen', 'staff'])
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in server/.env first.')
if (!uuid.test(String(authUserId))) throw new Error('Provide a valid Supabase Auth User ID (UUID).')
if (!String(email ?? '').trim() || !String(displayName ?? '').trim()) throw new Error('Provide email and display name.')
if (!allowedRoles.has(String(role).toLowerCase())) throw new Error('Role must be admin, cashier, kitchen, or staff.')

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
try {
  const normalizedEmail = String(email).trim().toLowerCase()
  const normalizedDisplayName = String(displayName).trim()
  const normalizedRole = String(role).toLowerCase()
  await pool.query('BEGIN')
  const existingByEmail = await pool.query('SELECT id FROM users WHERE email = $1 FOR UPDATE', [normalizedEmail])
  let rows
  if (existingByEmail.rows[0]) {
    ({ rows } = await pool.query(`
      UPDATE users
      SET auth_user_id = $1, display_name = $2, role = $3::user_role, updated_at = now()
      WHERE id = $4
      RETURNING id, email, display_name AS "displayName", role
    `, [authUserId, normalizedDisplayName, normalizedRole, existingByEmail.rows[0].id]))
  } else {
    ({ rows } = await pool.query(`
      INSERT INTO users (auth_user_id, email, display_name, role)
      VALUES ($1, $2, $3, $4::user_role)
      ON CONFLICT (auth_user_id) DO UPDATE
        SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, role = EXCLUDED.role, updated_at = now()
      RETURNING id, email, display_name AS "displayName", role
    `, [authUserId, normalizedEmail, normalizedDisplayName, normalizedRole]))
  }
  await pool.query('COMMIT')
  console.info('[Users] Provisioned:', JSON.stringify(rows[0]))
} catch (error) {
  await pool.query('ROLLBACK').catch(() => {})
  throw error
} finally { await pool.end() }
