import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import Module, { createRequire } from 'node:module'
import { buildSync } from 'esbuild'

const root = path.resolve(import.meta.dirname, '..')
function renderer() {
  const result = buildSync({
    stdin: { contents: `
      import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
      import {MemoryRouter, Routes, Route} from 'react-router-dom';
      import CustomerLanguageProvider from './src/context/CustomerLanguageProvider.jsx';
      import CustomerLayout from './src/layouts/CustomerLayout.jsx';
      import {CartContext} from './src/context/CartContext.js';
      import {CustomerSessionContext} from './src/context/CustomerSessionContext.js';
      import {AdminAuthContext} from './src/context/AdminAuthContext.js';
      import {ShopSettingsContext} from './src/context/ShopSettingsContext.js';
      import FoodDetailsOrderBar from './src/components/customer/FoodDetailsOrderBar.jsx';
      export function render(path, count=0, joined=true) {
        return renderToStaticMarkup(<CustomerLanguageProvider><CartContext.Provider value={{cartItemCount:count}}><CustomerSessionContext.Provider value={{session:joined?{tableNumber:1,sessionId:'test-session'}:null}}><AdminAuthContext.Provider value={{authError:'',authUser:null,signOut(){}}}><ShopSettingsContext.Provider value={{name:'DineOS',settings:{isAcceptingOrders:true},isLoading:false,error:''}}><MemoryRouter initialEntries={[path]}><Routes><Route element={<CustomerLayout/>}><Route path="*" element={<div id="menu-body">Menu fixture{path.startsWith('/menu/') && <FoodDetailsOrderBar quantity={1} totalPrice={9} onAdd={()=>{}}/>}</div>}/></Route></Routes></MemoryRouter></ShopSettingsContext.Provider></AdminAuthContext.Provider></CustomerSessionContext.Provider></CartContext.Provider></CustomerLanguageProvider>);
      }`, resolveDir: root, loader: 'jsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', define: { 'import.meta.env': '{}' },
  })
  const filename = path.join(root, 'tests', '__cart-shortcut-memory.cjs')
  const module = new Module(filename)
  module.filename = filename
  module.paths = Module._nodeModulePaths(root)
  const require = createRequire(filename)
  module.require = (name) => name === 'react-dom' ? { ...require(name), createPortal: (children) => children } : require(name)
  module._compile(result.outputFiles[0].text, filename)
  return module.exports.render
}

test('real customer layout keeps a fixed SVG cart outside animated content on menu, details and other customer pages', () => {
  const render = renderer()
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: {} } })
    for (const language of ['en', 'zh']) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => language } })
      for (const page of ['/menu', '/menu/item-1', '/orders', '/table-summary', '/more']) {
        const html = render(page, 3)
        const shortcut = html.slice(html.indexOf('</main>'))
        assert.ok(shortcut.includes('data-customer-cart-shortcut'), `${page}: cart must live outside the animated main`)
        assert.ok(shortcut.includes('fixed right-4'))
        assert.ok(shortcut.includes('href="/cart"'))
        assert.ok(shortcut.includes('<svg'))
        assert.ok(shortcut.includes(language === 'en' ? 'View cart, 3 items' : '查看购物车，共 3 件'))
        assert.ok(shortcut.includes('>3</span>'))
        assert.ok(html.includes('pb-24'))
        assert.ok(shortcut.includes(page.startsWith('/menu/') ? 'bottom-[calc(7rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom))]'))
      }
      const empty = render('/menu', 0)
      assert.ok(empty.includes('data-customer-cart-shortcut'))
      assert.ok(empty.includes(language === 'en' ? 'aria-label="View cart"' : 'aria-label="查看购物车"'))
      assert.ok(!render('/cart', 3).includes('data-customer-cart-shortcut'))
      assert.ok(!render('/join', 3, false).includes('data-customer-cart-shortcut'))
      assert.ok(render('/menu', 8).includes(language === 'en' ? 'View cart, 8 items' : '查看购物车，共 8 件'))
    }
  } finally {
    for (const [key, previous] of [['localStorage', previousStorage], ['document', previousDocument]]) {
      if (previous) Object.defineProperty(globalThis, key, previous)
      else delete globalThis[key]
    }
  }
})
