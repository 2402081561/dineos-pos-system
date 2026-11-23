import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

const order = { orderNumber: 'TIME-1', status: 'ready', createdAt: '2026-10-19T12:00:00Z', tableNumber: 1, orderType: 'dine_in', items: [{ name: '炒饭', quantity: 2 }] }

for (const android of [false, true]) test(`kitchen ${android ? 'Android handoff / PDF fallback' : 'browser printing'} refreshes the timestamp at each attempt`, async () => {
  const runtime = hookRuntime()
  const keys = ['document', 'window', 'navigator', 'Date']
  const saved = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const NativeDate = globalThis.Date
  let now = '2026-11-12T17:00:00Z'
  class ClockDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [now])) }
    static now() { return new NativeDate(now).getTime() }
  }
  const listeners = new Map(), printed = [], handedOff = []
  let view, h
  const ticketInView = () => findElement(view(), node => node.type === h.Paper).props.ticket
  Object.defineProperty(globalThis, 'Date', { configurable: true, value: ClockDate })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: { style: {} } } })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: android ? 'Android Chrome' : 'Desktop Chrome' } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name) },
    print() { listeners.get('beforeprint')?.(); printed.push(ticketInView()) },
    location: { assign(intent) { handedOff.push(JSON.parse(Buffer.from(intent.match(/payload=([^#]+)/)[1], 'base64url'))) } },
  } })
  try {
    h = await bundleHarness("export {default as Dialog} from './src/components/kitchen/KitchenTicketDialog.jsx';export {default as Paper} from './src/components/kitchen/KitchenTicketPaper.jsx'", runtime, {
      useCustomerLanguage: 'export default ()=>({t:text=>text})',
      deploymentFeatures: 'export const hasSavedTableVisitTools=false',
      'react-dom': 'export const createPortal=node=>node;export const flushSync=fn=>fn()',
      OrderIdentifiers: 'export default function Identifiers(){throw new Error("No database calls in this test")}',
    })
    const original = structuredClone(order)
    view = () => runtime.render(h.Dialog, { order, onClose() {} })
    const action = label => findElement(view(), node => node.type === 'button' && node.props.children === label)
    view(); runtime.effects()
    assert.equal(ticketInView().rows.at(-1).left, 'Printed at: 13/11/2026 01:00:00')
    now = '2026-11-12T17:10:01Z'
    action('Print kitchen ticket').props.onClick()
    const sent = android ? handedOff : printed
    assert.equal(sent[0].rows.at(-1).left, 'Printed at: 13/11/2026 01:10:01')
    now = '2026-11-12T17:12:02Z'
    action('Print kitchen ticket').props.onClick()
    assert.equal(sent[1].rows.at(-1).left, 'Printed at: 13/11/2026 01:12:02')
    assert.deepEqual(sent[0].rows.slice(0, -1), sent[1].rows.slice(0, -1))
    now = '2026-11-12T17:15:03Z'
    if (android) action('Print / Save PDF').props.onClick()
    else window.print() // Browser menu / Ctrl+P path.
    assert.equal(printed.at(-1).rows.at(-1).left, 'Printed at: 13/11/2026 01:15:03')
    assert.deepEqual(order, original)
    assert.ok(listeners.has('beforeprint'))
  } finally {
    runtime.cleanup()
    assert.equal(listeners.has('beforeprint'), false)
    for (const key of keys) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else delete globalThis[key] }
  }
})
