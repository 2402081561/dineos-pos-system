import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { hookRuntime, bundleHarness, findElement } from './helpers/hookHarness.mjs'

test('new order is the first cashier action for cashiers and admins; admin back link remains separate', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as Layout} from './src/layouts/CashierLayout';export {fixture} from 'cashier-nav-fixture'`, runtime, {
    'cashier-nav-fixture': "export const fixture={role:'cashier'}",
    useAdminAuth: "import {fixture} from 'cashier-nav-fixture';export default ()=>({authUser:{role:fixture.role}})",
    PortalLayout: 'export default ()=>null',
    'react-router-dom': "export const useLocation=()=>({pathname:'/cashier'})",
  })
  try {
    for (const role of ['cashier', 'admin']) {
      h.fixture.role = role
      const { navigation } = runtime.render(h.Layout).props
      if (role === 'admin') assert.equal(navigation[0].to, '/admin/dashboard')
      assert.deepEqual(navigation.filter(link => link.to.startsWith('/cashier')).map(link => link.to), [
        '/cashier/new-order', '/cashier', '/cashier/history', '/cashier/closing', '/cashier/notifications',
      ])
      assert.equal(navigation.find(link => link.to === '/cashier').end, true)
    }
  } finally { runtime.cleanup() }
})

test('only the new-counter-order route requests the contained desktop workspace', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`import CashierLayout from './src/layouts/CashierLayout';import {fixture} from 'workspace-fixture';export {CashierLayout,fixture}`, runtime, {
    'workspace-fixture': "export const fixture={pathname:'/cashier/new-order'}",
    useAdminAuth: "export default ()=>({authUser:{role:'admin'}})",
    PortalLayout: 'export default function PortalLayout(){return null}',
    'react-router-dom': "import {fixture} from 'workspace-fixture';export const useLocation=()=>fixture",
  })
  for (const pathname of ['/cashier/new-order', '/cashier', '/cashier/history', '/cashier/closing', '/cashier/receipt/R-TEST']) {
    h.fixture.pathname = pathname
    const layout = runtime.render(h.CashierLayout)
    assert.equal(layout.props.containedWorkspace, pathname === '/cashier/new-order')
    assert.equal(layout.props.connectionWarningsOnly, undefined, 'Operational connection messages remain enabled')
  }
  runtime.cleanup()
})

test('actual portal contains the counter on desktop without a global mobile or receipt scroll lock', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`import PortalLayout from './src/components/common/PortalLayout';export {PortalLayout}`, runtime, {
    useCustomerLanguage: 'export default ()=>({t:text=>text})',
    useAdminAuth: "export default ()=>({authUser:{displayName:'Test cashier'},signOut:async()=>{}})",
    useShopSettings: "export default ()=>({name:'Test shop'})",
    'react-router-dom': "export const NavLink=()=>null;export const Outlet=()=>null;export const useLocation=()=>({pathname:'/cashier/new-order'});export const useNavigate=()=>()=>{}",
    ConnectionStatus: 'export default ()=>null',
    PortalNavigation: 'export default ()=>null',
    LanguageSwitch: 'export default ()=>null',
    BrandMark: 'export default ()=>null',
    PortalPageContent: 'export default ({children})=>children',
  })
  const props = { area: 'Cashier', navigation: [] }
  const contained = runtime.render(h.PortalLayout, { ...props, containedWorkspace: true })
  assert.equal(contained.props['data-contained-workspace'], true)
  assert.ok(contained.props.className.includes('lg:h-dvh'))
  assert.ok(findElement(contained, (node) => node.type === 'main').props.className.includes('lg:min-h-0'))
  assert.ok(findElement(contained, (node) => node.type === 'main').props.className.includes('lg:overflow-hidden'))
  const ordinary = runtime.render(h.PortalLayout, props)
  assert.equal(ordinary.props['data-contained-workspace'], undefined)
  assert.ok(!ordinary.props.className.includes('lg:h-dvh'))
  const css = await readFile(new URL('../src/styles/index.css', import.meta.url), 'utf8')
  assert.match(css, /@media screen and \(min-width: 1024px\)\s*\{\s*html:has\(\[data-contained-workspace="true"\]\),\s*body:has\(\[data-contained-workspace="true"\]\)\s*\{\s*overflow: hidden;\s*overscroll-behavior: none;/)
  runtime.cleanup()
})
