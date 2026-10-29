import {test} from 'node:test'
import assert from 'node:assert/strict'
import {bundleHarness,hookRuntime,findElement,flush,memoryStorage} from './helpers/hookHarness.mjs'

test('saved identifiers load, save with revision, and disable printing while dirty or uncertain',async()=>{
  const runtime=hookRuntime()
  const h=await bundleHarness(`export {default as Editor} from './src/components/common/OrderIdentifiers.jsx';export {fixture} from 'identifier-fixture'`,runtime,{
    'identifier-fixture':`export const fixture={saved:{id:'order',ticketSeat:'8899',ticketReference:'QAA1234',ticketRevision:2},writes:[],fail:false}`,
    useCustomerLanguage:'export default ()=>({t:text=>text})',
    adminApiService:`import {fixture} from 'identifier-fixture';export async function getOrderIdentifiers(){return fixture.saved}export async function saveOrderIdentifiers(id,body){fixture.writes.push({id,body});if(fixture.fail)throw Object.assign(new Error('Lost response'),{status:503});return {...body,id,ticketRevision:3}}`,
  })
  let state
  const props={orderId:'order',onState:value=>{state=value}}
  const view=()=>runtime.render(h.Editor,props)
  try{
    view();runtime.effects();await flush();view();runtime.effects()
    assert.equal(state.ticketReference,'QAA1234');assert.equal(state.canPrint,true)
    const inputs=[]
    const collect=(node)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(collect);return}if(node.type==='input')inputs.push(node);Object.values(node.props??{}).forEach(collect)}
    collect(view());inputs[1].props.onChange({target:{value:'ABC999'}});view();runtime.effects()
    assert.equal(state.canPrint,false)
    const save=findElement(view(),node=>node.props?.children==='Save identifiers'&&node.props?.onClick)
    await save.props.onClick();await flush();view();runtime.effects()
    assert.equal(h.fixture.writes[0].body.expectedRevision,2);assert.equal(state.canPrint,true);assert.equal(state.ticketReference,'ABC999')
    inputs[0].props.onChange({target:{value:'new'}});view();runtime.effects();h.fixture.fail=true
    await findElement(view(),node=>node.props?.children==='Save identifiers'&&node.props?.onClick).props.onClick();await flush();view();runtime.effects()
    assert.equal(state.canPrint,false)
  }finally{runtime.cleanup()}
})

test('move UI never auto-sends; uncertain result survives refresh and retries the original key/body',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),storage=memoryStorage()
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:storage})
  const a='a98b5086-dff8-4aca-b8a7-f42459604745',b='66b195a3-18e0-4f2d-a337-42797a0ba97f',s='91d5ac84-8243-4caf-8672-180964979c59'
  const harness=async()=>{
    const runtime=hookRuntime()
    const h=await bundleHarness(`export {default as Controls} from './src/components/cashier/TableVisitMoveControls.jsx';export {fixture} from 'move-fixture'`,runtime,{
      'move-fixture':`export const fixture={actor:'staff-A',posts:[],fail:true,tables:[{id:'${a}',tableNumber:1,tableSessionId:'${s}',orders:[],unpaidTotal:9,hasPayments:false},{id:'${b}',tableNumber:2,tableSessionId:null,orders:[],unpaidTotal:0,hasPayments:false}]}`,
      useCustomerLanguage:'export default ()=>({t:text=>text})',
      useAdminAuth:`import {fixture} from 'move-fixture';export default ()=>({authUser:{id:fixture.actor}})`,
      adminApiService:`import {fixture} from 'move-fixture';export async function getTableVisits(){return fixture.tables}export async function moveTableVisit(body){fixture.posts.push(body);if(fixture.fail)throw Object.assign(new Error('uncertain'),{status:503});return {targetTableId:'${b}'}}`,
    })
    const props={table:{id:a,tableSessionId:s},onDone:()=>{h.fixture.done=true}}
    return {...h,runtime,view:()=>runtime.render(h.Controls,props)}
  }
  let h,next
  const action=(tree,label)=>findElement(tree,node=>node.props?.children===label&&node.props?.onClick)
  try{
    h=await harness();h.view();h.runtime.effects()
    assert.equal(h.fixture.posts.length,0)
    await action(h.view(),'Load current tables').props.onClick();await flush()
    findElement(h.view(),node=>node.type==='select').props.onChange({target:{value:b}})
    action(h.view(),'Confirm table move / merge').props.onClick();await flush()
    assert.equal(h.fixture.posts.length,1)
    const original=h.fixture.posts[0]
    h.runtime.cleanup();next=await harness();next.view();next.runtime.effects();await flush()
    assert.equal(next.fixture.posts.length,0)
    next.fixture.fail=false;action(next.view(),'Confirm / retry same table move').props.onClick();await flush()
    assert.deepEqual(next.fixture.posts[0],original);assert.equal(next.fixture.done,true)
    assert.equal(storage.getItem('dineos-table-move-v1:staff-A'),null)
  }finally{h?.runtime.cleanup();next?.runtime.cleanup();if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else delete globalThis.sessionStorage}
})
