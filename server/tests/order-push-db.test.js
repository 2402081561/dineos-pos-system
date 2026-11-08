import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import express from 'express'
import { createOrderPushWorker, registerOrderPushRoutes } from '../src/orderPush.js'
import { pushFixture } from './helpers/pushFixture.js'

test('local push lifecycle: committed orders only, device isolation, retries, expiry, logout and roles', { skip: process.env.DINEOS_DATABASE_TESTS !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL)
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname), 'Never mutate hosted data in tests')
  const name = 'push_test_' + randomUUID().replaceAll('-', '')
  const adminUrl = new URL(url); adminUrl.pathname = '/template1'
  const admin = new pg.Client({ connectionString: adminUrl.href }); await admin.connect()
  let pool, server
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`)
    url.pathname = '/' + name
    pool = new pg.Pool({ connectionString: url.href })
    const dir = new URL('../db/', import.meta.url)
    for (const file of (await readdir(dir)).filter((file) => /^\d{3}.*\.sql$/.test(file) && (Number(file.slice(0,3)) <= 31 || Number(file.slice(0,3)) >= 34)).sort()) await pool.query(await readFile(new URL(file, dir), 'utf8'))
    const actor = (await pool.query("INSERT INTO users(email,display_name,role) VALUES ('cashier@example.test','Cashier','cashier') RETURNING id")).rows[0].id
    const other = (await pool.query("INSERT INTO users(email,display_name,role) VALUES ('other@example.test','Other','admin') RETURNING id")).rows[0].id
    const kitchen = (await pool.query("INSERT INTO users(email,display_name,role) VALUES ('kitchen@example.test','Kitchen','kitchen') RETURNING id")).rows[0].id
    const { config, input } = pushFixture()
    const app = express(); app.use(express.json())
    let failure, sent = []
    const send = async (subscription, payload) => { if (failure) throw failure; sent.push({ subscription, payload }) }
    registerOrderPushRoutes(app, { pool, config, send,
      requireAuthenticatedUser: async (req,res,next) => {
        const id = req.get('x-test-user'); if (!id) return res.sendStatus(401)
        req.user = (await pool.query('SELECT id,role FROM users WHERE id=$1', [id])).rows[0]; next()
      }, requireRole: (...roles) => (req,res,next) => roles.includes(req.user?.role) ? next() : res.sendStatus(403) })
    server = app.listen(0,'127.0.0.1'); await new Promise((resolve) => server.once('listening',resolve))
    const base = 'http://127.0.0.1:' + server.address().port + '/api/v1/operations/push'
    async function api(path, { body, method = body ? 'POST' : 'GET', user = actor, origin = config.appOrigin } = {}) {
      const response = await fetch(base + path, { method, headers: { 'content-type':'application/json', origin, ...(user ? {'x-test-user':user} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) })
      return { status: response.status, body: await response.json().catch(()=>null) }
    }
    assert.equal((await api('/config',{user:null})).status,401)
    assert.equal((await api('/config',{user:kitchen})).status,403)
    const visible = (await api('/config')).body
    assert.equal(visible.enabled,true); assert.ok(!Object.hasOwn(visible,'privateKey'))
    assert.equal((await api('/subscriptions',{body:input,origin:'https://other.example.test'})).status,403)
    assert.equal((await api('/subscriptions',{body:{...input,subscription:{...input.subscription,endpoint:'https://localhost/test'}}})).status,400)
    assert.equal((await api('/subscriptions',{body:input})).status,200)
    assert.equal((await api('/subscriptions',{body:input,user:other})).status,409,'Other account cannot take over endpoint')
    assert.equal((await api('/devices/'+input.deviceId,{user:other})).body.active,false)
    assert.equal((await api('/devices/'+input.deviceId+'/test',{body:{}})).status,200)
    assert.equal((await api('/devices/'+input.deviceId+'/test',{body:{}})).status,429)
    assert.equal(sent[0].payload.kind,'test'); sent=[]
    const visit = (await pool.query("INSERT INTO table_sessions(table_id,status) VALUES(NULL,'active') RETURNING id")).rows[0].id
    const customer = (await pool.query('INSERT INTO customer_sessions(table_session_id,nickname) VALUES($1,\'Synthetic\') RETURNING id',[visit])).rows[0].id
    async function insert(client, type='take_away', key=randomUUID()) {
      return (await client.query(`INSERT INTO orders(table_session_id,customer_session_id,subtotal,service_charge,sst,grand_total,order_type,client_request_id) VALUES($1,$2,9,0,0,9,$3,$4) RETURNING id`,[visit,customer,type,key])).rows[0].id
    }
    const tx = await pool.connect(); await tx.query('BEGIN')
    await insert(tx); assert.equal((await pool.query('SELECT count(*)::int AS n FROM order_push_deliveries')).rows[0].n,0,'Uncommitted jobs invisible')
    await tx.query('ROLLBACK'); tx.release()
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM order_push_deliveries')).rows[0].n,0)
    await insert(pool,'dine_in'); assert.equal((await pool.query('SELECT count(*)::int AS n FROM order_push_deliveries')).rows[0].n,0)
    const key=randomUUID(), order=await insert(pool,'mixed',key)
    await assert.rejects(insert(pool,'mixed',key),{code:'23505'})
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM order_push_deliveries')).rows[0].n,1)
    const worker=createOrderPushWorker({pool,config,send})
    failure=Object.assign(new Error('timeout'),{statusCode:503})
    await worker.processOne()
    let job=(await pool.query('SELECT * FROM order_push_deliveries WHERE order_id=$1',[order])).rows[0]
    assert.equal(job.status,'pending'); assert.equal(job.attempts,1)
    failure=null; await pool.query('UPDATE order_push_deliveries SET next_attempt_at=now()')
    const worker2=createOrderPushWorker({pool,config,send})
    await Promise.all([worker.processOne(),worker2.processOne()])
    assert.equal(sent.length,1); assert.equal(sent[0].payload.orderId,order)
    assert.equal((await pool.query('SELECT status FROM order_push_deliveries WHERE order_id=$1',[order])).rows[0].status,'accepted')
    const cancelled=await insert(pool); await pool.query("UPDATE orders SET status='cancelled' WHERE id=$1",[cancelled]); await worker.processOne(); assert.equal(sent.length,1)
    const expired=await insert(pool); await pool.query("UPDATE order_push_deliveries SET created_at=now()-interval '16 minutes' WHERE order_id=$1",[expired]); await worker.processOne(); assert.equal(sent.length,1)
    const rejected=await insert(pool); failure={statusCode:410}; await worker.processOne(); failure=null
    assert.equal((await api('/devices/'+input.deviceId)).body.active,false,'Gone endpoints disabled')
    assert.equal((await pool.query('SELECT status FROM order_push_deliveries WHERE order_id=$1',[rejected])).rows[0].status,'failed')
    await api('/subscriptions',{body:input}); await insert(pool)
    await pool.query("UPDATE users SET role='kitchen' WHERE id=$1",[actor]); await worker.processOne(); assert.equal(sent.length,1,'Role revoked before sending')
    await pool.query("UPDATE users SET role='cashier' WHERE id=$1",[actor])
    await insert(pool)
    assert.equal((await api('/devices/'+input.deviceId,{method:'DELETE',user:other})).status,204)
    assert.equal((await api('/devices/'+input.deviceId)).body.active,true,'Other account cannot delete')
    await api('/devices/'+input.deviceId,{method:'DELETE'}); await worker.processOne(); assert.equal(sent.length,1,'Logout deletes pending jobs')
    assert.equal((await api('/devices/'+input.deviceId)).body.active,false)
    // Re-enabling starts with future orders only, no history replay.
    await api('/subscriptions',{body:input}); assert.equal(await worker.processOne(),false)
  } finally {
    if(server) await new Promise((resolve)=>server.close(resolve))
    await pool?.end()
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',[name])
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`); await admin.end()
  }
})
