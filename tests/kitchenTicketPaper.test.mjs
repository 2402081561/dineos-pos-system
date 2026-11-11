import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { buildKitchenTicket } from '../src/utils/kitchenTicket.js'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

const original = { orderNumber: 'preview-001', status: 'ready', createdAt: '2026-11-10T12:00:00Z', isWalkIn: true, orderType: 'mixed', items: [
  { name: '苦瓜炒蛋 Bitter Gourd with Egg', quantity: 1, orderType: 'dine_in' },
  { name: 'Manicai炒饭/Fried Rice with Maniacai', quantity: 2, orderType: 'dine_in', notes: '不要炒饭', optionSnapshot: [{ options: [{ label: '加蛋' }] }] },
  { name: '福建面 Hokkian Mee', quantity: 1, orderType: 'take_away' },
] }
const t = text => ({ 'Notes': '备注', 'Walk-in': '散客', 'Kitchen ticket': '厨房单', 'Dine in': '堂食', 'TAKE AWAY': '打包' })[text] ?? text

test('kitchen paper separates quantities without dropping long bilingual names, options or notes', async () => {
  const { Paper } = await bundleHarness("export {default as Paper} from './src/components/kitchen/KitchenTicketPaper.jsx'", hookRuntime())
  const order = structuredClone(original)
  const ticket = buildKitchenTicket(order, { t })
  const tree = Paper({ ticket, label: '厨房单预览' })
  assert.equal(tree.props['aria-label'], '厨房单预览')
  const rows = tree.props.children
  const items = rows.filter(node => node.props.className === 'kitchen-ticket-item')
  assert.equal(items.length, 3)
  assert.deepEqual(items.map(node => findElement(node, part => part.type === 'strong').props.children.join('')), ['1×', '2×', '1×'])
  assert.deepEqual(items.map(node => findElement(node, part => part.props?.className === 'kitchen-ticket-name').props.children), order.items.map(item => item.name))
  const notes = rows.findIndex(node => node.props.children === '备注: 不要炒饭')
  assert.equal(rows[notes].props.className, 'kitchen-ticket-detail')
  assert.ok(rows[notes - 1].props.children.includes('加蛋'))
  assert.ok(notes > rows.indexOf(items[1]) && notes < rows.indexOf(items[2]))
  assert.ok(rows.some(node => node.props.className === 'kitchen-ticket-group' && node.props.children === '打包'))
  assert.deepEqual(order, original)
  assert.equal(ticket.version, 1)
  assert.ok(ticket.rows.every(row => ['normal', 'bold', 'heading', 'center', 'rule'].includes(row.style) && row.right === ''))
  assert.ok(ticket.rows.some(row => row.left === '备注: 不要炒饭' && row.style === 'normal'), 'Existing Android helper receives smaller normal-weight notes')
  assert.ok(!ticket.rows.some(row => row.left.includes(order.orderNumber)), 'Order number is dialog context only, not added to the minimal paper')
})

test('kitchen aliases remain explicit, and heading identifiers cannot be mistaken for food', async () => {
  const { Paper } = await bundleHarness("export {default as Paper} from './src/components/kitchen/KitchenTicketPaper.jsx'", hookRuntime())
  const ticket = buildKitchenTicket({ ...original, items: [{ ...original.items[0], kitchenName: '苦瓜蛋' }] }, { tableLabel: '2× Outside A' })
  const rows = Paper({ ticket }).props.children
  assert.ok(rows.some(node => node.props.className === 'kitchen-ticket-location' && node.props.children === '2× Outside A'))
  assert.ok(rows.some(node => findElement(node, part => part.props?.className === 'kitchen-ticket-name' && part.props.children === '苦瓜蛋')))
})

test('paper and dialog keep scrolling controls out of browser print output', () => {
  const css = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8')
  assert.match(css, /\.kitchen-ticket-item\s*\{[^}]*grid-template-columns: 30px minmax\(0, 1fr\)/)
  assert.match(css, /\.kitchen-ticket-detail\s*\{[^}]*margin: 2px 0 0 36px/)
  assert.match(css, /\.kitchen-ticket-item\s*\{[^}]*margin-top: 5px/)
  assert.match(css, /\.kitchen-ticket-name\s*\{[^}]*font-size: 16px/, 'Keep the readable dish size while reducing whitespace')
  assert.match(css, /\.kitchen-print-content\s*\{[^}]*overflow: visible !important/)
  assert.match(css, /\.kitchen-print-controls\s*\{\s*display: none !important/)
})
