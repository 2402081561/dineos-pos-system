import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync,readFileSync,readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { registerTableVisitMoveRoutes } from '../src/tableVisitMoves.js'
import { registerOrderIdentifierRoutes } from '../src/orderIdentifiers.js'

// Fresh local database only. Deliberately NEVER loads .env or DATABASE_URL.
test('local PostgreSQL: persistent identifiers, atomic table move/merge, stale protection and receipt safeguards', {skip:process.env.DINEOS_LOCAL_VISIT_TEST!=='1',timeout:60000}, async()=>{
  const directory=mkdtempSync(join(tmpdir(),'dineos-visits-')),data=join(directory,'cluster')
  const bin='/opt/homebrew/opt/postgresql@17/bin'
  const run=(cmd,args)=>{const result=spawnSync(join(bin,cmd),args,{encoding:'utf8',timeout:20000});assert.equal(result.status,0,result.stderr)}
  run('initdb',['-D',data,'-U','visit_test','--encoding=UTF8','--locale=C','--auth-local=trust','--auth-host=scram-sha-256'])
  run('pg_ctl',['-D',data,'-o',`-k ${directory} -p 54332 -c listen_addresses=''`,'-l',join(directory,'postgres.log'),'-w','start'])
  const pool=new pg.Pool({host:directory,port:54332,user:'visit_test',database:'postgres',connectionTimeoutMillis:5000})
  try{
    await pool.query('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN')
    const dbdir=new URL('../db/',import.meta.url)
    for(const file of readdirSync(dbdir).filter((file)=>/^\d{3}.*\.sql$/.test(file)).sort())await pool.query(readFileSync(new URL(file,dbdir),'utf8'))
    const actor=randomUUID(),other=randomUUID()
    await pool.query("INSERT INTO users(id,email,display_name,role) VALUES($1,'a@example.invalid','A','admin'),($2,'b@example.invalid','B','cashier')",[actor,other])
    const routes={},roles=[]
    const app=Object.fromEntries(['get','post','patch'].map((method)=>[method,(path,...handlers)=>{routes[`${method} ${path}`]=handlers.at(-1)}]))
    const deps={pool,requireAuthenticatedUser:()=>{},requireRole:(...allowed)=>{roles.push(allowed);return()=>{}}}
    registerTableVisitMoveRoutes(app,deps);registerOrderIdentifierRoutes(app,deps)
    assert.deepEqual(roles,[['admin','cashier'],['admin','cashier','kitchen']])
    const invoke=async(path,body={},params={},user=actor)=>{
      const res={statusCode:200,status(code){this.statusCode=code;return this},set(){return this},json(value){this.body=value;return this}}
      await routes[path]({body,params,user:{id:user}},res,(error)=>{throw error});return res
    }
    let number=0
    const table=async()=>{const id=randomUUID();await pool.query('INSERT INTO restaurant_tables(id,table_number,capacity) VALUES($1,$2,4)',[id,++number]);return id}
    const visit=async()=>{
      const tableId=await table(),sessionId=randomUUID(),customerId=randomUUID(),orderId=randomUUID()
      await pool.query("INSERT INTO table_sessions(id,table_id,status) VALUES($1,$2,'active')",[sessionId,tableId])
      await pool.query("INSERT INTO customer_sessions(id,table_session_id,nickname) VALUES($1,$2,'Shared Table')",[customerId,sessionId])
      await pool.query('UPDATE table_sessions SET shared_customer_session_id=$1 WHERE id=$2',[customerId,sessionId])
      await pool.query("INSERT INTO orders(id,table_session_id,customer_session_id,subtotal,service_charge,sst,grand_total,client_request_id) VALUES($1,$2,$3,9,0,0,9,$4)",[orderId,sessionId,customerId,randomUUID()])
      await pool.query("INSERT INTO order_items(order_id,item_name,unit_price,quantity,notes,order_type) VALUES($1,'Test Rice',9,1,'No onion','take_away')",[orderId])
      return {tableId,sessionId,customerId,orderId}
    }
    const setup=async()=> (await invoke('get /api/v1/cashier/table-visits')).body.tables
    const body=async(from,targetId)=>{
      const tables=await setup(),a=tables.find((row)=>row.id===from.tableId),b=tables.find((row)=>row.id===targetId)
      return {requestId:randomUUID(),sourceTableId:a.id,targetTableId:b.id,sourceSessionId:a.tableSessionId,targetSessionId:b.tableSessionId,mode:b.tableSessionId?'merge':'move',sourceOrders:a.orders,targetOrders:b.orders}
    }
    const move=(value,user)=>invoke('post /api/v1/cashier/table-visits/move',value,{},user)
    const a=await visit(),empty=await table()
    const initial=(await pool.query('SELECT * FROM orders WHERE id=$1',[a.orderId])).rows[0]
    const saved=await invoke('patch /api/v1/operations/orders/:orderId/identifiers',{ticketSeat:'8899',ticketReference:'QAA1234',expectedRevision:0},{orderId:a.orderId})
    assert.equal(saved.statusCode,200);assert.equal(saved.body.order.ticketRevision,1)
    assert.equal((await invoke('get /api/v1/operations/orders/:orderId/identifiers',{}, {orderId:a.orderId})).body.order.ticketReference,'QAA1234')
    assert.equal((await invoke('patch /api/v1/operations/orders/:orderId/identifiers',{ticketSeat:'different',expectedRevision:0},{orderId:a.orderId})).statusCode,409)
    assert.equal((await invoke('patch /api/v1/operations/orders/:orderId/identifiers',{ticketSeat:'8899',ticketReference:'QAA1234',expectedRevision:0},{orderId:a.orderId})).statusCode,200)
    assert.equal((await pool.query('SELECT version FROM orders WHERE id=$1',[a.orderId])).rows[0].version,initial.version)
    const request=await body(a,empty)
    assert.equal((await move(request)).statusCode,200)
    assert.equal((await move(request)).body.duplicate,true)
    assert.equal((await move(request,other)).statusCode,409)
    const moved=(await pool.query('SELECT * FROM orders WHERE id=$1',[a.orderId])).rows[0]
    assert.equal(moved.order_number,initial.order_number);assert.equal(moved.grand_total,initial.grand_total);assert.equal(moved.ticket_reference,'QAA1234')
    assert.equal(moved.counter_request_table_id,a.tableId)
    assert.equal((await pool.query('SELECT table_id FROM table_sessions WHERE id=$1',[a.sessionId])).rows[0].table_id,empty)
    const b=await visit(),merged=await body({...a,tableId:empty},b.tableId)
    const mergedResult=await move(merged);assert.equal(mergedResult.statusCode,200)
    const check=(await pool.query('SELECT * FROM orders WHERE table_session_id=$1 ORDER BY table_order_number',[b.sessionId])).rows
    assert.equal(check.length,2);assert.equal(new Set(check.map((row)=>row.table_order_number)).size,2)
    assert.equal(check.find((row)=>row.id===a.orderId).order_number,initial.order_number)
    const guest=(await pool.query('SELECT * FROM customer_sessions WHERE id=$1',[a.customerId])).rows[0]
    assert.equal(guest.table_session_id,b.sessionId);assert.equal(guest.merged_shared_guest,true);assert.ok(guest.previous_table_session_ids.includes(a.sessionId))
    assert.equal((await pool.query('SELECT status FROM table_sessions WHERE id=$1',[a.sessionId])).rows[0].status,'completed')
    assert.equal((await move(merged)).body.duplicate,true)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payments')).rows[0].n,0)
    const c=await visit(),d=await table(),stale=await body(c,d)
    await pool.query('UPDATE orders SET version=version+1 WHERE id=$1',[c.orderId])
    assert.equal((await move(stale)).statusCode,409)
    const paid=await body(c,d)
    await pool.query("INSERT INTO payments(receipt_number,table_session_id,cashier_id,payment_method,amount) VALUES('TEST-PAID',$1,$2,'Cash',1)",[c.sessionId,actor])
    assert.equal((await move(paid)).statusCode,409)
    const x=await visit(),y=await table(),z=await table()
    const requests=[await body(x,y),await body(x,z)]
    const concurrent=await Promise.all(requests.map((request)=>move(request)))
    assert.deepEqual(concurrent.map((response)=>response.statusCode).sort(),[200,409])
    const bad=await body(b,await table())
    assert.equal((await move({...bad,mode:'merge'})).statusCode,400)
    // Preparation/handoff counters and prices survive merge unchanged.
    assert.deepEqual((await pool.query('SELECT quantity,paid_quantity,fulfilled_quantity,unit_price,notes,order_type FROM order_items WHERE order_id=$1',[a.orderId])).rows,[{quantity:1,paid_quantity:0,fulfilled_quantity:0,unit_price:'9.00',notes:'No onion',order_type:'take_away'}])
    // A real payment lock/update racing the move makes its snapshot stale.
    const race=await visit(),raceTarget=await table(),raceBody=await body(race,raceTarget),payer=await pool.connect()
    await payer.query('BEGIN');await payer.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[race.orderId])
    const raceMove=move(raceBody)
    await payer.query("UPDATE orders SET version=version+1,paid_amount=1 WHERE id=$1",[race.orderId]);await payer.query('COMMIT');payer.release()
    assert.equal((await raceMove).statusCode,409)
    assert.equal((await pool.query('SELECT table_id FROM table_sessions WHERE id=$1',[race.sessionId])).rows[0].table_id,race.tableId)
    // Audit failure rolls the physical change and idempotency ledger back.
    const rollback=await visit(),rollbackTarget=await table(),rollbackBody=await body(rollback,rollbackTarget)
    const failingRoutes={}
    const failingApp={get(){},post(path,...handlers){failingRoutes[path]=handlers.at(-1)}}
    registerTableVisitMoveRoutes(failingApp,{...deps,pool:{connect:async()=>{
      const client=await pool.connect()
      return {query:(sql,args)=>sql.includes("'TABLE_VISIT_MOVE'")?Promise.reject(new Error('Test audit unavailable')):client.query(sql,args),release:()=>client.release()}
    }}})
    let failure
    await failingRoutes['/api/v1/cashier/table-visits/move']({body:rollbackBody,user:{id:actor}},{status(){return this},json(){return this}},(error)=>{failure=error})
    assert.match(failure.message,/audit unavailable/)
    assert.equal((await pool.query('SELECT table_id FROM table_sessions WHERE id=$1',[rollback.sessionId])).rows[0].table_id,rollback.tableId)
    assert.equal((await pool.query('SELECT 1 FROM table_visit_moves WHERE request_id=$1',[rollbackBody.requestId])).rowCount,0)
    console.info('Fresh local schema 001–032 and actual identifier/move/merge handlers passed. No production DB configuration loaded.')
  } finally {await pool.end();run('pg_ctl',['-D',data,'-m','fast','-w','stop'])}
})
