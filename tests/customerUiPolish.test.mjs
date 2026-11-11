import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bundleHarness, hookRuntime } from './helpers/hookHarness.mjs'

test('cart feedback mutates immediately, allows repeat additions and never reports failed additions as success', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as useFeedback} from './src/hooks/useAddToCartFeedback.js';export {fixture} from 'polish-fixture'`, runtime, {
    'polish-fixture': 'export const fixture={added:[],toasts:[],navigation:[],locked:false,reject:false}',
    useCart: `import {fixture as f} from 'polish-fixture';export default ()=>({isCartLocked:f.locked,addToCart:(...args)=>{f.added.push(args);return !f.reject},getLastCartError:()=> 'Invalid options'})`,
    useCustomerToast: `import {fixture as f} from 'polish-fixture';export default ()=>({showToast:(...args)=>f.toasts.push(args)})`,
  })
  try {
    const food = { id: 'test', name: 'Rice', isAvailable: true, price: 9 }
    runtime.render(h.useFeedback).addItem(food)
    assert.equal(h.fixture.added.length, 1, 'No timer before local mutation')
    assert.equal(runtime.render(h.useFeedback).isAdded, true)
    assert.equal(runtime.render(h.useFeedback).isBusy, false, 'Success badge is not a button lock')
    await runtime.render(h.useFeedback).addItem(food)
    assert.equal(h.fixture.added.length, 2)
    h.fixture.reject = true
    await runtime.render(h.useFeedback).addItem(food)
    assert.equal(h.fixture.toasts.at(-1)[1], 'error')
    assert.equal(runtime.render(h.useFeedback).isAdded, false)
    h.fixture.locked = true
    await runtime.render(h.useFeedback).addItem(food)
    assert.equal(h.fixture.added.length, 3, 'Unconfirmed order still blocks mutation')
  } finally { runtime.cleanup() }
})

test('customer dialogs lock and restore background scroll/focus, close once, respect reduced motion and clean up timers', async () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document
  const oldSet = globalThis.setTimeout, oldClear = globalThis.clearTimeout
  const timers = new Map(), scrolls = [], restoredFocus = []
  let id = 0, closed = 0, reduced = false
  globalThis.setTimeout = (fn, ms) => { timers.set(++id, { fn, ms }); return id }
  globalThis.clearTimeout = key => timers.delete(key)
  globalThis.window = { scrollY: 735, scrollTo: value => scrolls.push(value), matchMedia: () => ({ matches: reduced }) }
  const style = { overflow: 'auto', position: '', top: '', width: '' }
  globalThis.document = { body: { style }, activeElement: { isConnected: true, focus: options => restoredFocus.push(options) } }
  const runtime = hookRuntime()
  try {
    const h = await bundleHarness(`export {default as useDialog} from './src/hooks/useCustomerDialog.js'`, runtime)
    let state = runtime.render(h.useDialog, () => closed++)
    runtime.effects()
    assert.equal(style.position, 'fixed'); assert.equal(style.top, '-735px')
    state.close(); state.close()
    state = runtime.render(h.useDialog, () => closed++)
    assert.equal(state.isClosing, true); assert.equal(closed, 0)
    assert.equal(timers.size, 1); assert.equal([...timers.values()][0].ms, 180)
    ;[...timers.values()][0].fn()
    assert.equal(closed, 1)
    runtime.cleanup()
    assert.deepEqual(style, { overflow: 'auto', position: '', top: '', width: '' })
    assert.equal(scrolls.at(-1).top, 735); assert.equal(restoredFocus.length, 1)
    assert.equal(timers.size, 0)
    reduced = true
    const second = hookRuntime()
    const other = await bundleHarness(`export {default as useDialog} from './src/hooks/useCustomerDialog.js'`, second)
    second.render(other.useDialog, () => closed++).close()
    assert.equal(closed, 2); assert.equal(timers.size, 0)
    second.cleanup()
  } finally {
    runtime.cleanup()
    globalThis.setTimeout = oldSet; globalThis.clearTimeout = oldClear
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument
  }
})

test('customer-only CSS keeps fixed controls outside transformed page motion and provides accessible modal/tap sizing', () => {
  const css = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8')
  assert.match(css, /\.customer-ui main\.page-transition \{ animation: customer-content-in 180ms/)
  assert.match(css, /\.mobile-menu-quantity-button \{[^}]*width: 44px/)
  assert.match(css, /\.customer-dialog-panel \{[^}]*100dvh[^}]*overflow-y: auto/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /safe-area-inset-bottom/)
})

test('customer non-menu pages start at their heading without overwriting menu restoration', async () => {
  const previous = globalThis.window, scrolls = [], runtime = hookRuntime()
  globalThis.window = { scrollTo: options => scrolls.push(options) }
  try {
    const h = await bundleHarness(`export {default as Layout} from './src/layouts/CustomerLayout.jsx';export {fixture} from 'route-polish-fixture'`, runtime, {
      'route-polish-fixture': 'export const fixture={location:{pathname:"/menu"}}',
      useCustomerLanguage: 'export default ()=>({t:text=>text})',
      useCart: 'export default ()=>({cartItems:[],cartItemCount:0})',
      useCustomerSession: 'export default ()=>({session:null})',
      useShopSettings: 'export default ()=>({settings:{isAcceptingOrders:true}})',
      PortalLayout: 'export default ()=>null',
      'react-router-dom': `import {fixture} from 'route-polish-fixture';export const useLocation=()=>fixture.location;export const Link=()=>null;export const NavLink=()=>null`,
    })
    // Render the actual content function returned by the outer layout.
    const render = path => { h.fixture.location.pathname = path; runtime.render(runtime.render(h.Layout).type); runtime.effects() }
    render('/menu'); assert.equal(scrolls.length, 0)
    for (const path of ['/more', '/table-summary', '/orders', '/cart', '/tracking', '/menu/rice']) render(path)
    assert.equal(scrolls.length, 6)
    assert.ok(scrolls.every(options => options.top === 0 && options.behavior === 'instant'))
    render('/menu'); assert.equal(scrolls.length, 6)
  } finally { runtime.cleanup(); if (previous === undefined) delete globalThis.window; else globalThis.window = previous }
})
