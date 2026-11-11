import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import { build } from 'esbuild'

test('real customer details and expanded table summary hide zero fees but retain historical charges in both languages', async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const result = await build({
    stdin: { contents: `
      import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
      import CustomerLanguageProvider from './src/context/CustomerLanguageProvider.jsx';
      import {CustomerSessionContext} from './src/context/CustomerSessionContext.js';
      import {ToastContext} from './src/context/ToastContext.js';
      import Modal from './src/components/customer/CustomerOrderDetailsModal.jsx';
      import TableSummary from './src/pages/customer/TableSummary.jsx';
      import {setFixture} from './src/hooks/useTableSummary.js';
      export function render(kind, order) {
        const participant = {sessionId:'S1', isCurrentCustomer:true, customerNickname:'Guest', paymentStatus:'pending', status:'received', orders:[order], subtotal:order.subtotal, serviceCharge:order.serviceCharge, sst:order.sst, grandTotal:order.grandTotal};
        setFixture({currentSessionId:'S1', participants:[participant], grandTotal:order.grandTotal, tableNumber:1, hasSession:true, hasTableSession:true, isLoading:false, error:'', paymentStatus:'pending'});
        const page = kind === 'details' ? <Modal order={order} onClose={()=>{}}/> : <TableSummary/>;
        return renderToStaticMarkup(<CustomerLanguageProvider><CustomerSessionContext.Provider value={{session:{sessionId:'S1',tableSessionId:'T1'}}}><ToastContext.Provider value={{showToast(){}}}>{page}</ToastContext.Provider></CustomerSessionContext.Provider></CustomerLanguageProvider>);
      }`, resolveDir: root, loader: 'jsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'read-only-summary-fixture', setup(plugin) {
      plugin.onResolve({ filter: /useTableSummary(?:\.js)?$/ }, () => ({ path: 'summary-fixture', namespace: 'fixture' }))
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'let fixture; export function setFixture(value){fixture=value} export default function useTableSummary(){return fixture}', loader: 'js' }))
      // Expand the real participant section for SSR without changing the file.
      plugin.onLoad({ filter: /pages\/customer\/TableSummary\.jsx$/ }, ({ path: file }) => ({ contents: readFileSync(file, 'utf8').replace('useState(false)', 'useState(true)'), loader: 'jsx' }))
    } }],
  })
  const filename = path.join(root, 'tests', '__charges-memory.cjs')
  const module = new Module(filename)
  module.filename = filename
  module.paths = Module._nodeModulePaths(root)
  const require = createRequire(filename)
  module.require = (name) => name === 'react-dom' ? { ...require(name), createPortal: (children) => children } : require(name)
  module._compile(result.outputFiles[0].text, filename)
  const order = { id: 'O1', orderNumber: 'D002', tableNumber: 1, status: 'received', paymentStatus: 'pending', orderType: 'dine_in', createdAt: '2026-10-11T10:00:00Z', subtotal: '18.00', serviceCharge: '0', sst: '0', grandTotal: '18.00', items: [{ id: 'I1', name: 'Manicai炒饭', quantity: 2, price: 9, orderType: 'dine_in' }] }
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: {} } })
    for (const language of ['en', 'zh']) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => language } })
      const serviceLabel = language === 'en' ? 'Service charge' : '服务费'
      for (const kind of ['details', 'table']) {
        const free = module.exports.render(kind, order)
        assert.ok(!free.includes(serviceLabel), `${kind} ${language}: zero service charge must be hidden`)
        assert.ok(!free.includes('SST'), `${kind} ${language}: zero SST must be hidden`)
        assert.ok(free.includes('RM 18.00'))
        const historical = module.exports.render(kind, { ...order, serviceCharge: '1.80', sst: '1.08', grandTotal: '20.88' })
        assert.ok(historical.includes(serviceLabel), `${kind} ${language}: existing charges must remain`)
        assert.ok(historical.includes('SST'))
        assert.ok(historical.includes('RM 1.80'))
        assert.ok(historical.includes('RM 1.08'))
        // Each setting can be switched off independently.
        assert.ok(!module.exports.render(kind, { ...order, sst: '1.08' }).includes(serviceLabel))
        assert.ok(!module.exports.render(kind, { ...order, serviceCharge: '1.80' }).includes('SST'))
      }
    }
  } finally {
    for (const [key, previous] of [['localStorage', previousStorage], ['document', previousDocument]]) {
      if (previous) Object.defineProperty(globalThis, key, previous)
      else delete globalThis[key]
    }
  }
})
