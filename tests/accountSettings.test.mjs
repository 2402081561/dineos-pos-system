import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

test('account settings keeps sign-out pending/error handling and redirects only after success', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as Settings} from './src/pages/AccountSettings.jsx';export {fixture} from 'account-fixture'`, runtime, {
    'account-fixture': `export const fixture={calls:0,paths:[],resolve:null,reject:null};`,
    useAdminAuth: `import {fixture} from 'account-fixture';export default ()=>({authUser:{displayName:'Cashier',email:'test@example.test'},signOut:()=>{fixture.calls++;return new Promise((resolve,reject)=>Object.assign(fixture,{resolve,reject}))}})`,
    'react-router-dom': `import {fixture} from 'account-fixture';export const useNavigate=()=> (...args)=>fixture.paths.push(args)`,
    useCustomerLanguage: `export default ()=>({t:text=>text})`,
    SectionHeading: `export default function Heading(){return null}`,
    Button: `export default function Button(){return null}`,
  })
  const render = () => runtime.render(h.Settings)
  const button = tree => findElement(tree, node => node.props.children === 'Log out')
  const pending = button(render()).props.onClick()
  assert.equal(h.fixture.calls, 1)
  assert.equal(button(render()).props.disabled, true)
  await button(render()).props.onClick()
  assert.equal(h.fixture.calls, 1, 'repeated clicks while pending are ignored')
  assert.deepEqual(h.fixture.paths, [])
  h.fixture.reject(new Error('Network unavailable'))
  await pending
  assert.equal(findElement(render(), node => node.props.role === 'alert').props.children, 'Network unavailable')
  assert.equal(button(render()).props.disabled, false)
  assert.deepEqual(h.fixture.paths, [])
  const retry = button(render()).props.onClick()
  h.fixture.resolve()
  await retry
  assert.deepEqual(h.fixture.paths, [['/admin/login', { replace: true }]])
})

test('all four protected employee areas expose account settings; header and customer area do not expose logout', () => {
  const read = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  assert.equal((read('routes/AppRoutes.jsx').match(/path="account-settings"/g) || []).length, 4)
  assert(read('utils/adminNavigation.js').includes('/admin/account-settings'))
  for (const role of ['Cashier','Kitchen','Staff']) assert(read(`layouts/${role}Layout.jsx`).includes('Account settings'))
  assert(!read('components/common/PortalLayout.jsx').includes('Log out'))
  assert(!read('layouts/CustomerLayout.jsx').includes('account-settings'))
})
