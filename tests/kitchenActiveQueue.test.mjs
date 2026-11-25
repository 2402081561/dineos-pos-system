import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

async function setup() {
  const runtime = hookRuntime()
  const h = await bundleHarness("export {default as Dashboard} from './src/pages/kitchen/Dashboard.jsx';export {fixture} from './src/hooks/useKitchenOrders';export {default as Card} from './src/components/kitchen/PrintableKitchenOrderCard'", runtime, {
    useCustomerLanguage: 'export default ()=>({t:text=>text})',
    useKitchenOrders: `export const fixture={orders:[{id:'pending',status:'preparing'},{id:'done',status:'ready'}],fail:false,resolve:null,refreshes:0};export default ()=>({orders:fixture.orders,isLoading:false,error:'',newOrderIds:new Set(),refresh:async()=>{fixture.refreshes++;fixture.orders=fixture.orders.map(o=>o.id==='pending'?{...o,status:'ready'}:o)}})`,
    adminApiService: `import {fixture} from './useKitchenOrders';export async function updateSupabaseKitchenOrderStatus(){if(fixture.fail)throw Error('offline');await new Promise(resolve=>{fixture.resolve=resolve})}`,
    PrintableKitchenOrderCard: 'export default function KitchenCard(){return null}',
  })
  const render = () => runtime.render(h.Dashboard)
  const card = (tree,id) => findElement(tree,n=>n.type===h.Card&&n.props.order.id===id)
  return {...h,render,card}
}
test('default queue hides ready tickets; Ready tab keeps them accessible', async()=>{
  const h=await setup();let tree=h.render()
  assert(h.card(tree,'pending'));assert.equal(h.card(tree,'done'),null)
  const ready=findElement(tree,n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children[0]==='Kitchen ready')
  ready.props.onClick();tree=h.render()
  assert(h.card(tree,'done'));assert.equal(h.card(tree,'pending'),null)
})
test('ticket disappears only after successful status save and refreshed snapshot',async()=>{
  const h=await setup();const first=h.render()
  const update=h.card(first,'pending').props.onUpdateStatus('pending','ready','preparing',1)
  assert(h.card(h.render(),'pending'),'Do not hide while request is unconfirmed')
  h.fixture.resolve();await update
  assert.equal(h.fixture.refreshes,1)
  assert.equal(h.card(h.render(),'pending'),null)
})
test('failed status save retains ticket in active queue',async()=>{
  const h=await setup();h.fixture.fail=true
  const log=console.error;console.error=()=>{}
  try{await h.card(h.render(),'pending').props.onUpdateStatus('pending','ready','preparing',1)}finally{console.error=log}
  assert(h.card(h.render(),'pending'));assert.equal(h.fixture.refreshes,0)
})
