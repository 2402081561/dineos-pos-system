import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import Module, { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import { watchOrderDetails } from '../src/utils/orderDetailsSubscription.js'
import { bundleHarness, hookRuntime, flush } from './helpers/hookHarness.mjs'

function scheduler() {
  let timer
  return { options: { schedule: (callback) => { timer = callback; return callback }, cancel: () => { timer = null } }, tick: () => timer?.(), hasTimer: () => Boolean(timer) }
}

test('changing tickets or closing ignores delayed reads from the old selection', async () => {
  let resolveOld
  const events = []
  const schedule = scheduler()
  const old = watchOrderDetails(() => new Promise((resolve) => { resolveOld = resolve }), (state) => events.push(state), schedule.options)
  const oldRead = old.refresh()
  await Promise.resolve()
  old.stop()
  const current = watchOrderDetails(async () => ({ id: 'B', tableNumber: 1 }), (state) => events.push(state), schedule.options)
  await current.refresh()
  resolveOld({ id: 'A', tableNumber: 1 })
  await oldRead
  assert.equal(events.at(-1).order.id, 'B')
  assert.ok(!events.some((event) => event.order?.id === 'A'))
  current.stop()
  assert.equal(schedule.hasTimer(), false)
})

test('slow polling reads do not overlap, failure and retry recover payment changes', async () => {
  const schedule = scheduler()
  let calls = 0
  let resolveFirst
  let fail = false
  const events = []
  const watcher = watchOrderDetails(() => {
    calls++
    if (calls === 1) return new Promise((resolve) => { resolveFirst = resolve })
    if (fail) throw new Error('offline')
    return { id: 'A', paymentStatus: 'paid', receiptNumber: 'R001' }
  }, (state) => events.push(state), schedule.options)
  const initial = watcher.refresh()
  assert.equal(watcher.refresh(), initial)
  await Promise.resolve()
  assert.equal(calls, 1)
  resolveFirst({ id: 'A', paymentStatus: 'pending' })
  await initial
  fail = true
  await schedule.tick()
  assert.equal(events.at(-1).error, 'offline')
  fail = false
  await watcher.refresh()
  assert.equal(events.at(-1).order.receiptNumber, 'R001')
  assert.equal(events.at(-1).error, '')
  watcher.stop()
})

test('closing details aborts the previous read and never starts a queued read after close', async () => {
  const events = []
  let signal
  const watcher = watchOrderDetails((value) => {
    signal = value
    return new Promise((_resolve, reject) => value.addEventListener('abort', () => reject(new DOMException('Closed', 'AbortError')), { once: true }))
  }, state => events.push(state))
  const pending = watcher.refresh()
  await Promise.resolve()
  watcher.stop()
  assert.equal(signal.aborted, true)
  await pending
  assert.equal(events.length, 1, 'Only initial loading, no obsolete error/success')
  const stopped = watchOrderDetails(() => assert.fail('Closed before initial request'), () => {})
  const queued = stopped.refresh()
  stopped.stop()
  await queued
})

test('actual details hook cancels rapid previous selections and cleanup reaches the API signal', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as useDetails} from './src/hooks/useOrderDetails.js';export {fixture} from 'details-fixture'`, runtime, {
    'details-fixture': 'export const fixture={reads:[]}',
    adminApiService: `import {fixture} from 'details-fixture';export function getSupabaseOrderDetails(id,signal){fixture.reads.push({id,signal});return new Promise((resolve,reject)=>{fixture.reads.at(-1).resolve=resolve;signal.addEventListener('abort',()=>reject(new DOMException('Closed','AbortError')),{once:true})})}`,
  })
  // Use a stable component identity, just as React does between prop changes.
  function Component({ id }) { return h.useDetails(id) }
  try {
    runtime.render(Component, { id: 'A' }); runtime.effects(); await flush()
    runtime.render(Component, { id: 'B' }); runtime.effects(); await flush()
    assert.equal(h.fixture.reads[0].signal.aborted, true)
    assert.equal(h.fixture.reads[1].id, 'B')
    h.fixture.reads[1].resolve({ id: 'B', items: [] }); await flush()
    assert.equal(runtime.render(Component, { id: 'B' }).order.id, 'B')
    runtime.cleanup()
    assert.equal(h.fixture.reads[1].signal.aborted, false, 'Settled read needs no cancellation')
  } finally { runtime.cleanup() }
})

test('real detail panel supports mixed items, settled receipt only, hidden zero charges and bilingual copy', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const result = buildSync({
    stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {MemoryRouter} from 'react-router-dom'; import CustomerLanguageProvider from './src/context/CustomerLanguageProvider.jsx'; import {OrderDetailsPanelContent} from './src/components/common/RecentOrderDetailsPanel.jsx'; import CashierOverview from './src/components/cashier/CashierOverview.jsx'; export function render(order, compact=false) { return renderToStaticMarkup(<CustomerLanguageProvider><MemoryRouter><OrderDetailsPanelContent compact={compact} order={order} returnTo="/admin/dashboard" /></MemoryRouter></CustomerLanguageProvider>) } export function workspace(props) { return renderToStaticMarkup(<CustomerLanguageProvider><MemoryRouter initialEntries={['/cashier?tableId=T1']}><CashierOverview {...props}/></MemoryRouter></CustomerLanguageProvider>) }`, resolveDir: root, loader: 'jsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
    define: { 'import.meta.env': '{}' },
  })
  const filename = path.join(root, 'tests', '__details-render.cjs')
  const module = new Module(filename)
  module.filename = filename
  module.paths = Module._nodeModulePaths(root)
  module.require = createRequire(filename)
  module._compile(result.outputFiles[0].text, filename)
  const order = { id: 'A', orderNumber: 'D002', tableNumber: 1, status: 'ready', paymentStatus: 'pending', orderType: 'mixed', subtotal: '18', serviceCharge: '0', sst: '0', grandTotal: '18', paidAmount: '0', items: [{ id: 'I1', name: 'Manicai炒饭', price: 9, quantity: 1, orderType: 'dine_in' }, { id: 'I2', name: 'Butter chicken', price: 9, quantity: 1, orderType: 'take_away', notes: 'Less spicy' }] }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  try {
    for (const language of ['en', 'zh']) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => language } })
      const html = module.exports.render(order)
      assert.ok(html.includes('Manicai炒饭'))
      assert.ok(html.includes('Less spicy'))
      assert.ok(html.includes(language === 'en' ? 'Take away' : '打包'))
      assert.ok(html.includes(language === 'en' ? 'Not paid' : '未付款'))
      assert.ok(!html.includes('cashier/receipt'))
      assert.ok(!html.includes(language === 'en' ? 'Service charge' : '服务费'))
      assert.ok(!html.includes('SST'))
      // A receipt reference alone must not enable printing without a settled payment.
      assert.ok(!module.exports.render({ ...order, receiptNumber: 'R001' }).includes('cashier/receipt'))
      const partial = module.exports.render({ ...order, paidAmount: 9, receiptNumber: 'R001', latestPaymentAt: '2026-10-09T10:00:00Z' })
      assert.ok(partial.includes('/cashier/receipt/R001?print=1'))
      assert.ok(partial.includes(language === 'en' ? 'This receipt covers only' : '此收据只包含'))
      assert.ok(partial.includes(language === 'en' ? 'Amount paid' : '已付金额'))
      const paid = module.exports.render({ ...order, paidAmount: 18, paymentStatus: 'paid', receiptNumber: 'R002', latestPaymentAt: '2026-10-09T10:00:00Z' })
      assert.ok(paid.includes('/cashier/receipt/R002?print=1'))
      const compact = module.exports.render({ ...order, cashierName: 'Demo cashier', paidAmount: 18, paymentStatus: 'paid', receiptNumber: 'R002', latestPaymentAt: '2026-10-09T10:00:00Z' }, true)
      assert.ok(compact.includes(language === 'en' ? 'View full order' : '查看完整订单'))
      assert.ok(compact.includes('Demo cashier'))
      assert.ok(compact.includes('/cashier/receipt/R002?print=1'))
      assert.ok(compact.includes('Less spicy'))
      assert.ok(!/<details[^>]*\sopen[\s>]/.test(compact), 'compact metadata starts collapsed')
      assert.ok(!module.exports.render(order, true).includes('cashier/receipt'))
      const workspace = { summary: null, recentOrders: Array.from({length:8}, (_,i)=>({...order,id:`order-${i}`,orderNumber:`TEST-${i}`})), floorTables:[{id:'T1',tableNumber:1,tableSessionId:'visit-1',status:'awaiting_payment',unpaidOrderCount:1,unpaidTotal:18}], floorPlan:{markers:[],revision:0},paymentTables:[{tableNumber:1,orders:[{...order,tableSessionId:'visit-1'}]}],clearableTables:[], onOpenTable:()=>{},onClearTable:()=>{} }
      const overview = module.exports.workspace(workspace)
      assert.ok(overview.includes(language === 'en' ? 'Collect payment' : '收款'))
      assert.ok(overview.includes(language === 'en' ? 'Edit layout' : '编辑布局'))
      assert.ok(overview.includes('/cashier/new-order?tableId=T1'))
      assert.ok(overview.includes('TEST-5'))
      assert.ok(!overview.includes('TEST-6'), 'initial recent list is compact, with view-all for remaining tickets')
      assert.ok(!overview.includes('free floor plan'), 'default table view uses compact cards')
      const staleVisit = module.exports.workspace({...workspace,paymentTables:[{tableNumber:1,orders:[{...order,tableSessionId:'old-visit'}]}]})
      assert.ok(!staleVisit.includes(language === 'en' ? 'Collect payment' : '收款'), 'historical visits cannot trigger current-visit collection')
      const clearable = module.exports.workspace({...workspace,paymentTables:[],clearableTables:[{tableId:'T1'}]})
      assert.ok(clearable.includes(language === 'en' ? '>Clear table<' : '>清桌<'))
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  }
})
