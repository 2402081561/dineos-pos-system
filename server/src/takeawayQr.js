import { createHash } from 'node:crypto'
import { PosValidationError } from './posRules.js'
import { loadStoreSettings } from './shopSettings.js'

export const pickupFieldsSql = `to_jsonb(orders)->>'pickup_code' AS "pickupCode",to_jsonb(orders)->>'pickup_reference' AS "pickupReference"`
export function pickupReference(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length>40 || Array.from(value).some(char=>{const code=char.codePointAt(0);return code<32 || code>=127&&code<=159})) throw new PosValidationError('Enter a name, phone suffix or car plate (1–40 characters).')
  return value.trim()
}
export async function takeawayQrReady(pool) {
  return Boolean((await pool.query("SELECT to_regclass('public.takeaway_pickup_sequences') AS ready")).rows[0]?.ready)
}
export async function addPickupIdentity(client, orderId, reference) {
  reference = pickupReference(reference)
  const { rows: [row] } = await client.query(`INSERT INTO takeaway_pickup_sequences(business_date,last_number)
    SELECT (created_at AT TIME ZONE 'Asia/Kuching')::date,1 FROM orders WHERE id=$1
    ON CONFLICT(business_date) DO UPDATE SET last_number=takeaway_pickup_sequences.last_number+1 RETURNING business_date,last_number`, [orderId])
  const code = 'T' + String(row.last_number).padStart(3,'0')
  await client.query('UPDATE orders SET pickup_code=$1,pickup_reference=$2,pickup_day=$3 WHERE id=$4', [code, reference, row.business_date, orderId])
  return { pickupCode: code, pickupReference: reference }
}

export function registerTakeawayQrRoutes(app, { pool }) {
  app.get('/api/v1/public/takeaway/config', async (_request, response) => {
    const ready = await takeawayQrReady(pool)
    const settings = await loadStoreSettings(pool)
    return response.set('Cache-Control','no-store').json({ enabled: ready && settings.config.takeawayQrEnabled, isAcceptingOrders: settings.isAcceptingOrders, orderingMessage: settings.orderingMessage })
  })
  app.post('/api/v1/public/takeaway/join', async (request, response, next) => {
    const key = request.get('idempotency-key') ?? ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return response.status(400).json({error:'A valid idempotency key is required.'})
    let reference
    try { reference=pickupReference(request.body?.reference) } catch(error) {return response.status(400).json({error:error.message})}
    if (!await takeawayQrReady(pool)) return response.status(503).json({error:'Take-away QR ordering is not enabled yet.'})
    const hash=createHash('sha256').update(key).digest('hex')
    const client=await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[hash])
      const existing=await client.query(`SELECT c.access_token AS "sessionId",c.table_session_id AS "tableSessionId",c.nickname AS "customerNickname",s.status AS "visitStatus",
        c.left_at IS NULL AND c.takeaway_expires_at>now() AS usable FROM customer_sessions c JOIN table_sessions s ON s.id=c.table_session_id WHERE c.takeaway_join_hash=$1 FOR UPDATE OF c,s`,[hash])
      if(existing.rows[0]) {
        const row=existing.rows[0]
        if(!row.usable) throw new PosValidationError('This take-away visit has expired. Start a new visit explicitly.',409)
        // A lost response must recover the SAME guest, not update another bill.
        await client.query('COMMIT')
        return response.json({session:{sessionId:row.sessionId,tableSessionId:row.tableSessionId,customerNickname:row.customerNickname,visitStatus:row.visitStatus,tableNumber:null,isTakeawayQr:true,isSharedTable:false}})
      }
      const settings=await loadStoreSettings(client)
      if(!settings.config.takeawayQrEnabled) throw new PosValidationError('Take-away QR ordering is not enabled yet.',409)
      if(!settings.isAcceptingOrders) throw new PosValidationError(settings.orderingMessage,409)
      // Bounded anonymous onboarding for a single small restaurant. This does
      // not replace deployment-level bot/rate protection before public rollout.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('takeaway-join-capacity',0))")
      const count=await client.query("SELECT count(*)::int AS n FROM customer_sessions WHERE takeaway_join_hash IS NOT NULL AND joined_at>now()-interval '10 minutes'")
      if(count.rows[0].n>=120) throw new PosValidationError('Too many take-away visits. Please ask the cashier or try again shortly.',429)
      const visit=(await client.query("INSERT INTO table_sessions(table_id,status) VALUES(NULL,'active') RETURNING id")).rows[0].id
      const row=(await client.query(`INSERT INTO customer_sessions(table_session_id,nickname,takeaway_join_hash,takeaway_expires_at)
        VALUES($1,$2,$3,now()+interval '24 hours') RETURNING access_token AS "sessionId",table_session_id AS "tableSessionId",nickname AS "customerNickname"`,[visit,reference,hash])).rows[0]
      await client.query('COMMIT')
      return response.status(201).json({session:{...row,tableNumber:null,isTakeawayQr:true,isSharedTable:false,visitStatus:'active'}})
    } catch(error) {
      await client.query('ROLLBACK')
      if(error instanceof PosValidationError) return response.status(error.status).json({error:error.message})
      return next(error)
    } finally {client.release()}
  })
}
