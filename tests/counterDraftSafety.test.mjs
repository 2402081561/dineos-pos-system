import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hookRuntime, bundleHarness, findElement, flush, memoryStorage } from './helpers/hookHarness.mjs'
import { createCounterDraftStorage, emptyCounterDraft, counterRequestPayload } from '../src/utils/counterDraftStorage.js'

const tableId = 'a98b5086-dff8-4aca-b8a7-f42459604745'
const visitId = '66b195a3-18e0-4f2d-a337-42797a0ba97f'
const itemId = '91d5ac84-8243-4caf-8672-180964979c59'
async function harness() {
  const runtime = hookRuntime()
  const module = await bundleHarness(`
    import NewOrder from './src/pages/cashier/NewOrder.jsx';import useAdminMenu from './src/hooks/useAdminMenu.js';
    import {fixture} from 'counter-fixture';export {NewOrder,useAdminMenu,fixture}
  `, runtime, {
    'counter-fixture': `export const fixture={actorId:'cashier-A',requests:[],committed:new Map(),loseFirst:false,errorStatus:0,malformed:false,setup:{tables:[{id:'${tableId}',tableNumber:1,tableSessionId:'${visitId}'}],items:[{id:'${itemId}',name:'Test rice',price:9,isAvailable:true}],settings:{serviceChargeRate:0,sstRate:0},settingsRevision:1}}`,
    useCustomerLanguage: 'export default ()=>({t:(text,options={})=>text.replace(/{{(\\w+)}}/g,(match,key)=>options[key]??match)})',
    useAdminAuth: `import {fixture} from 'counter-fixture';export default ()=>({authUser:fixture.actorId?{id:fixture.actorId}:null})`,
    deploymentFeatures: 'export const hasSavedTableVisitTools=true',
    'react-router-dom': `export const useSearchParams=()=>[new URLSearchParams('tableId=${tableId}')];export const Link=()=>null`,
    adminApiService: `import {fixture} from 'counter-fixture';export async function getSupabaseCashierOrderSetup(){return fixture.setup}export async function createSupabaseCashierOrder(body){
      fixture.requests.push(body);if(fixture.errorStatus){const error=new Error('Test-only explicit rejection');error.status=fixture.errorStatus;throw error}
      if(fixture.malformed)return {order:{}}
      if(!fixture.committed.has(body.requestId)){fixture.committed.set(body.requestId,{order:{id:'test-'+fixture.committed.size,grandTotal:9,tableOrderNumber:1}});if(fixture.loseFirst){fixture.loseFirst=false;throw new TypeError('Test-only response lost after commit')}}return fixture.committed.get(body.requestId)
    }export async function getTableVisits(){return fixture.setup.tables}export function updateSupabaseMenuFlags(){throw new Error('No real writes')}
    export function subscribeToSupabaseAdminMenu(data,error){fixture.menuData=data;fixture.menuError=error;return()=>{}}`,
  })
  const h = { ...module, runtime }
  h.page = () => runtime.render(h.NewOrder)
  h.action = (name) => findElement(h.page(), (node) => node.props?.['aria-label'] === name)
  h.input = (id, value) => findElement(h.page(), (node) => node.props?.id === id).props.onChange({ target: { value } })
  h.submit = () => findElement(h.page(), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  h.load = async () => { h.page(); runtime.effects(); await flush(); h.page() }
  return h
}
function browserStorage(storage = memoryStorage()) {
  const previous = globalThis.window
  globalThis.window = { sessionStorage: storage }
  return { storage, restore() { if (previous === undefined) delete globalThis.window; else globalThis.window = previous } }
}
const sampleCart = { rice: { menuItemId: itemId, name: 'Test rice', notes: 'No onion', selections: [], quantity: 1, orderType: 'take_away' } }

test('counter identifiers persist through refresh and remain frozen with the original uncertain request',async()=>{
  const browser=browserStorage(),h=await harness();let next
  try{
    await h.load();h.action('Add one Test rice').props.onClick()
    const fields=()=>findElement(h.page(),node=>node.type?.name==='CounterIdentifierFields')
    fields().props.onChange('ticketSeat','8899');fields().props.onChange('ticketReference','QAA1234')
    h.runtime.cleanup();next=await harness();await next.load()
    assert.equal(findElement(next.page(),node=>node.type?.name==='CounterIdentifierFields').props.draft.ticketReference,'QAA1234')
    next.fixture.errorStatus=503;await next.submit()
    const sent=next.fixture.requests[0]
    assert.equal(sent.ticketSeat,'8899');assert.equal(sent.ticketReference,'QAA1234')
    findElement(next.page(),node=>node.type?.name==='CounterIdentifierFields').props.onChange('ticketReference','must not replace')
    next.fixture.errorStatus=0;await next.submit()
    assert.deepEqual(next.fixture.requests[1],sent)
  }finally{h.runtime.cleanup();next?.runtime.cleanup();browser.restore()}
})

test('counter storage is per actor/tab, validates drafts, and never silently discards damaged pending data', () => {
  const storage = memoryStorage(), first = createCounterDraftStorage({ getStorage: () => storage })
  const draft = { ...emptyCounterDraft('cashier-A', tableId), cart: sampleCart, expectedTableSessionId: visitId }
  first.save('cashier-A', draft)
  assert.deepEqual(createCounterDraftStorage({ getStorage: () => storage }).read('cashier-A').cart, sampleCart)
  assert.deepEqual(first.read('cashier-B').cart, {})
  assert.deepEqual(createCounterDraftStorage({ getStorage: () => memoryStorage() }).read('cashier-A').cart, {})
  const request = { requestId: crypto.randomUUID(), payload: counterRequestPayload(draft, 1, visitId), uncertain: false }
  first.save('cashier-A', { ...draft, request })
  assert.equal(first.read('cashier-A').request.uncertain, true)
  storage.setItem('dineos-counter-draft-v1:cashier-A', '{broken')
  assert.equal(first.read('cashier-A').recoveryRequired, true)
  first.save('cashier-A', { ...draft, request: { ...request, payload: { ...request.payload, tableId: 'tampered-table' } } })
  assert.equal(first.read('cashier-A').recoveryRequired, true)
})

test('refresh restores table, nickname, mixed packing, quantities and notes without sending an order', async () => {
  const browser = browserStorage(), h = await harness(); let next
  try {
    await h.load(); h.action('Add one Test rice').props.onClick(); h.action('Add one Test rice').props.onClick()
    h.input('counter-name', 'Demo customer')
    h.action('Note for Test rice').props.onChange({ target: { value: 'No onion' } })
    findElement(h.page(), (node) => node.props?.children === 'Pack 1 separately').props.onClick()
    h.runtime.cleanup(); next = await harness(); await next.load()
    assert.equal(findElement(next.page(), (node) => node.props?.id === 'counter-table').props.value, tableId)
    assert.equal(findElement(next.page(), (node) => node.props?.id === 'counter-name').props.value, 'Demo customer')
    const selectors = []
    function collect(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { node.forEach(collect); return } if (node.type?.name === 'OrderTypeSelector') selectors.push(node.props.value); Object.values(node.props ?? {}).forEach(collect) }
    collect(next.page()); assert.deepEqual(selectors.sort(), ['dine_in', 'take_away'])
    assert.equal(next.action('Note for Test rice').props.value, 'No onion')
    assert.equal(next.fixture.requests.length, 0)
    assert.ok(findElement(next.page(), (node) => node.props?.children === 'Your unfinished counter order has been restored. Review the table, dishes and latest prices before sending.'))
  } finally { h.runtime.cleanup(); next?.runtime.cleanup(); browser.restore() }
})

test('lost counter response freezes all edits and retries same payload/revision after refresh even without current menu', async () => {
  const browser = browserStorage(), h = await harness(); let next
  try {
    await h.load(); h.action('Add one Test rice').props.onClick(); h.fixture.loseFirst = true
    await h.submit()
    const first = h.fixture.requests[0]
    assert.equal(h.fixture.committed.size, 1)
    assert.equal(h.action('Add one Test rice').props.disabled, true)
    h.action('Add one Test rice').props.onClick(); h.action('Remove one Test rice').props.onClick()
    h.input('counter-table', 'another-table'); h.input('counter-name', 'Must not replace name')
    assert.equal(findElement(h.page(), (node) => node.props?.id === 'counter-table').props.value, tableId)
    assert.equal(findElement(h.page(), (node) => node.props?.id === 'counter-name').props.value, '')
    h.runtime.cleanup(); next = await harness()
    next.fixture.committed = h.fixture.committed; next.fixture.requests = h.fixture.requests
    next.fixture.setup = { ...next.fixture.setup, settingsRevision: 8, tables: [], items: [] }
    await next.load(); await next.submit()
    assert.deepEqual(next.fixture.requests[1], first)
    assert.equal(next.fixture.committed.size, 1)
    const persisted = createCounterDraftStorage({ getStorage: () => browser.storage }).read('cashier-A')
    assert.equal(persisted.request, null); assert.deepEqual(persisted.cart, {})
    assert.ok(findElement(next.page(), (node) => node.props?.children === 'The kitchen can now prepare this order. Payment and serving or collection are recorded separately.'))
  } finally { h.runtime.cleanup(); next?.runtime.cleanup(); browser.restore() }
})

test('an explicit first rejection unlocks edits; a later rejection never erases an earlier uncertain result', async () => {
  for (const uncertain of [false, true]) {
    const browser = browserStorage(), h = await harness()
    try {
      await h.load(); h.action('Add one Test rice').props.onClick()
      if (uncertain) { h.fixture.loseFirst = true; await h.submit() }
      h.fixture.errorStatus = 409; await h.submit()
      assert.equal(h.action('Add one Test rice').props.disabled, uncertain)
      const persisted = createCounterDraftStorage({ getStorage: () => browser.storage }).read('cashier-A')
      assert.equal(Boolean(persisted.request), uncertain)
    } finally { h.runtime.cleanup(); browser.restore() }
  }
})

test('database 503 keeps counter draft frozen and explicit retry uses the same original request', async () => {
  const browser = browserStorage(), h = await harness()
  try {
    await h.load(); h.action('Add one Test rice').props.onClick()
    h.fixture.errorStatus = 503; await h.submit()
    const original = h.fixture.requests[0]
    assert.equal(h.action('Add one Test rice').props.disabled, true)
    await flush(); h.page(); assert.equal(h.fixture.requests.length, 1)
    const saved = createCounterDraftStorage({ getStorage: () => browser.storage }).read('cashier-A')
    assert.equal(saved.request.requestId, original.requestId)
    h.fixture.errorStatus = 0; await h.submit()
    assert.deepEqual(h.fixture.requests[1], original)
    assert.equal(h.fixture.committed.size, 1)
  } finally { h.runtime.cleanup(); browser.restore() }
})

test('new table visit blocks stale restored draft until the cashier deliberately selects the table again', async () => {
  const browser = browserStorage(), h = await harness(); let next
  try {
    await h.load(); h.action('Add one Test rice').props.onClick(); h.runtime.cleanup()
    next = await harness(); next.fixture.setup.tables[0].tableSessionId = '5cf5273f-02fb-49d1-a40e-00a85648b5fa'; await next.load()
    await next.submit(); assert.equal(next.fixture.requests.length, 0)
    assert.ok(findElement(next.page(), (node) => node.props?.children === 'Review table selection'))
    next.input('counter-table', tableId); await next.submit()
    assert.equal(next.fixture.requests[0].expectedTableSessionId, '5cf5273f-02fb-49d1-a40e-00a85648b5fa')
  } finally { h.runtime.cleanup(); next?.runtime.cleanup(); browser.restore() }
})

test('another cashier cannot see or submit the previous cashier draft; returning owner can recover it', async () => {
  const browser = browserStorage(), h = await harness(); let next
  try {
    await h.load(); h.action('Add one Test rice').props.onClick(); h.input('counter-name', 'Owner A')
    h.fixture.actorId = 'cashier-B'; h.page()
    assert.equal(findElement(h.page(), (node) => node.props?.id === 'counter-name').props.value, '')
    await h.submit(); assert.equal(h.fixture.requests.length, 0)
    h.action('Add one Test rice').props.onClick(); h.input('counter-name', 'Owner B')
    h.runtime.cleanup(); next = await harness(); await next.load()
    assert.equal(findElement(next.page(), (node) => node.props?.id === 'counter-name').props.value, 'Owner A')
    await next.submit(); assert.equal(next.fixture.requests[0].customerNickname, 'Owner A')
  } finally { h.runtime.cleanup(); next?.runtime.cleanup(); browser.restore() }
})

test('storage denial prevents sending an untraceable order; malformed success keeps the pending draft', async () => {
  const browser = browserStorage({ getItem() { throw new Error('Test storage denied') }, setItem() { throw new Error('Test storage denied') } }), h = await harness()
  try {
    await h.load(); h.action('Add one Test rice').props.onClick(); await h.submit()
    assert.equal(h.fixture.requests.length, 0)
  } finally { h.runtime.cleanup(); browser.restore() }
  const secondBrowser = browserStorage(), second = await harness()
  try {
    await second.load(); second.action('Add one Test rice').props.onClick(); second.fixture.malformed = true; await second.submit()
    assert.equal(second.action('Add one Test rice').props.disabled, true)
    assert.ok(createCounterDraftStorage({ getStorage: () => secondBrowser.storage }).read('cashier-A').request)
  } finally { second.runtime.cleanup(); secondBrowser.restore() }
})

test('counter charge lines disappear at zero and return for enabled rates', async () => {
  const browser = browserStorage(), h = await harness()
  try {
    await h.load()
    const charge = (name) => findElement(h.page(), (node) => node.type === 'dt' && JSON.stringify(node.props.children).includes(name))
    assert.equal(charge('Service charge'), null); assert.equal(charge('SST'), null)
    h.fixture.setup.settings = { serviceChargeRate: 10, sstRate: 6 }
    // Simulate a fresh successful menu/settings response.
    await findElement(h.page(), (node) => node.props?.children === 'Refresh tables & menu').props.onClick(); await flush()
    assert.ok(charge('Service charge')); assert.ok(charge('SST'))
  } finally { h.runtime.cleanup(); browser.restore() }
})

test('admin menu clears a transient error after successful recovery', async () => {
  const h = await harness()
  try {
    h.runtime.render(h.useAdminMenu); h.runtime.effects()
    const previous = console.error; console.error = () => {}
    try { h.fixture.menuError(new Error('Test-only offline')) } finally { console.error = previous }
    assert.ok(h.runtime.render(h.useAdminMenu).error)
    h.fixture.menuData({ menuItems: [], categories: [] })
    assert.equal(h.runtime.render(h.useAdminMenu).error, '')
    assert.equal(h.runtime.render(h.useAdminMenu).isLoading, false)
  } finally { h.runtime.cleanup() }
})
