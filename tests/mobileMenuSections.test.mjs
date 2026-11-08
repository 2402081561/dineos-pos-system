import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupMobileMenuItems, visibleMenuSection } from '../src/utils/mobileMenuSections.js'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

test('continuous menu groups preserve category order, line order, sold-out items and uncategorised dishes', () => {
  const items=[{id:'a',categoryId:'rice'},{id:'b',categoryId:'drinks'},{id:'c',categoryId:'rice',isAvailable:false},{id:'d',categoryId:'removed'}]
  const groups=groupMobileMenuItems([{id:'drinks'},{id:'empty'},{id:'rice'}],items,'Other')
  assert.deepEqual(groups.map(group=>[group.id,group.items.map(item=>item.id)]),[['drinks',['b']],['rice',['a','c']],['uncategorised',['d']]])
  assert.equal(groups[1].items[1].isAvailable,false)
  assert.deepEqual(items.map(item=>item.id),['a','b','c','d'])
})

test('scroll selection follows crossed headings in both directions and selects a short final section at page bottom', () => {
  assert.equal(visibleMenuSection([{id:'rice',top:180},{id:'drinks',top:500}],144),'all')
  assert.equal(visibleMenuSection([{id:'rice',top:144},{id:'drinks',top:500}],144),'rice')
  assert.equal(visibleMenuSection([{id:'rice',top:-300},{id:'drinks',top:100}],144),'drinks')
  assert.equal(visibleMenuSection([{id:'rice',top:100},{id:'drinks',top:400}],144),'rice')
  assert.equal(visibleMenuSection([{id:'rice',top:-300},{id:'drinks',top:400}],144,true),'drinks')
  assert.equal(visibleMenuSection([],144,true),'all')
})

test('search retains only matching sections and navigation targets; popular remains a separate non-duplicated view', async () => {
  const runtime=hookRuntime()
  const h=await bundleHarness(`export {default as Sections} from './src/components/customer/MobileMenuSections.jsx'`,runtime,{useCustomerLanguage:`const t=text=>text;export default ()=>({t})`})
  const items=[{id:'a',categoryId:'rice',name:'Rice A'},{id:'b',categoryId:'drinks',name:'Tea'}]
  const props={categories:[{id:'rice',name:'Rice'},{id:'drinks',name:'Drinks'}],menuItems:items,popularItems:[items[0]],searchTerm:'Tea'}
  try {
    let view=runtime.render(h.Sections,props)
    assert.equal(findElement(view,node=>node.props?.['data-menu-section']==='rice'),null)
    assert.equal(findElement(view,node=>node.type==='button'&&node.props.children.at(-1)==='Rice'),null)
    assert.ok(findElement(view,node=>node.props?.['data-menu-section']==='drinks'))
    view=runtime.render(h.Sections,{...props,searchTerm:''})
    findElement(view,node=>node.type==='button'&&node.props.children.at(-1)==='Popular').props.onClick()
    view=runtime.render(h.Sections,{...props,searchTerm:''})
    assert.ok(findElement(view,node=>node.props?.['data-menu-section']==='popular'))
    assert.equal(findElement(view,node=>node.props?.['data-menu-section']==='rice'),null)
  } finally {runtime.cleanup()}
})

