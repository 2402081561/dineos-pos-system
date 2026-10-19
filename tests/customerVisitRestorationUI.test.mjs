import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import Module, { createRequire } from 'node:module'
import { buildSync } from 'esbuild'

const root = path.resolve(import.meta.dirname, '..')
const session = { sessionId: '66b195a3-18e0-4f2d-a337-42797a0ba97f', tableSessionId: 'a98b5086-dff8-4aca-b8a7-f42459604745', tableNumber: '1', customerNickname: 'Shared Table', isSharedTable: true }
function renderer() {
  const result = buildSync({
    stdin: { contents: `
      import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
      import {MemoryRouter,Routes,Route} from 'react-router-dom';
      import CustomerLanguageProvider from './src/context/CustomerLanguageProvider.jsx';
      import CustomerSessionProvider from './src/context/CustomerSessionProvider.jsx';
      import CartProvider from './src/context/CartProvider.jsx';
      import {CustomerSessionContext} from './src/context/CustomerSessionContext.js';
      import CustomerSessionRoute from './src/components/customer/CustomerSessionRoute.jsx';
      import useCustomerSession from './src/hooks/useCustomerSession.js'; import useCart from './src/hooks/useCart.js';
      import {customerVisitStorage} from './src/utils/customerVisitStorage.js';
      export function seed(session) {customerVisitStorage.saveSession(session);customerVisitStorage.saveDraft(session,{sessionId:session.sessionId,tableSessionId:session.tableSessionId,items:[{cartRowId:'row-1',menuItemId:'mee',name:'Mee',unitPrice:9,quantity:3,orderType:'take_away',specialInstructions:'No onion',selections:[]}],orderRequest:null})}
      function Probe(){const visit=useCustomerSession();const cart=useCart();return <p data-session={visit.session?.sessionId??''} data-count={cart.cartItemCount} data-restoring={String(visit.isRestoring)}/>}
      export function bootstrap(){return renderToStaticMarkup(<CustomerSessionProvider><CartProvider><Probe/></CartProvider></CustomerSessionProvider>)}
      export function guard(state){return renderToStaticMarkup(<CustomerLanguageProvider><CustomerSessionContext.Provider value={state}><MemoryRouter initialEntries={['/menu']}><Routes><Route element={<CustomerSessionRoute/>}><Route path="menu" element={<h1>Protected menu</h1>}/></Route><Route path="join" element={<h1>Join required</h1>}/></Routes></MemoryRouter></CustomerSessionContext.Provider></CustomerLanguageProvider>)}
    `, resolveDir: root, loader: 'jsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', define: { 'import.meta.env': '{}' },
  })
  const filename = path.join(root, 'tests', '__restore-memory.cjs')
  const module = new Module(filename)
  module.filename = filename; module.paths = Module._nodeModulePaths(root); module.require = createRequire(filename)
  module._compile(result.outputFiles[0].text, filename)
  return module.exports
}

test('real providers synchronously hydrate cached visit and cart, but mark the visit as awaiting server verification', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const values = new Map()
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { sessionStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) } } })
    renderer().seed(session)
    // A new module instance represents the entire previous page JS being lost.
    const html = renderer().bootstrap()
    assert.ok(html.includes(`data-session="${session.sessionId}"`))
    assert.ok(html.includes('data-count="3"'))
    assert.ok(html.includes('data-restoring="true"'))
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else delete globalThis.window
  }
})

test('real route gate keeps ordering unavailable during restoration/outage and supports localized retry', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const render = renderer().guard
  try {
    for (const language of ['en', 'zh']) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => language } })
      const state = { session, isRestoring: true, restoreError: '', retryRestore() {} }
      const loading = render(state)
      assert.ok(!loading.includes('Protected menu'))
      assert.ok(loading.includes(language === 'en' ? 'Restoring your table...' : '正在恢复您的餐桌'))
      const offline = render({ ...state, restoreError: 'We could not reconnect to your table. Your cart has been kept. Please try again.' })
      assert.ok(!offline.includes('Protected menu'))
      assert.ok(offline.includes(language === 'en' ? 'Your cart has been kept' : '您的购物车已保留'))
      assert.ok(offline.includes(language === 'en' ? 'Try again' : '重试'))
      assert.ok(render({ ...state, isRestoring: false }).includes('Protected menu'))
      assert.ok(!render({ ...state, session: null, isRestoring: false }).includes('Protected menu'))
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  }
})
