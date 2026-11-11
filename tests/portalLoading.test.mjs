import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import Module, { createRequire } from 'node:module'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

async function loadPortal() {
  const root = path.resolve(import.meta.dirname, '..')
  const mocks = {
    useCustomerLanguage: 'export default ()=>({t:text=>text})',
    useAdminAuth: "export default ()=>({authUser:{role:'admin',displayName:'Test admin'},signOut:async()=>{}})",
    useShopSettings: "export default ()=>({name:'Test restaurant'})",
    'react-router-dom': "export const location={pathname:'/admin/menu'};export const useLocation=()=>location;export const useNavigate=()=>()=>{};export const NavLink=({children})=>children;export const Outlet=()=>{throw new Promise(()=>{})}",
    PortalNavigation: "export default ()=> <a href='/admin/orders'>Persistent navigation</a>",
    ConnectionStatus: 'export default ()=>null',
    LanguageSwitch: 'export default ()=>null',
    BrandMark: 'export default ()=>null',
    StaffNotificationManifest: 'export default ()=>null',
  }
  const result = await build({
    stdin: { contents: "export {default as PortalLayout} from './src/components/common/PortalLayout';export {AppErrorBoundary,default as PageErrorBoundary} from './src/components/common/PageErrorBoundary';export {location} from 'react-router-dom'", resolveDir: root },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
    plugins: [{ name: 'portal-loading-fixtures', setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, ({ path: source }) => {
        const name = source.split('/').pop().replace(/\.(js|jsx)$/, '')
        return Object.hasOwn(mocks, name) ? { path: name, namespace: 'fixture' } : undefined
      })
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: mocks[name], loader: 'jsx', resolveDir: root }))
    } }],
  })
  const filename = path.join(root, 'tests', '__portal-loading-memory.cjs')
  const module = new Module(filename)
  module.filename = filename; module.paths = Module._nodeModulePaths(root); module.require = createRequire(filename)
  module._compile(result.outputFiles[0].text, filename)
  return module.exports
}

test('a suspended page keeps the real portal header and navigation outside the loading boundary', async () => {
  const { PortalLayout } = await loadPortal()
  for (const area of ['Admin', 'Cashier', 'Kitchen', 'Staff']) {
    const html = renderToString(createElement(PortalLayout, { area, navigation: [] }))
    assert.match(html, /Test restaurant/)
    assert.match(html, /Persistent navigation/)
    assert.match(html, /Loading page…/)
    assert.match(html, /role="status"/)
    const boundary = html.indexOf('<!--$!')
    assert.ok(boundary > html.indexOf('</nav>'), 'Only the outlet suspends, not the sidebar/header')
    assert.ok(html.indexOf('Loading page…') > boundary)
    assert.match(html, /aria-label="Dark mode"/)
  }
  const customer = renderToString(createElement(PortalLayout, { area: '顾客', navigation: [], showAccountControls: false }))
  assert.doesNotMatch(customer, /aria-label="Dark mode"/)
  assert.ok(customer.indexOf('<!--$!') > customer.indexOf('</nav>'), 'Customer shell also stays outside suspended content')
  assert.match(customer, /Test restaurant/)
  assert.match(customer, /Persistent navigation/)
})

test('navigation resets page errors without key-remounting the entire portal', async () => {
  const { PageErrorBoundary, AppErrorBoundary, location } = await loadPortal()
  const first = PageErrorBoundary({ children: 'shell' })
  location.pathname = '/admin/orders'
  const second = PageErrorBoundary({ children: 'shell' })
  assert.equal(first.type, second.type)
  assert.equal(first.key, null)
  assert.equal(second.key, null)
  assert.notEqual(first.props.resetKey, second.props.resetKey)
  const failed = { failed: true, resetKey: '/admin/menu' }
  assert.equal(AppErrorBoundary.getDerivedStateFromProps({ resetKey: '/admin/menu' }, failed), null)
  assert.deepEqual(AppErrorBoundary.getDerivedStateFromProps({ resetKey: '/admin/orders' }, failed), { failed: false, resetKey: '/admin/orders' })
})