test('actual section navigation follows manual scroll, keeps clicked highlight during smooth jump and cleans up listeners', async () => {
  const runtime=hookRuntime(), listeners=new Map(), frames=new Map(), scrollCalls=[]
  let nextFrame=0
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document')
  const win={scrollY:0,innerHeight:640,matchMedia:()=>({matches:false}),scrollTo:options=>scrollCalls.push(options),requestAnimationFrame:fn=>{const id=++nextFrame;frames.set(id,fn);return id},cancelAnimationFrame:id=>frames.delete(id),addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type)=>listeners.delete(type)}
  Object.defineProperty(globalThis,'window',{configurable:true,value:win})
  Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{scrollHeight:3000}}})
  const h=await bundleHarness(`export {default as Sections} from './src/components/customer/MobileMenuSections.jsx'`,runtime,{useCustomerLanguage:`const t=text=>text;export default ()=>({t})`})
  const props={categories:[{id:'rice',name:'Rice'},{id:'drinks',name:'Drinks'}],menuItems:[{id:'a',name:'Rice A',categoryId:'rice'},{id:'b',name:'Tea',categoryId:'drinks',isAvailable:false}],popularItems:[],searchTerm:'',isLoading:false,error:''}
  const positions={rice:180,drinks:700}
  const view=()=>runtime.render(h.Sections,props)
  const active=()=>findElement(view(),node=>node.type==='button'&&node.props['aria-pressed'])?.props.children.at(-1)
  const flushFrames=()=>{for(const [id,fn] of [...frames]){frames.delete(id);fn()}}
  try {
    const tree=view()
    findElement(tree,node=>node.props?.id==='mobile-menu-items').props.ref.current={getBoundingClientRect:()=>({top:150}),closest:selector=>({querySelector:()=>({getBoundingClientRect:()=>selector==='.customer-ui'?{bottom:68}:{height:64,bottom:220}})})}
    for(const id of ['rice','drinks'])findElement(tree,node=>node.props?.['data-menu-section']===id).props.ref({getBoundingClientRect:()=>({top:positions[id]})})
    runtime.effects();flushFrames();assert.equal(active(),'All')
    positions.rice=100;listeners.get('scroll')();flushFrames();assert.equal(active(),'Rice')
    positions.drinks=130;listeners.get('scroll')();flushFrames();assert.equal(active(),'Drinks')
    findElement(view(),node=>node.type==='button'&&node.props.children.at(-1)==='Rice').props.onClick()
    assert.equal(active(),'Rice');assert.equal(scrollCalls.at(-1).behavior,'smooth')
    assert.equal(scrollCalls.at(-1).top,0,'Jump offset uses the eventual sticky search height, not its non-sticky bottom')
    listeners.get('scroll')();flushFrames();assert.equal(active(),'Rice','Intermediate categories do not steal clicked highlight')
    positions.rice=100;positions.drinks=700;listeners.get('wheel')();flushFrames();assert.equal(active(),'Rice')
    positions.drinks=130;listeners.get('scroll')();flushFrames();assert.equal(active(),'Drinks')
    runtime.cleanup();assert.equal(listeners.size,0);assert.equal(frames.size,0)
  } finally {runtime.cleanup();if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else delete globalThis.window;if(previousDocument)Object.defineProperty(globalThis,'document',previousDocument);else delete globalThis.document}
})

test('customer food details show sold-out only, without an available badge on orderable food', async () => {
  const runtime=hookRuntime()
  const h=await bundleHarness(`export {default as Details} from './src/pages/customer/FoodDetails.jsx';export {fixture} from 'food-status-fixture'`,runtime,{
    'food-status-fixture':`export const fixture={food:{id:'rice',name:'Rice',price:9,isAvailable:true,optionGroups:[]}}`,
    useMenuItem:`import {fixture} from 'food-status-fixture';export default ()=>({menuItem:fixture.food,category:{name:'Rice'},isLoading:false,error:''})`,
    useCustomerLanguage:`export default ()=>({t:text=>text})`,
    usePreparationEstimate:`export default ()=>({label:'3–4 mins'})`,
    useAddToCartFeedback:`export default ()=>({isBusy:false,addItem(){}})`,
    useShopSettings:`export default ()=>({settings:{isAcceptingOrders:true},isLoading:false,error:''})`,
    'react-router-dom':`export const useParams=()=>({itemId:'rice'});export const Link=()=>null;export const useNavigate=()=>()=>{}`,
  })
  const view=()=>runtime.render(runtime.render(h.Details).type)
  try {
    assert.equal(findElement(view(),node=>node.type==='span'&&node.props.children==='Available'),null)
    assert.equal(findElement(view(),node=>node.type==='span'&&node.props.children==='Sold out'),null)
    h.fixture.food.isAvailable=false
    assert.ok(findElement(view(),node=>node.type==='span'&&node.props.children==='Sold out'))
  } finally {runtime.cleanup()}
})
