import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { savedTableVisitToolsEnabled } from '../src/utils/deploymentFeatures.js'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

test('production does not expose schema-032 tools without an explicit deployment flag', () => {
  assert.equal(savedTableVisitToolsEnabled(), false)
  assert.equal(savedTableVisitToolsEnabled({ PROD: true }), false)
  assert.equal(savedTableVisitToolsEnabled({ DEV: true }), true)
  assert.equal(savedTableVisitToolsEnabled({ DEV: true, VITE_SAVED_TABLE_VISITS_ENABLED: 'false' }), false)
  assert.equal(savedTableVisitToolsEnabled({ PROD: true, VITE_SAVED_TABLE_VISITS_ENABLED: 'true' }), true)
})

test('schema-031 kitchen dialog can preview and print temporary labels without any saved-identifier API', async () => {
  const runtime = hookRuntime()
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let prints = 0
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: {} } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { print() { prints++ } } })
  const h = await bundleHarness(`export {default as Dialog} from './src/components/kitchen/KitchenTicketDialog.jsx';export {default as Paper} from './src/components/kitchen/KitchenTicketPaper.jsx'`, runtime, {
    useCustomerLanguage: 'export default ()=>({t:text=>text})',
    deploymentFeatures: 'export const hasSavedTableVisitTools=false',
    'react-dom': 'export const createPortal=node=>node',
    OrderIdentifiers: 'export default function SavedIdentifiers(){throw new Error("Must not mount on schema 031")}',
  })
  const props = { order: { orderNumber: 'internal-only', status: 'ready', createdAt: '2026-10-29T10:00:00Z', tableNumber: 1, items: [{ name: 'Original', kitchenName: 'cont kt', quantity: 2, orderType: 'take_away' }] }, onClose() {} }
  const view = () => runtime.render(h.Dialog, props)
  try {
    const action = () => findElement(view(), (node) => node.type === 'button' && node.props.children === 'Print kitchen ticket')
    assert.equal(action().props.disabled, false)
    const inputs = []
    const collect = (node) => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(collect); if (node.type === 'input') inputs.push(node); Object.values(node.props ?? {}).forEach(collect) }
    collect(view())
    assert.equal(inputs.length, 2)
    inputs[0].props.onChange({ target: { value: '8899' } })
    inputs[1].props.onChange({ target: { value: 'QAA1234' } })
    const paper = h.Paper(findElement(view(), node => node.type === h.Paper).props)
    assert.ok(findElement(paper, (node) => node.type === 'p' && node.props.children === '8899'))
    assert.ok(findElement(paper, (node) => node.type === 'p' && node.props.children === 'QAA1234'))
    assert.ok(findElement(paper, (node) => node.type === 'p' && node.props.children === 'cont kt'))
    assert.ok(findElement(paper, node => node.type === 'strong' && node.props.children.join('') === '2×'))
    action().props.onClick()
    assert.equal(prints, 1)
  } finally {
    runtime.cleanup()
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else delete globalThis.document
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else delete globalThis.window
  }
})

test('kitchen printing has editable temporary identifiers without requiring database-032 reads', () => {
  const source = readFileSync(new URL('../src/components/kitchen/KitchenTicketDialog.jsx', import.meta.url), 'utf8')
  assert.match(source, /hasSavedTableVisitTools \? order&&<OrderIdentifiers/)
  assert.match(source, /!hasSavedTableVisitTools \|\| identifiers\.canPrint/)
  assert.match(source, /setIdentifiers\(\(current\)=>\(\{\.\.\.current,\[key\]:event\.target\.value\}\)\)/)
  for (const file of ['src/pages/cashier/NewOrder.jsx', 'src/components/cashier/TableOrderManager.jsx', 'src/components/common/RecentOrderDetailsPanel.jsx']) {
    assert.match(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), /hasSavedTableVisitTools&&/)
  }
})
