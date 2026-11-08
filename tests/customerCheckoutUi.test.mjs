import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bundleHarness, hookRuntime, findElement, flush } from './helpers/hookHarness.mjs'

const language = `export default ()=>({t:(text,options={})=>text.replace(/{{(\\w+)}}/g,(match,key)=>options[key]??match),statusLabel:text=>text,formatDate:()=> '31 Oct 2026, 12:00'})`
function text(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node !== 'object') return String(node)
  if (Array.isArray(node)) return node.map(text).join(' ')
  return text(node.props?.children)
}

test('compact cart row preserves exact-line packing, split-one, options, notes and quantity handlers', async () => {
  const runtime = hookRuntime()
  const { Row } = await bundleHarness(`export {default as Row} from './src/components/customer/CartItemRow.jsx'`, runtime, {useCustomerLanguage:language})
  const calls = []
  const props = { item:{name:'Noodles',orderType:'dine_in',displayQuantity:2,displayPrice:9,specialInstructions:'No onion'},disabled:false,onOrderType:(...args)=>calls.push(args),onRemove:()=>calls.push('remove'),onQuantity:(n)=>calls.push(n) }
  try {
    const view = runtime.render(Row, props)
    const selector = findElement(view, node=>node.type?.name==='OrderTypeSelector')
    selector.props.onChange('take_away')
    findElement(view, node=>node.type==='button' && text(node)==='Pack 1 separately').props.onClick()
    const quantity = findElement(view, node=>node.type?.name==='QuantitySelector')
    quantity.props.onIncrease(); quantity.props.onDecrease()
    findElement(view,node=>node.props?.['aria-label']==='Remove Noodles from cart').props.onClick()
    assert.deepEqual(calls,[['take_away'],['take_away',1],3,1,'remove'])
    assert.match(text(view),/No onion/)
    const locked = runtime.render(Row,{...props,disabled:true,item:{...props.item,issue:'Sold out'}})
    assert.equal(findElement(locked,node=>node.type?.name==='QuantitySelector').props.disabled,true)
    assert.equal(findElement(locked,node=>node.type?.name==='OrderTypeSelector').props.disabled,true)
    assert.equal(findElement(locked,node=>node.props?.['aria-label']==='Remove Noodles from cart').props.disabled,true)
  } finally {runtime.cleanup()}
})

test('tracking totals use stored order charges, hide zero fees and retain discounts', async () => {
  const runtime = hookRuntime()
  const { Totals } = await bundleHarness(`export {default as Totals} from './src/components/customer/CustomerOrderTotals.jsx'`,runtime,{useCustomerLanguage:language})
  try {
    assert.doesNotMatch(text(runtime.render(Totals,{order:{subtotal:9,serviceCharge:0,sst:0,grandTotal:9}})),/Service charge|SST|Discount/)
    const charged=text(runtime.render(Totals,{order:{subtotal:20,serviceCharge:2,sst:1.2,discountAmount:1,grandTotal:22.2}}))
    assert.match(charged,/Service charge/);assert.match(charged,/SST/);assert.match(charged,/Discount/);assert.match(charged,/22.20/)
  } finally {runtime.cleanup()}
})

