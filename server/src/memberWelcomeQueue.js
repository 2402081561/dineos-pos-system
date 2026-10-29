import { randomUUID } from 'node:crypto'
import { welcomeMessage, WelcomeDeliveryError } from './memberWelcomeEmail.js'

export const welcomeStatus = (status) => status === 'accepted' ? 'accepted'
  : ['pending', 'processing', 'retry'].includes(status) ? 'queued' : 'unavailable'

export function createMemberWelcomeQueue({ pool, config, send, logger = console }) {
  let running = false
  function log(code) {
    // Do not print provider bodies, email addresses, message HTML or credentials.
    logger.error(`[Member email] ${/^[A-Z0-9_]{1,64}$/.test(code ?? '') ? code : 'EMAIL_UNAVAILABLE'}`)
  }
  async function registration(client, member, { created }) {
    if (!config.welcomeEnabled) return 'disabled'
    // An email subsystem/schema failure must not undo a valid membership.
    await client.query('SAVEPOINT welcome_email')
    try {
      if (created) {
        const { rows } = await client.query('SELECT name FROM shop_settings WHERE id=1')
        const body = welcomeMessage({ member, shopName: rows[0]?.name, from: config.from })
        await client.query('INSERT INTO member_welcome_emails(member_id,payload) VALUES($1,$2::jsonb) ON CONFLICT(member_id) DO NOTHING', [member.id, JSON.stringify(body)])
      }
      const { rows } = await client.query('SELECT status FROM member_welcome_emails WHERE member_id=$1', [member.id])
      await client.query('RELEASE SAVEPOINT welcome_email')
      return welcomeStatus(rows[0]?.status)
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT welcome_email')
      await client.query('RELEASE SAVEPOINT welcome_email')
      log(error.code)
      return 'unavailable'
    }
  }
  async function processOne() {
    if (!config.welcomeEnabled || running) return
    running = true
    try {
      // Never retry after the provider's 24h deduplication window. A crash or
      // timeout may have sent the message already; an operator must check it.
      await pool.query(`UPDATE member_welcome_emails SET status='blocked',last_error_code='EMAIL_RETRY_WINDOW_EXPIRED',updated_at=now()
        WHERE status IN ('pending','processing','retry') AND first_attempt_at <= now()-interval '23 hours'
          AND (lease_until IS NULL OR lease_until<now())`)
      const token = randomUUID()
      const { rows } = await pool.query(`WITH due AS (
          SELECT id FROM member_welcome_emails WHERE
            ((status IN ('pending','retry') AND next_attempt_at<=now()) OR (status='processing' AND lease_until<now()))
            AND (first_attempt_at IS NULL OR first_attempt_at>now()-interval '23 hours')
          ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1
        ) UPDATE member_welcome_emails m SET status='processing',attempts=attempts+1,
          first_attempt_at=COALESCE(first_attempt_at,now()),lease_until=now()+interval '2 minutes',lease_token=$1,updated_at=now()
        FROM due WHERE m.id=due.id RETURNING m.*`, [token])
      const job = rows[0]
      if (!job) return
      try {
        const providerId = await send(job.payload, `member-welcome/${job.id}`)
        await pool.query(`UPDATE member_welcome_emails SET status='accepted',provider_message_id=$1,lease_until=NULL,lease_token=NULL,last_error_code=NULL,updated_at=now()
          WHERE id=$2 AND lease_token=$3`, [providerId, job.id, token])
      } catch (error) {
        const known = error instanceof WelcomeDeliveryError
        const code = known ? error.code : 'EMAIL_RESPONSE_UNCERTAIN'
        const retry = (!known || error.retryable) && job.attempts < 6
        await pool.query(`UPDATE member_welcome_emails SET status=$1,last_error_code=$2,
          next_attempt_at=now()+interval '5 minutes',lease_until=NULL,lease_token=NULL,updated_at=now()
          WHERE id=$3 AND lease_token=$4`, [retry ? 'retry' : 'blocked', code, job.id, token])
        log(code)
      }
    } catch (error) { log(error.code) }
    finally { running = false }
  }
  return {
    registration,
    kick() { if (config.welcomeEnabled) void processOne() },
    processOne,
    start() {
      if (!config.welcomeEnabled) return () => {}
      const timer = setInterval(() => void processOne(), 30000)
      timer.unref()
      void processOne()
      return () => clearInterval(timer)
    },
  }
}
