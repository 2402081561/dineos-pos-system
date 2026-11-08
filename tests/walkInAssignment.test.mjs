import assert from 'node:assert/strict'
import test from 'node:test'
import { bundleHarness, hookRuntime, findElement, flush, memoryStorage } from './helpers/hookHarness.mjs'
import { assignmentKey, readWalkInAssignment } from '../src/utils/walkInAssignmentStorage.js'

const orderId = '66b195a3-18e0-4f2d-a337-42797a0ba97f', source = 'a98b5086-dff8-4aca-b8a7-f42459604745', tableId = '71bd9d63-516a-4716-bd23-bd2aff018929'
const action = (tree, label) => findElement(tree, (node) => node.props?.onClick && node.props.children === label)
async function harness(storage) {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as Assign} from './src/components/cashier/AssignWalkInTable.jsx';export {fixture} from 'assignment-fixture'`, runtime, {
    'assignment-fixture': `export const fixture={actor:'actor-A',reads:0,posts:[],fail:false,done:false,setup:{source:{tableSessionId:'${source}',orders:[{id:'${orderId}',version:2}],hasPayments:false},tables:[{id:'${tableId}',tableNumber:3,tableSessionId:null,orders:[],unpaidTotal:0,hasPayments:false}]}}`,
    useCustomerLanguage: 'export default ()=>({t:(text)=>text})',
    useAdminAuth: "import {fixture} from 'assignment-fixture';export default ()=>({authUser:{id:fixture.actor}})",
    adminApiService: "import {fixture} from 'assignment-fixture';export async function getWalkInAssignmentTables(){fixture.reads++;return fixture.setup}export async function assignWalkInTable(body){fixture.posts.push(body);if(fixture.fail)throw Object.assign(Error('uncertain'),{status:503});return {tableNumber:3}}",
  })
  const props = { order: { id: orderId, tableSessionId: source, grandTotal: 18, paidAmount: 0 }, onDone: () => { h.fixture.done = true }, onCancel() {} }
  const view = () => runtime.render(h.Assign, props)
  globalThis.sessionStorage = storage
  view(); runtime.effects(); await flush()
  return { ...h, runtime, view }
}
async function withStorage(fn) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), storage = memoryStorage()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: storage })
  try { await fn(storage) } finally { if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous); else delete globalThis.sessionStorage }
}

test('table assignment loads choices without writing and needs an explicit destination/confirmation', () => withStorage(async (storage) => {
  const h = await harness(storage)
  try {
    assert.equal(h.fixture.reads, 1); assert.equal(h.fixture.posts.length, 0)
    assert.equal(action(h.view(), 'Confirm table number').props.disabled, true)
    findElement(h.view(), (node) => node.type === 'select').props.onChange({ target: { value: tableId } })
    assert.equal(action(h.view(), 'Confirm table number').props.disabled, false)
    action(h.view(), 'Confirm table number').props.onClick(); await flush()
    assert.equal(h.fixture.posts.length, 1)
    assert.equal(h.fixture.posts[0].sourceSessionId, source)
    assert.equal(h.fixture.posts[0].targetSessionId, null)
    assert.deepEqual(h.fixture.posts[0].sourceOrders, [{ id: orderId, version: 2 }])
    assert.equal(h.fixture.done, true); assert.equal(readWalkInAssignment('actor-A'), null)
  } finally { h.runtime.cleanup() }
}))

test('occupied destination gets an explicit combine-bills warning and paid bills are blocked', () => withStorage(async (storage) => {
  const h = await harness(storage)
  try {
    h.fixture.setup.tables[0].tableSessionId = 'occupied'
    findElement(h.view(), (node) => node.type === 'select').props.onChange({ target: { value: tableId } })
    assert.ok(action(h.view(), 'Confirm combine bills'))
    assert.ok(findElement(h.view(), (node) => node.type === 'p' && String(node.props.children).startsWith('This table already has a bill.')))
    h.fixture.setup.source.hasPayments = true
    assert.equal(action(h.view(), 'Confirm combine bills').props.disabled, true)
    action(h.view(), 'Confirm combine bills').props.onClick(); await flush()
    assert.equal(h.fixture.posts.length, 0)
    h.fixture.setup.source.hasPayments = false; h.fixture.setup.tables[0].hasPayments = true
    assert.equal(action(h.view(), 'Confirm combine bills').props.disabled, true)
  } finally { h.runtime.cleanup() }
}))

test('lost response survives remount and retries the exact original key without automatically sending', () => withStorage(async (storage) => {
  const first = await harness(storage); let next
  try {
    first.fixture.fail = true
    findElement(first.view(), (node) => node.type === 'select').props.onChange({ target: { value: tableId } })
    action(first.view(), 'Confirm table number').props.onClick(); await flush()
    const original = first.fixture.posts[0]
    assert.ok(readWalkInAssignment('actor-A'))
    first.runtime.cleanup(); next = await harness(storage)
    assert.equal(next.fixture.posts.length, 0); assert.equal(next.fixture.reads, 0)
    action(next.view(), 'Check / retry same assignment').props.onClick(); await flush()
    assert.deepEqual(next.fixture.posts, [original]); assert.equal(next.fixture.done, true)
    assert.equal(storage.getItem(assignmentKey('actor-A')), null)
  } finally { first.runtime.cleanup(); next?.runtime.cleanup() }
}))

test('assignment recovery is actor-scoped; corrupted data fails closed', () => withStorage(async (storage) => {
  storage.setItem(assignmentKey('actor-A'), '{bad')
  assert.equal(readWalkInAssignment('actor-A').damaged, true)
  assert.equal(readWalkInAssignment('actor-B'), null)
  const h = await harness(storage)
  try {
    assert.equal(action(h.view(), 'Check / retry same assignment').props.disabled, true)
    action(h.view(), 'Check / retry same assignment').props.onClick(); await flush()
    assert.equal(h.fixture.posts.length, 0)
  } finally { h.runtime.cleanup() }
}))
