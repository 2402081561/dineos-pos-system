import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import { linkMemberEmail } from '../src/linkMemberEmail.js'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })
const [memberId, authUserId, expectedEmail, confirmation] = process.argv.slice(2)
if (confirmation !== '--confirmed-owner') throw new Error('An administrator must confirm ownership of the OLD membership, not just ownership of the new email. See MEMBER_EMAIL_OTP.md.')
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL first.')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
let client
try {
  client = await pool.connect()
  await client.query('BEGIN')
  const result = await linkMemberEmail(client, { memberId, authUserId, expectedEmail })
  await client.query('COMMIT')
  console.info('[Members] Verified email linked:', JSON.stringify(result))
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {})
  throw error
} finally { client?.release(); await pool.end() }
