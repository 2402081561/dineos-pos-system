import assert from 'node:assert/strict'
import test from 'node:test'
import {randomUUID} from 'node:crypto'
import {createCustomerVisitStorage} from '../src/utils/customerVisitStorage.js'
import {buildKitchenTicket} from '../src/utils/kitchenTicket.js'
import {customerOrderLabel} from '../src/utils/customerOrder.js'
import {orderLocationLabel} from '../src/utils/orderLocation.js'
import {bundleHarness,hookRuntime,findElement,flush,memoryStorage} from './helpers/hookHarness.mjs'

const session={sessionId:randomUUID(),tableSessionId:randomUUID(),tableNumber:null,customerNickname:'8821',isTakeawayQr:true,isSharedTable:false,visitStatus:'active'}
async function withStorage(fn) {
  const previous=new Map(),storage=memoryStorage()
  for(const [name,value] of Object.entries({window:{sessionStorage:storage},sessionStorage:storage})) {
    previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})
  }
  try {await fn(storage)} finally {for(const [name,value] of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
}
test('private no-table session survives refresh; ordinary invalid table sessions remain rejected',()=>{
  const a=memoryStorage(),b=memoryStorage(),one=createCustomerVisitStorage({getStorage:()=>a}),two=createCustomerVisitStorage({getStorage:()=>b})
  one.saveSession(session);two.saveSession({...session,sessionId:randomUUID(),tableSessionId:randomUUID()})
  assert.deepEqual(one.readSession(),session);assert.notEqual(one.readSession().sessionId,two.readSession().sessionId)
  one.saveSession({...session,visitStatus:'completed'});assert.equal(one.readSession().visitStatus,'completed')
  const invalid=createCustomerVisitStorage({getStorage:()=>memoryStorage()});invalid.saveSession({...session,isTakeawayQr:false});assert.equal(invalid.readSession(),null)
})
test('real private cart forces take-away, persists exact pending order and blocks dine-in mutations',()=>withStorage(async()=>{
  const runtime=hookRuntime()
  const h=await bundleHarness(`export {default as Cart} from './src/context/CartProvider.jsx';export {customerVisitStorage as store} from './src/utils/customerVisitStorage.js';export {fixture} from 'takeaway-fixture'`,runtime,{
    'takeaway-fixture':`export const fixture={session:${JSON.stringify(session)}}`,
    useCustomerSession:"import {fixture} from 'takeaway-fixture';export default ()=>({session:fixture.session})",
  })
  try {
    h.store.saveSession(session)
    const view=()=>runtime.render(h.Cart).props.value
    assert.equal(view().addToCart({id:randomUUID(),name:'Test rice',price:9,isAvailable:true},2),true)
    assert.equal(view().cartItems[0].orderType,'take_away')
    assert.match(view().changeItemOrderType(view().cartItems[0].cartItemId,'dine_in'),/take-away items only/)
    const request=view().prepareOrderRequest(2)
    assert.equal(view().prepareOrderRequest(9),request)
    assert.equal(h.store.readDraft(session).orderRequest.id,request)
    assert.equal(h.store.readDraft(session).items[0].orderType,'take_away')
    h.fixture.session={...session,visitStatus:'completed'}
    assert.equal(view().addToCart({id:'other',name:'x',price:9,isAvailable:true}),false)
  } finally {runtime.cleanup()}
}))
async function joinHarness() {
  const runtime=hookRuntime()
  const h=await bundleHarness(`export {default as Join} from './src/pages/customer/TakeawayJoin.jsx';export {fixture} from 'takeaway-fixture'`,runtime,{
    'takeaway-fixture':`export const fixture={session:null,posts:[],starts:[],navigation:[],fail:false,hasDraft:false,next:${JSON.stringify(session)}}`,
    useCustomerLanguage:'export default ()=>({t:text=>text})',
    useCustomerSession:"import {fixture} from 'takeaway-fixture';export default ()=>({session:fixture.session,isRestoring:false,clearSession:async()=>{fixture.session=null},startSession:(...args)=>fixture.starts.push(args)})",
    customerVisitStorage:"import {fixture} from 'takeaway-fixture';export const customerVisitStorage={readDraft:()=>({items:fixture.hasDraft?[{}]:[]})}",
    customerApi:"import {fixture} from 'takeaway-fixture';export async function getTakeawayQrConfig(){return {enabled:true,isAcceptingOrders:true}};export async function joinTakeawayQr(reference,key){fixture.posts.push({reference,key});if(fixture.fail)throw new TypeError('lost');return fixture.next};export async function getCustomerSession(){return fixture.next}",
  })
  const view=()=>runtime.render(h.Join)
  view();runtime.effects();await flush()
  return {...h,runtime,view}
}
test('same QR join is explicit and lost-response retry after refresh keeps its private key/reference',()=>withStorage(async()=>{
  const first=await joinHarness();let second
  try {
    assert.equal(first.fixture.posts.length,0)
    findElement(first.view(),n=>n.type==='input').props.onChange({target:{value:'8821'}})
    first.fixture.fail=true
    await findElement(first.view(),n=>n.type==='form').props.onSubmit({preventDefault(){}})
    const sent=first.fixture.posts[0];assert.ok(sent.key)
    first.runtime.cleanup();second=await joinHarness()
    assert.equal(findElement(second.view(),n=>n.type==='input').props.value,'8821')
    assert.equal(second.fixture.posts.length,0)
    await findElement(second.view(),n=>n.type==='form').props.onSubmit({preventDefault(){}})
    assert.deepEqual(second.fixture.posts,[sent])
    assert.equal(second.fixture.starts[0][0],null);assert.equal(second.fixture.starts[0][6].isTakeawayQr,true)
    assert.equal(second.fixture.navigation[0][0],'/menu')
  }finally{first.runtime.cleanup();second?.runtime.cleanup()}
}))
test('scanning a takeaway QR cannot overwrite an existing table cart or automatically join',()=>withStorage(async()=>{
  const h=await joinHarness()
  try {
    h.fixture.session={...session,isTakeawayQr:false,tableNumber:'1'};h.fixture.hasDraft=true
    assert.equal(findElement(h.view(),n=>n.type==='form'),null)
    assert.equal(findElement(h.view(),n=>n.props?.children==='Switch to take-away ordering'),null)
    assert.ok(findElement(h.view(),n=>n.props?.to==='/cart'))
    assert.equal(h.fixture.posts.length,0)
  }finally{h.runtime.cleanup()}
}))
test('pickup identity is clear in customer/cashier labels and kitchen ticket; dine-in stays unchanged',()=>{
  const order={orderNumber:'20261107-001',createdAt:new Date().toISOString(),status:'received',isWalkIn:true,pickupCode:'T003',pickupReference:'8821',orderType:'take_away',items:[{name:'菜',kitchenName:'cont kt',quantity:2,orderType:'take_away'}]}
  assert.equal(customerOrderLabel(order),'T003');assert.equal(orderLocationLabel(order),'T003 · 8821')
  const ticket=buildKitchenTicket(order)
  assert.deepEqual(ticket.rows.slice(1,3).map(row=>row.left),['T003','8821'])
  assert.ok(ticket.rows.some(row=>row.left==='2× cont kt'))
  assert.equal(ticket.rows.some(row=>row.left.includes('20261107-001')),false)
  const dineIn=buildKitchenTicket({...order,isWalkIn:false,pickupCode:null,pickupReference:null,tableNumber:1,items:[{...order.items[0],orderType:'dine_in'}]})
  assert.equal(dineIn.rows[1].left,'1')
})
