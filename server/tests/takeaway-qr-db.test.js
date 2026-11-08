import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile,readdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {pushFixture} from './helpers/pushFixture.js'

test('local public takeaway: shared QR/private visits, retries, pickup identity, push, payment and isolation', {skip:process.env.DINEOS_DATABASE_TESTS!=='1'},async()=>{
  const url=new URL(process.env.DATABASE_URL)
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Local database only')
  const name='takeaway_qr_'+randomUUID().replaceAll('-',''),adminUrl=new URL(url);adminUrl.pathname='/template1'
  const admin=new pg.Client({connectionString:adminUrl.href});await admin.connect()
  let pool,server
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);url.pathname='/'+name
    process.env.DATABASE_URL=url.href;process.env.ORDER_PUSH_ENABLED='false';process.env.MEMBER_EMAIL_OTP_ENABLED='false';process.env.MEMBER_WELCOME_EMAIL_ENABLED='false'
    const db=new pg.Client({connectionString:url.href});await db.connect()
    const dir=new URL('../db/',import.meta.url)
    for(const file of (await readdir(dir)).filter(file=>/^\d{3}.*\.sql$/.test(file)&&(Number(file.slice(0,3))<=31||Number(file.slice(0,3))>=34)).sort()) await db.query(await readFile(new URL(file,dir),'utf8'))
    const actor=(await db.query("INSERT INTO users(email,display_name,role) VALUES('test@example.test','Test','admin') RETURNING id")).rows[0].id
    const dish=(await db.query("INSERT INTO menu_items(name,price) VALUES('合成测试饭',9) RETURNING id")).rows[0].id
    await db.query('INSERT INTO restaurant_tables(table_number,capacity) VALUES(1,4)')
    const push=pushFixture()
    await db.query('INSERT INTO order_push_subscriptions(user_id,device_id,endpoint,subscription) VALUES($1,$2,$3,$4::jsonb)',[actor,push.input.deviceId,push.input.subscription.endpoint,JSON.stringify(push.input.subscription)])
    await db.end()
    const index=new URL('../src/index.js',import.meta.url),require=createRequire(index)
    let source=await readFile(index,'utf8')
    source=source.slice(0,source.indexOf('const apiServer ='))+'\nexport {app,pool};'
    source=source.replace('const requireAuthenticatedUser = createAuthenticatedUserMiddleware({ verifyToken: verifySupabaseAccessToken, pool })',`const requireAuthenticatedUser=(request,response,next)=>{request.user={id:'${actor}',role:'admin'};next()}`)
    source=source.replace(/from '([^']+)'/g,(_,spec)=>`from '${spec.startsWith('node:')?spec:pathToFileURL(require.resolve(spec)).href}'`).replace("import 'dotenv/config'",`import '${pathToFileURL(require.resolve('dotenv/config')).href}'`)
    const mod=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));pool=mod.pool
    server=mod.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve))
    const base='http://127.0.0.1:'+server.address().port+'/api/v1'
    async function api(path,{body,method=body?'POST':'GET',session,key,status=200}={}) {
      const res=await fetch(base+path,{method,headers:{'content-type':'application/json',...(session?{'x-customer-session':session.sessionId}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})})
      const data=await res.json().catch(()=>({}));assert.ok((Array.isArray(status)?status:[status]).includes(res.status),`${method} ${path} ${res.status}: ${JSON.stringify(data)}`);return data
    }
    assert.equal((await api('/public/takeaway/config')).enabled,false)
    await api('/public/takeaway/join',{body:{reference:'8821'},key:randomUUID(),status:409})
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM table_sessions')).rows[0].n,0,'Disabled entry creates nothing')
    await pool.query("UPDATE shop_settings SET config=jsonb_set(config,'{takeawayQrEnabled}','true'::jsonb)")
    const keyA=randomUUID()
    const [first,again,second]=await Promise.all([
      api('/public/takeaway/join',{body:{reference:'8821'},key:keyA,status:[200,201]}),
      // Concurrent same-key response may be creation or replay: use raw below.
      fetch(base+'/public/takeaway/join',{method:'POST',headers:{'content-type':'application/json','idempotency-key':keyA},body:JSON.stringify({reference:'8821'})}).then(async res=>{assert.ok([200,201].includes(res.status));return res.json()}),
      api('/public/takeaway/join',{body:{reference:'8821'},key:randomUUID(),status:201}),
    ])
    const a=first.session,b=second.session
    assert.equal(a.sessionId,again.session.sessionId)
    assert.notEqual(a.sessionId,b.sessionId);assert.notEqual(a.tableSessionId,b.tableSessionId)
    assert.equal(a.isSharedTable,false);assert.equal(a.tableNumber,null)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM table_sessions')).rows[0].n,2)
    const setup=await api('/cashier/order-setup')
    const body={settingsRevision:setup.settingsRevision,items:[{menuItemId:dish,quantity:1,orderType:'take_away'}]}
    await api('/public/orders',{session:a,key:randomUUID(),body:{...body,items:[{...body.items[0],orderType:'dine_in'}]},status:400})
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM orders')).rows[0].n,0)
    const orderKey=randomUUID()
    const [one,two]=await Promise.all([
      api('/public/orders',{session:a,key:orderKey,body,status:201}),
      api('/public/orders',{session:b,key:randomUUID(),body,status:201}),
    ])
    assert.match(one.order.pickupCode,/^T\d{3,}$/);assert.notEqual(one.order.pickupCode,two.order.pickupCode)
    assert.equal(one.order.pickupReference,'8821')
    const retry=await api('/public/orders',{session:a,key:orderKey,body})
    assert.equal(retry.order.id,one.order.id);assert.equal(retry.order.pickupCode,one.order.pickupCode)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM order_push_deliveries')).rows[0].n,2)
    const own=(await api('/public/orders',{session:a})).orders,others=(await api('/public/orders',{session:b})).orders
    assert.deepEqual(own.map(o=>o.id),[one.order.id]);assert.deepEqual(others.map(o=>o.id),[two.order.id])
    await api('/public/orders/'+one.order.id+'/cancel',{session:b,method:'PATCH',status:409})
    await api('/public/orders',{session:{sessionId:randomUUID()},status:401})
    await api('/public/customer-session',{session:a})
    await api('/public/customer-session',{session:a,body:{customerNickname:'JJS1234'},method:'PATCH'})
    assert.equal((await api('/public/orders',{session:a})).orders[0].pickupReference,'8821','Order reference is an immutable snapshot')
    const pending=await api('/cashier/pending-orders'),kitchen=await api('/kitchen/orders'),adminOrders=await api('/admin/orders')
    for(const list of [pending.orders,kitchen.orders,adminOrders.orders]) assert.equal(list.find(o=>o.id===one.order.id).pickupCode,one.order.pickupCode)
    assert.ok(pending.orders.find(o=>o.id===one.order.id).isWalkIn)
    await api(`/cashier/walk-in-visits/${a.tableSessionId}/tables`,{status:409})
    const detail=(await api('/cashier/orders/'+one.order.id)).order
    const payment=await api('/cashier/payments',{status:201,body:{requestId:randomUUID(),orderIds:[detail.id],versions:{[detail.id]:detail.version},paymentMethod:'Cash',cashReceived:100,expectedAmount:Number(detail.grandTotal),discount:{type:'percentage',value:0},selections:detail.items.map(i=>({itemId:i.id,quantity:i.quantity}))}})
    assert.ok(payment.payment.receiptNumber)
    for(const [expectedStatus,status] of [['received','preparing'],['preparing','ready']]) {
      const fresh=(await api('/cashier/orders/'+one.order.id)).order
      await api('/kitchen/orders/'+one.order.id+'/status',{body:{expectedStatus,status,expectedVersion:fresh.version},method:'PATCH'})
    }
    const handoff=(await api('/staff/handoffs')).orders.find(o=>o.id===one.order.id)
    assert.equal(handoff.pickupCode,one.order.pickupCode)
    await api('/staff/orders/'+one.order.id+'/handoff',{method:'PATCH',body:{itemId:detail.items[0].id,quantity:1,expectedVersion:handoff.version}})
    assert.equal((await api('/public/customer-session',{session:a})).session.visitStatus,'completed')
    assert.equal((await api('/public/orders',{session:a})).orders[0].pickupCode,one.order.pickupCode,'Completed visit stays readable')
    assert.equal((await api('/public/orders',{session:a,key:orderKey,body})).order.id,one.order.id,'Lost committed response recovers after completion')
    await api('/public/orders',{session:a,key:randomUUID(),body,status:409})
    await pool.query("UPDATE shop_settings SET config=jsonb_set(config,'{acceptingOrders}','false'::jsonb)")
    await api('/public/orders',{session:b,key:randomUUID(),body,status:409})
    await api('/public/takeaway/join',{key:randomUUID(),body:{reference:'new'},status:409})
    assert.equal((await api('/public/orders',{session:b})).orders.length,1,'Paused ordering preserves previous orders')
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));await pool?.end()
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',[name])
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);await admin.end()
  }
})
