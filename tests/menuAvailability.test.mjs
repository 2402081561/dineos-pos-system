import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hookRuntime, bundleHarness, findElement, flush } from './helpers/hookHarness.mjs'

async function harness() {
  const runtime = hookRuntime()
  const module = await bundleHarness(`
    import MenuAvailabilityControl from './src/components/common/MenuAvailabilityControl.jsx'
    import NewOrder from './src/pages/cashier/NewOrder.jsx'
    import {fixture} from 'availability-fixture'
    import {createCustomerI18n,translateCustomerText} from './src/i18n/customerLanguage.js'
    fixture.t=(text,options)=>translateCustomerText(createCustomerI18n(fixture.language),text,options)
    export {MenuAvailabilityControl,NewOrder,fixture}
  `, runtime, {
    'availability-fixture': 'export const fixture={language:"en",requests:[],update:async(item,updates)=>({...item,...updates}),setup:{tables:[],items:[{id:"rice",name:"Chicken Rice",price:9,isAvailable:true}],settings:{serviceChargeRate:0,sstRate:0},settingsRevision:1}}',
    useCustomerLanguage: `import {fixture} from 'availability-fixture';export default ()=>({t:(text,options)=>fixture.t(text,options)})`,
    useAdminAuth: 'export default ()=>({authUser:{id:"test-cashier"}})',
    adminApiService: `import {fixture} from 'availability-fixture';export function updateSupabaseMenuFlags(item,updates){fixture.requests.push({item,updates});return fixture.update(item,updates)}export async function getSupabaseCashierOrderSetup(){return fixture.setup}export async function createSupabaseCashierOrder(){throw new Error('No real orders allowed')}`,
    'react-router-dom': 'export const useSearchParams=()=>[new URLSearchParams()];export const Link=()=>null',
  })
  return { ...module, runtime }
}
const item = { id: 'rice', name: 'Chicken Rice', isAvailable: true, price: 9 }
const button = (h, props) => findElement(h.runtime.render(h.MenuAvailabilityControl, props), (node) => node.type === 'button')

test('availability control shows distinct action and confirmed status in both languages', async () => {
  const h = await harness(), updated = [], pending = []
  const props = { item, onUpdated: (value) => updated.push(value), onPendingChange: (...args) => pending.push(args) }
  h.runtime.render(h.MenuAvailabilityControl, props); h.runtime.effects()
  assert.match(button(h, props).props['aria-label'], /Mark sold out/)
  button(h, props).props.onClick(); await flush()
  assert.deepEqual(h.fixture.requests[0].updates, { isAvailable: false })
  assert.equal(updated[0].isAvailable, false)
  assert.deepEqual(pending, [['rice', true], ['rice', false]])
  assert.match(button(h, props).props['aria-label'], /Restore availability/)
  assert.match(button(h, props).props.className, /bg-emerald-700/)
  h.fixture.language = 'zh'
  assert.equal(button(h, props).props['aria-label'], 'Chicken Rice：恢复供应')
  button(h, props).props.onClick(); await flush()
  assert.deepEqual(h.fixture.requests[1].updates, { isAvailable: true })
  assert.equal(button(h, props).props['aria-label'], 'Chicken Rice：标记售罄')
  h.runtime.cleanup()
})

test('availability changes ignore rapid double clicks and keep status on request failure', async () => {
  const h = await harness(), props = { item }
  let reject
  h.fixture.update = () => new Promise((_, fail) => { reject = fail })
  h.runtime.render(h.MenuAvailabilityControl, props); h.runtime.effects()
  const action = button(h, props)
  action.props.onClick(); action.props.onClick()
  assert.equal(h.fixture.requests.length, 1)
  assert.equal(button(h, props).props.disabled, true)
  assert.equal(button(h, props).props['aria-busy'], true)
  reject(new Error('Test-only offline')); await flush()
  assert.equal(button(h, props).props.disabled, false)
  assert.match(button(h, props).props['aria-label'], /Mark sold out/)
  assert.ok(findElement(h.runtime.render(h.MenuAvailabilityControl, props), (node) => node.props?.role === 'alert'))
  h.runtime.cleanup()
})

test('disabled controls never write and delayed success after removal only releases the busy flag', async () => {
  const h = await harness(), updated = [], pending = []
  button(h, { item, disabled: true }).props.onClick()
  assert.equal(h.fixture.requests.length, 0)
  let resolve
  h.fixture.update = () => new Promise((done) => { resolve = done })
  const props = { item, onUpdated: (value) => updated.push(value), onPendingChange: (...args) => pending.push(args) }
  h.runtime.render(h.MenuAvailabilityControl, props); h.runtime.effects()
  button(h, props).props.onClick(); h.runtime.cleanup()
  resolve({ ...item, isAvailable: false }); await flush()
  assert.equal(updated.length, 0)
  assert.deepEqual(pending, [['rice', true], ['rice', false]])
})

test('cashier applies only confirmed availability, preserves cart and blocks ordering sold-out dishes', async () => {
  const h = await harness()
  h.runtime.render(h.NewOrder); h.runtime.effects(); await flush()
  let page = h.runtime.render(h.NewOrder)
  const add = findElement(page, (node) => node.props?.['aria-label'] === 'Add one Chicken Rice')
  assert.equal(add.props.disabled, false)
  add.props.onClick()
  page = h.runtime.render(h.NewOrder)
  const control = findElement(page, (node) => node.type === h.MenuAvailabilityControl)
  assert.ok(control)
  control.props.onUpdated({ id: 'rice', isAvailable: false })
  page = h.runtime.render(h.NewOrder)
  assert.equal(findElement(page, (node) => node.props?.['aria-label'] === 'Add one Chicken Rice').props.disabled, true)
  assert.ok(findElement(page, (node) => node.props?.role === 'alert'))
  const status = findElement(page, (node) => node.type === h.MenuAvailabilityControl)
  assert.equal(status.props.item.price, 9)
  assert.equal(status.props.item.isAvailable, false)
  status.props.onUpdated({ id: 'rice', isAvailable: true })
  page = h.runtime.render(h.NewOrder)
  assert.equal(findElement(page, (node) => node.props?.['aria-label'] === 'Add one Chicken Rice').props.disabled, false)
  assert.ok(findElement(page, (node) => node.props?.['aria-label'] === 'Decrease Chicken Rice'), 'Existing order item is retained')
  h.runtime.cleanup()
})
