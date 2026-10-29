import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

test('customer connection notices hide routine updates but still warn and recover live', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`
    export {default as Status} from './src/components/common/ConnectionStatus.jsx';
    export {fixture} from 'connection-fixture';`, runtime, {
    'connection-fixture': `export const fixture={state:'current',lastUpdated:1234,listener:null};`,
    connectionStatus: `import {fixture} from 'connection-fixture';
      export function connectionSnapshot(){return {state:fixture.state,lastUpdated:fixture.lastUpdated}}
      export function subscribeConnection(callback){fixture.listener=callback;return()=>{fixture.listener=null}}`,
    useCustomerLanguage: `export default ()=>({t:text=>text,formatDate:()=> 'fixture time'})`,
  })
  const previousWindow = globalThis.window
  const previousInterval = globalThis.setInterval
  const previousClear = globalThis.clearInterval
  const events = new EventTarget()
  const intervals = new Set()
  globalThis.window = events
  globalThis.setInterval = (callback) => { intervals.add(callback); return callback }
  globalThis.clearInterval = (callback) => intervals.delete(callback)
  const render = (warningsOnly = true) => runtime.render(h.Status, { warningsOnly })
  const update = (state) => { h.fixture.state = state; h.fixture.listener() }
  try {
    assert.equal(render(), null)
    runtime.effects()
    assert.equal(intervals.size, 1, 'hidden status still listens for failures')
    for (const state of ['idle', 'checking', 'current']) {
      update(state)
      assert.equal(render(), null, state)
    }
    for (const state of ['offline', 'stale']) {
      update(state)
      const tree = render()
      assert.equal(tree.props.role, 'status')
      assert.equal(tree.props['aria-live'], 'polite')
      assert.ok(findElement(tree, (node) => node.type === 'span' && typeof node.props.children === 'string' && node.props.children.includes('Nothing is queued')))
      assert.ok(!JSON.stringify(tree).includes('Last updated'), 'no technical timestamp on customer warnings')
    }
    update('current')
    assert.equal(render(), null, 'recovery removes the customer warning automatically')
    assert.ok(JSON.stringify(render(false)).includes('Live data updated'), 'staff retains routine status')
    assert.ok(JSON.stringify(render(false)).includes('fixture time'), 'staff retains last update time')
    update('checking')
    assert.ok(JSON.stringify(render(false)).includes('Checking live data'))
    runtime.cleanup()
    assert.equal(h.fixture.listener, null)
    assert.equal(intervals.size, 0)
  } finally {
    runtime.cleanup()
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    globalThis.setInterval = previousInterval
    globalThis.clearInterval = previousClear
  }
})

test('only customer portals opt into warnings-only status; staff keeps the default', () => {
  const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  assert.match(read('layouts/CustomerLayout.jsx'), /<PortalLayout connectionWarningsOnly /)
  const portal = read('components/common/PortalLayout.jsx')
  assert.match(portal, /connectionWarningsOnly = false/)
  assert.match(portal, /<ConnectionStatus warningsOnly=\{connectionWarningsOnly\}/)
  for (const role of ['Admin', 'Cashier', 'Kitchen', 'Staff']) {
    assert.doesNotMatch(read(`layouts/${role}Layout.jsx`), /connectionWarningsOnly/)
  }
})
