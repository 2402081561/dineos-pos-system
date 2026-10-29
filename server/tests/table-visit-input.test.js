import {test} from 'node:test'
import assert from 'node:assert/strict'
import {moveInput,orderVersions,registerTableVisitMoveRoutes} from '../src/tableVisitMoves.js'
import {identifierInput,registerOrderIdentifierRoutes} from '../src/orderIdentifiers.js'
const a='a98b5086-dff8-4aca-b8a7-f42459604745',b='66b195a3-18e0-4f2d-a337-42797a0ba97f',c='91d5ac84-8243-4caf-8672-180964979c59'
const input={requestId:a,sourceTableId:a,targetTableId:b,sourceSessionId:c,targetSessionId:null,mode:'move',sourceOrders:[{id:c,version:1}],targetOrders:[]}
test('table move validates exact visits, different destinations, mode and version snapshots',()=>{
  assert.deepEqual(moveInput(input),input)
  for(const patch of [{sourceTableId:'fake'},{targetTableId:a},{sourceSessionId:null},{targetSessionId:undefined},{mode:'merge'},{sourceOrders:[{id:c,version:1},{id:c,version:2}]},{targetOrders:[{id:a,version:-1}]}])assert.throws(()=>moveInput({...input,...patch}))
  assert.deepEqual(orderVersions([{id:c,version:2},{id:a,version:1}]),[{id:c,version:2},{id:a,version:1}])
  assert.equal(moveInput({...input,mode:'merge',targetSessionId:b}).mode,'merge')
})
test('identifiers accept plain text and reject control characters without accepting price or state edits',()=>{
  assert.deepEqual(identifierInput({ticketSeat:' 8899 ',ticketReference:' QAA1234 ',grandTotal:0,status:'paid'}),{ticketSeat:'8899',ticketReference:'QAA1234'})
  for(const value of ['x'.repeat(81),'a\nb','\u001b@',3,{},'\u202e'])assert.throws(()=>identifierInput({ticketReference:value}))
})
test('table operations require admin/cashier and identifier reads/writes require operational roles',()=>{
  const registered=[],auth=()=>{},roles=[]
  const app=Object.fromEntries(['get','post','patch'].map((method)=>[method,(path,...handlers)=>registered.push({path,handlers})]))
  const dependencies={pool:{},requireAuthenticatedUser:auth,requireRole:(...allowed)=>{const guard={allowed};roles.push(guard);return guard}}
  registerTableVisitMoveRoutes(app,dependencies);registerOrderIdentifierRoutes(app,dependencies)
  assert.deepEqual(roles.map((guard)=>guard.allowed),[['admin','cashier'],['admin','cashier','kitchen']])
  for(const route of registered){assert.equal(route.handlers[0],auth);assert.equal(route.handlers[1],route.path.includes('table-visits')?roles[0]:roles[1])}
})
