import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { notificationSupport, enableOrderNotifications, disableOrderNotifications, notificationStatus } from '../src/utils/orderNotifications.js'
import { staffReturnPath } from '../src/utils/staffReturnPath.js'
import { memoryStorage } from './helpers/hookHarness.mjs'

function browserFixture({ permission='default', ios=false, standalone=false } = {}) {
  const calls=[]
  let subscription=null
  const registration={active:{scriptURL:'https://orders.example.test/order-notifications-sw.js'},pushManager:{async getSubscription(){return subscription},async subscribe(options){calls.push('subscribe');subscription={options,toJSON:()=>({endpoint:'endpoint',keys:{}}),async unsubscribe(){calls.push('unsubscribe');subscription=null;return true}};return subscription}},getNotifications:async()=>[]}
  const browser={isSecureContext:true,location:{origin:'https://orders.example.test'},PushManager:class{},Notification:{permission,async requestPermission(){calls.push('permission');this.permission='granted';return 'granted'}},navigator:{userAgent:ios?'iPhone':'Android Chrome',serviceWorker:{async register(){calls.push('register');return registration},getRegistration:async()=>registration,ready:Promise.resolve(registration)}},matchMedia:()=>({matches:standalone})}
  const config={enabled:true,publicKey:'AQID',appOrigin:browser.location.origin}
  return {browser,calls,config,registration}
}
async function withBrowser(fn, options) {
  const h=browserFixture(options), previous=new Map()
  for (const [name,value] of Object.entries({window:h.browser,navigator:h.browser.navigator,localStorage:memoryStorage()})) {
    previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})
  }
  try {await fn(h)} finally {for(const [name,value] of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
}
test('iPhone requires home-screen installation; Android uses feature detection; blocked/HTTP browsers fail clearly',()=>{
  const ios=browserFixture({ios:true}).browser
  assert.equal(notificationSupport(ios),'install')
  assert.equal(notificationSupport(browserFixture({ios:true,standalone:true}).browser),'supported')
  assert.equal(notificationSupport(browserFixture().browser),'supported')
  assert.equal(notificationSupport({...ios,isSecureContext:false}),'https')
  assert.equal(notificationSupport(browserFixture({permission:'denied'}).browser),'denied')
})
test('enabling is explicit, prompts before asynchronous work, and retries use same browser subscription/device',()=>withBrowser(async(h)=>{
  const posts=[], request=async(path,options={})=>{h.calls.push(options.method||'GET');if(options.method==='POST')posts.push(options.body);return{}}
  const promise=enableOrderNotifications(request,{config:h.config,userId:'cashier-A',language:'zh'})
  assert.deepEqual(h.calls,['permission'],'Permission request must run in the tap gesture')
  await promise
  await enableOrderNotifications(request,{config:h.config,userId:'cashier-A',language:'zh'})
  assert.equal(h.calls.filter(x=>x==='subscribe').length,1)
  assert.equal(posts[0].deviceId,posts[1].deviceId)
  assert.deepEqual(posts[0].subscription,posts[1].subscription)
  await assert.rejects(enableOrderNotifications(request,{config:h.config,userId:'other',language:'zh'}),/switching accounts/)
}))
test('failed server registration is not reported enabled; retry retains device identity',()=>withBrowser(async(h)=>{
  let fail=true;const devices=[]
  const request=async(path,options={})=>{
    if(options.method==='POST'){devices.push(options.body.deviceId);if(fail)throw Error('network')}
    return path.endsWith('/config')?h.config:{active:false}
  }
  await assert.rejects(enableOrderNotifications(request,{config:h.config,userId:'A'}),/network/)
  assert.equal((await notificationStatus(request,'A')).active,false)
  fail=false;await enableOrderNotifications(request,{config:h.config,userId:'A'})
  assert.equal(devices[0],devices[1])
}))
test('logout/off disables only owning account and unsubscribes locally even when backend is offline',()=>withBrowser(async(h)=>{
  const request=async()=>({})
  await enableOrderNotifications(request,{config:h.config,userId:'A'})
  await disableOrderNotifications(request,'B')
  assert.equal(h.calls.includes('unsubscribe'),false)
  await disableOrderNotifications(async()=>{throw Error('offline')},'A')
  assert.equal(h.calls.includes('unsubscribe'),true)
  assert.equal(await h.registration.pushManager.getSubscription(),null)
}))
test('notification worker always displays pushes, restricts links and preserves other work windows',async()=>{
  const handlers={},shown=[],opened=[],focused=[]
  const scope={location:{origin:'https://orders.example.test'},registration:{showNotification:async(title,options)=>shown.push({title,...options})},addEventListener:(name,fn)=>handlers[name]=fn}
  const clients={matchAll:async()=>[{url:'https://orders.example.test/cashier/new-order',navigate:()=>{throw Error('Must not navigate draft')},focus:()=>focused.push(true)}],openWindow:async(url)=>opened.push(url)}
  vm.runInNewContext(await readFile(new URL('../public/order-notifications-sw.js',import.meta.url),'utf8'),{self:scope,clients,URL,encodeURIComponent})
  let work
  const waitUntil=(promise)=>{work=promise}
  handlers.push({data:{json:()=>{throw Error('bad')}},waitUntil});await work
  assert.equal(shown.length,1)
  const id='95a76de0-1dd3-4127-b18d-699d1d1aa551'
  handlers.push({data:{json:()=>({kind:'takeaway',orderId:id,title:'new',tag:'same'})},waitUntil});await work
  assert.equal(shown[1].data.path,'/cashier?orderId='+id)
  handlers.notificationclick({notification:{data:{path:'https://attacker.test'},close(){}},waitUntil});await work
  assert.deepEqual(opened,['https://orders.example.test/cashier']);assert.equal(focused.length,0)
  handlers.notificationclick({notification:{data:shown[1].data,close(){}},waitUntil});await work
  assert.equal(opened[1],'https://orders.example.test/cashier?orderId='+id)
})
test('notification destination survives login for admin/cashier without external or cross-role redirects',()=>{
  const destination='/cashier?orderId=95a76de0-1dd3-4127-b18d-699d1d1aa551'
  assert.equal(staffReturnPath('admin',destination),destination)
  assert.equal(staffReturnPath('cashier',destination),destination)
  assert.equal(staffReturnPath('kitchen',destination),'/kitchen')
  for (const bad of ['//evil.test','https://evil.test','/cashierevil','/\\evil.test','/admin/login']) assert.equal(staffReturnPath('cashier',bad),'/cashier')
})
