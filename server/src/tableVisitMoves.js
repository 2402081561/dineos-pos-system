import { createHash } from 'node:crypto'
import { PosValidationError } from './posRules.js'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function moveInput(body) {
  if (!body || !uuid.test(body.requestId) || !uuid.test(body.sourceTableId) || !uuid.test(body.targetTableId) || body.sourceTableId === body.targetTableId || !uuid.test(body.sourceSessionId) || !['move','merge'].includes(body.mode) || (body.targetSessionId !== null && !uuid.test(body.targetSessionId))) throw new PosValidationError('Choose different tables and reload their current visits.')
  if ((body.mode === 'move') !== (body.targetSessionId === null)) throw new PosValidationError('Move needs an empty table; merge needs an occupied table.')
  const versions = (value) => {
    if (!Array.isArray(value) || value.length > 1000 || value.some((item) => !uuid.test(item?.id) || !Number.isSafeInteger(item.version) || item.version < 0) || new Set(value.map((item) => item.id)).size !== value.length) throw new PosValidationError('Reload the current table orders.')
    return value.map(({id,version}) => ({id,version})).sort((a,b) => a.id.localeCompare(b.id))
  }
  return { requestId:body.requestId,sourceTableId:body.sourceTableId,targetTableId:body.targetTableId,sourceSessionId:body.sourceSessionId,targetSessionId:body.targetSessionId,mode:body.mode,sourceOrders:versions(body.sourceOrders),targetOrders:versions(body.targetOrders) }
}
export const orderVersions = (orders) => orders.map(({ id,version }) => ({ id,version })).sort((a,b) => a.id.localeCompare(b.id))
export function registerTableVisitMoveRoutes(app, { pool, requireAuthenticatedUser, requireRole }) {
  const guards = [requireAuthenticatedUser,requireRole('admin','cashier')]
  app.get('/api/v1/cashier/table-visits', ...guards, async (_req,res,next) => {
    try {
      const ready=await pool.query("SELECT to_regclass('public.table_visit_moves') AS ready")
      if(!ready.rows[0]?.ready)return res.status(503).json({error:'This feature needs database upgrade 032 before use.'})
      const { rows } = await pool.query(`SELECT t.id,t.table_number AS "tableNumber",s.id AS "tableSessionId",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'version',o.version) ORDER BY o.id) FROM orders o WHERE o.table_session_id=s.id),'[]'::jsonb) AS orders,
        EXISTS(SELECT 1 FROM payments p WHERE p.table_session_id=s.id) AS "hasPayments",
        COALESCE((SELECT sum(grand_total-paid_amount) FROM orders o WHERE o.table_session_id=s.id AND status<>'cancelled'),0) AS "unpaidTotal"
        FROM restaurant_tables t LEFT JOIN table_sessions s ON s.table_id=t.id AND s.status='active' WHERE t.is_enabled ORDER BY t.table_number`)
      res.set('Cache-Control','no-store').json({ tables:rows })
    } catch(error) {next(error)}
  })
  app.post('/api/v1/cashier/table-visits/move', ...guards, async (req,res,next) => {
    let input
    try { input=moveInput(req.body) } catch(error) {return res.status(400).json({error:error.message})}
    const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const client=await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout='5s'")
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[input.requestId])
      const previous=await client.query('SELECT actor_id,fingerprint,result FROM table_visit_moves WHERE request_id=$1',[input.requestId])
      if(previous.rows[0]) {
        if(previous.rows[0].actor_id!==req.user.id || previous.rows[0].fingerprint!==fingerprint) throw new PosValidationError('This move request belongs to a different operation.',409)
        await client.query('COMMIT'); return res.json({result:previous.rows[0].result,duplicate:true})
      }
      const ids=[input.sourceTableId,input.targetTableId].sort()
      const tables=await client.query('SELECT id FROM restaurant_tables WHERE id=ANY($1::uuid[]) AND is_enabled ORDER BY id FOR UPDATE',[ids])
      if(tables.rowCount!==2) throw new PosValidationError('The selected table is unavailable.',409)
      const visits=await client.query("SELECT id,table_id,shared_customer_session_id,last_order_number FROM table_sessions WHERE table_id=ANY($1::uuid[]) AND status='active' ORDER BY id FOR UPDATE",[ids])
      const source=visits.rows.find((row)=>row.table_id===input.sourceTableId), target=visits.rows.find((row)=>row.table_id===input.targetTableId)
      if(source?.id!==input.sourceSessionId || (target?.id??null)!==input.targetSessionId) throw new PosValidationError('Table visits changed. Reload and confirm again.',409)
      const sessions=[source.id,...(target?[target.id]:[])]
      const all=await client.query('SELECT id,table_session_id,version,payment_status,paid_amount,receipt_number,table_order_number FROM orders WHERE table_session_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[sessions])
      const from=all.rows.filter((row)=>row.table_session_id===source.id), to=all.rows.filter((row)=>row.table_session_id===target?.id)
      if(JSON.stringify(orderVersions(from))!==JSON.stringify(input.sourceOrders) || JSON.stringify(orderVersions(to))!==JSON.stringify(input.targetOrders)) throw new PosValidationError('Table orders changed. Reload and confirm again.',409)
      const payments=await client.query('SELECT 1 FROM payments WHERE table_session_id=ANY($1::uuid[]) LIMIT 1',[sessions])
      const paidItems=await client.query('SELECT 1 FROM order_items WHERE order_id=ANY($1::uuid[]) AND paid_quantity>0 LIMIT 1',[all.rows.map((row)=>row.id)])
      if(payments.rowCount || paidItems.rowCount || all.rows.some((row)=>row.payment_status==='paid'||Number(row.paid_amount)>0||row.receipt_number)) throw new PosValidationError('Tables with any payment cannot be moved or merged.',409)
      // A counter retry must compare its ORIGINAL table even after relocation.
      await client.query('UPDATE orders SET counter_request_table_id=COALESCE(counter_request_table_id,$1) WHERE table_session_id=$2',[input.sourceTableId,source.id])
      if(input.mode==='move') {
        await client.query('UPDATE table_sessions SET table_id=$1,updated_at=now() WHERE id=$2',[input.targetTableId,source.id])
        await client.query('UPDATE orders SET version=version+1,updated_at=now() WHERE table_session_id=$1',[source.id])
      } else {
        // Keep existing customer tokens working on the combined table; never
        // silently merge two active identities belonging to the same member.
        await client.query('SELECT id FROM customer_sessions WHERE table_session_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[sessions])
        const duplicateMember=await client.query('SELECT member_id FROM customer_sessions WHERE table_session_id=ANY($1::uuid[]) AND left_at IS NULL AND member_id IS NOT NULL GROUP BY member_id HAVING count(*)>1 LIMIT 1',[sessions])
        if(duplicateMember.rowCount) throw new PosValidationError('The same member has active sessions at both tables. Resolve those sessions before merging.',409)
        if(source.shared_customer_session_id) await client.query('UPDATE customer_sessions SET merged_shared_guest=true WHERE id=$1',[source.shared_customer_session_id])
        await client.query('UPDATE customer_sessions SET table_session_id=$1,previous_table_session_ids=array_append(previous_table_session_ids,$2::uuid) WHERE table_session_id=$2',[target.id,source.id])
        let counter=BigInt(target.last_order_number)
        for(const order of from.sort((a,b)=>Number(BigInt(a.table_order_number)-BigInt(b.table_order_number)))) {
          counter++
          await client.query('UPDATE orders SET table_session_id=$1,table_order_number=$2,version=version+1,updated_at=now() WHERE id=$3',[target.id,counter.toString(),order.id])
        }
        await client.query('UPDATE orders SET version=version+1,updated_at=now() WHERE table_session_id=$1 AND NOT(id=ANY($2::uuid[]))',[target.id,from.map((row)=>row.id)])
        await client.query('UPDATE service_requests SET table_session_id=$1 WHERE table_session_id=$2',[target.id,source.id])
        await client.query('UPDATE table_sessions SET last_order_number=$1,updated_at=now() WHERE id=$2',[counter.toString(),target.id])
        await client.query("UPDATE table_sessions SET status='completed',shared_customer_session_id=NULL,updated_at=now() WHERE id=$1",[source.id])
      }
      const result={sourceTableId:input.sourceTableId,targetTableId:input.targetTableId,tableSessionId:target?.id??source.id,mode:input.mode}
      await client.query('INSERT INTO table_visit_moves(request_id,actor_id,fingerprint,result) VALUES($1,$2,$3,$4::jsonb)',[input.requestId,req.user.id,fingerprint,JSON.stringify(result)])
      await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,details) VALUES($1,'TABLE_VISIT_MOVE','tableSession',$2,$3::jsonb)",[req.user.id,source.id,JSON.stringify({...result,sourceSessionId:source.id,targetSessionId:target?.id??null})])
      await client.query('COMMIT')
      res.json({result,duplicate:false})
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>{})
      if(error instanceof PosValidationError) return res.status(error.status).json({error:error.message})
      if(['40P01','55P03','23505'].includes(error.code)) return res.status(409).json({error:'Table visits changed. Reload and confirm again.'})
      next(error)
    } finally {client.release()}
  })
}
