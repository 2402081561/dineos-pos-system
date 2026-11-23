import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

for (const switchAccount of [false, true]) test(`saved staff login redirects only after verification and respects account selection (${switchAccount})`, async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as Login} from './src/pages/admin/Login.jsx';export {fixture} from 'login-fixture'`, runtime, {
    'login-fixture': `export const fixture={navigation:[],location:{state:{switchAccount:${switchAccount}}},authUser:{role:'cashier'},isLoading:false}`,
    'react-router-dom': `import {fixture} from 'login-fixture';export const Link='a';export const useLocation=()=>fixture.location;export const useNavigate=()=> (...args)=>fixture.navigation.push(args)`,
    useAdminAuth: `import {fixture} from 'login-fixture';export default ()=>fixture`,
    useShopSettings: `export default ()=>({name:'Test restaurant'})`,
    useCustomerLanguage: `export default ()=>({t:text=>text})`,
    usePortalTheme: `export default ()=>({theme:'light',toggleTheme(){}})`,
    RememberedStaffAccounts: `export default function Saved(){return null}`,
  })
  runtime.render(h.Login); runtime.effects()
  assert.deepEqual(h.fixture.navigation, switchAccount ? [] : [['/cashier', { replace: true }]])
  runtime.cleanup()
})

test('saved-account chooser uses opaque slot selection and a protected role destination, never tokens in URLs', async () => {
  const runtime = hookRuntime(), previous = globalThis.window
  const paths = []
  globalThis.window = { location: { assign: path => paths.push(path) } }
  try {
    const h = await bundleHarness(`export {default as Chooser} from './src/components/admin/RememberedStaffAccounts.jsx';export {fixture} from 'saved-fixture'`, runtime, {
      'saved-fixture': `export const fixture={chosen:null}`,
      useCustomerLanguage: `export default ()=>({t:text=>text})`,
      rememberedStaffSession: `import {fixture} from 'saved-fixture';const saved=[{slot:'opaque-1',name:'Cashier test',role:'cashier'},{slot:'opaque-2',name:'Admin test',role:'admin'}];export const listRememberedStaffSessions=()=>saved;export function selectRememberedStaffSession(slot){fixture.chosen=slot;return saved.find(item=>item.slot===slot)}`,
    })
    const tree = runtime.render(h.Chooser)
    assert(findElement(tree, node => node.props.children === 'Saved accounts'))
    const button = findElement(tree, node => node.type === 'button')
    button.props.onClick()
    assert.equal(h.fixture.chosen, 'opaque-1')
    assert.deepEqual(paths, ['/cashier'])
  } finally { runtime.cleanup(); if (previous === undefined) delete globalThis.window; else globalThis.window = previous }
})