test('tracking keeps received, partial payment, paid-but-uncollected and cancelled states separate', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as Tracking} from './src/pages/customer/Tracking.jsx';export {fixture} from 'checkout-fixture'`,runtime,{
    'checkout-fixture':`export const fixture={requireHandoff:true,order:{id:'local-order',tableOrderNumber:1,tableNumber:'1',createdAt:'2026-10-31T04:00:00Z',status:'received',paymentStatus:'pending',paidAmount:0,subtotal:18,grandTotal:18,orderType:'mixed',items:[{name:'Rice',quantity:2,price:9,orderType:'take_away'}]}}`,
    useCustomerLanguage:language,
    useShopSettings:`import {fixture} from 'checkout-fixture';export default ()=>({config:{requireHandoffConfirmation:fixture.requireHandoff}})`,
    useLatestOrder:`import {fixture} from 'checkout-fixture';export default ()=>({order:fixture.order,orders:[fixture.order],isLoading:false,error:''})`,
  })
  try {
    let view=runtime.render(h.Tracking)
    assert.equal(text(findElement(view,node=>node.type==='h1')),'Order received')
    assert.match(text(view),/Order received does not mean paid/)
    assert.match(text(view),/Unpaid/)
    h.fixture.order={...h.fixture.order,paidAmount:9,paymentStatus:'partial'}
    view=runtime.render(h.Tracking);assert.match(text(view),/Partially paid/)
    h.fixture.order={...h.fixture.order,paidAmount:18,paymentStatus:'paid',status:'ready',orderType:'take_away'}
    view=runtime.render(h.Tracking)
    assert.doesNotMatch(text(findElement(view,node=>node.type==='h1')),/Payment Completed/)
    assert.match(text(view),/Please collect your take-away order/)
    assert.doesNotMatch(text(view),/Order received does not mean paid/)
    h.fixture.requireHandoff=false
    view=runtime.render(h.Tracking)
    const progress=findElement(view,node=>node.props?.['aria-label']==='Order progress')
    assert.doesNotMatch(text(progress),/Collected/)
    assert.match(text(progress),/Ready for collection/)
    h.fixture.requireHandoff=true
    h.fixture.order={...h.fixture.order,status:'served'}
    view=runtime.render(h.Tracking);assert.equal(text(findElement(view,node=>node.type==='h1')),'Payment Completed')
    h.fixture.order={...h.fixture.order,status:'cancelled'}
    view=runtime.render(h.Tracking)
    assert.equal(findElement(view,node=>node.props?.['aria-label']==='Order progress'),null)
    assert.ok(findElement(view,node=>node.props?.title==='Order cancelled'))
  } finally {runtime.cleanup()}
})

test('cart retains fee visibility, total portions and blocks duplicate submits through both controls', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as Cart} from './src/pages/customer/Cart.jsx';export {fixture} from 'cart-ui-fixture'`, runtime,{
    'cart-ui-fixture':`export const fixture={config:{serviceChargeRate:0,sstRate:0},sent:0,finish:undefined,locked:false,items:[{menuItemId:'rice',cartItemId:'row',name:'Rice',unitPrice:9,quantity:2,orderType:'dine_in'}]}`,
    useCustomerLanguage:language,
    useShopSettings:`import {fixture} from 'cart-ui-fixture';export default ()=>({config:fixture.config,settings:{isAcceptingOrders:true,revision:1},isLoading:false,error:''})`,
    useCart:`import {fixture} from 'cart-ui-fixture';export default ()=>({cartItems:fixture.items,isCartLocked:fixture.locked,prepareOrderRequest:()=> 'same-request',getOrderRequest:()=>({settingsRevision:1}),completeOrderRequest(){},rejectOrderRequest(){}})`,
    useCustomerSession:`export default ()=>({session:{sessionId:'visit',tableNumber:'1',isSharedTable:true}})`,
    useCustomerToast:`export default ()=>({showToast(){}})`,
    customerApi:`export async function getPublicMenu(){return [{id:'rice',name:'Rice',price:9,isAvailable:true}]}`,
    pollSubscription:`import {fixture} from 'cart-ui-fixture';export function subscribePoll(get,onItems,onError){fixture.menuError=onError;fixture.menuRecover=()=>onItems([{id:'rice',name:'Rice',price:9,isAvailable:true}]);fixture.menuRecover();return ()=>{}}`,
    orderService:`import {fixture} from 'cart-ui-fixture';export const getCartValidationIssues=()=>[];export const createOrder=()=>{fixture.sent++;return new Promise(resolve=>fixture.finish=()=>resolve({id:'demo'}))};export const isMenuItemOrderable=()=>true`,
  })
  try {
    let loading=runtime.render(h.Cart)
    assert.equal(findElement(loading,node=>node.type?.name==='CartCheckoutBar').props.total,null)
    assert.doesNotMatch(text(loading),/no longer on the menu/)
    runtime.effects()
    let view=runtime.render(h.Cart)
    assert.doesNotMatch(text(view),/Service charge|SST/)
    assert.match(text(findElement(view,node=>node.type==='h1')),/\( 2 \)/)
    const bar=findElement(view,node=>node.type?.name==='CartCheckoutBar')
    assert.equal(bar.props.total,18);assert.equal(bar.props.disabled,false)
    h.fixture.menuError(new Error('offline'))
    view=runtime.render(h.Cart)
    assert.equal(findElement(view,node=>node.type?.name==='CartCheckoutBar').props.total,null)
    assert.equal(findElement(view,node=>node.type?.name==='CartCheckoutBar').props.disabled,true)
    assert.doesNotMatch(text(view),/no longer on the menu/)
    h.fixture.menuRecover(); view=runtime.render(h.Cart)
    const recoveredBar=findElement(view,node=>node.type?.name==='CartCheckoutBar')
    assert.equal(recoveredBar.props.total,18)
    const pending=recoveredBar.props.onSubmit()
    const again=recoveredBar.props.onSubmit()
    assert.equal(h.fixture.sent,1)
    h.fixture.finish();await pending;await again;await flush()
    h.fixture.config={serviceChargeRate:10,sstRate:6}
    view=runtime.render(h.Cart);assert.match(text(view),/Service charge/);assert.match(text(view),/SST/)
    h.fixture.locked=true
    view=runtime.render(h.Cart)
    assert.equal(findElement(view,node=>node.type?.name==='CartItemRow').props.disabled,true)
    assert.equal(findElement(view,node=>node.type?.name==='CartCheckoutBar').props.label,'Retry previous order')
  } finally {runtime.cleanup()}
})

test('cart and tracking reset inherited menu scroll only on route changes, not on cart updates', async () => {
  const runtime=hookRuntime()
  const calls=[]
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window')
  Object.defineProperty(globalThis,'window',{configurable:true,value:{scrollTo:options=>calls.push(options)}})
  const h=await bundleHarness(`export {default as Layout} from './src/layouts/CustomerLayout.jsx';export {fixture} from 'scroll-fixture'`,runtime,{
    'scroll-fixture':`export const fixture={pathname:'/menu'}`,
    useCustomerLanguage:language,
    useCustomerSession:`export default ()=>({session:{tableNumber:1}})`,
    useCart:`export default ()=>({cartItems:[],cartItemCount:0,isCartLocked:false})`,
    useShopSettings:`export default ()=>({settings:{isAcceptingOrders:true},isLoading:false})`,
    PortalLayout:`export default ()=>null`,
    'react-router-dom':`import {fixture} from 'scroll-fixture';export const Link=()=>null;export const NavLink=()=>null;export const useLocation=()=>fixture`,
  })
  try {
    const render=()=>{const wrapper=runtime.render(h.Layout);runtime.render(wrapper.type);runtime.effects()}
    render();assert.equal(calls.length,0)
    h.fixture.pathname='/cart';render();assert.equal(calls.length,1)
    render();assert.equal(calls.length,1)
    h.fixture.pathname='/tracking';render();assert.equal(calls.length,2)
    assert.deepEqual(calls[0],{top:0,left:0,behavior:'instant'})
  } finally {runtime.cleanup();if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window}
})
