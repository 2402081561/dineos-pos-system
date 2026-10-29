import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildKitchenTicket } from '../src/utils/kitchenTicket.js'
import { androidReceiptIntent } from '../src/utils/androidReceiptPrint.js'

const order = { orderNumber: '20261019-001', status: 'received', createdAt: '2026-10-19T12:00:00Z', tableNumber: 1, orderType: 'mixed', items: [{ name: '炒饭', quantity: 2, orderType: 'dine_in', price: 9 }, { name: '炒面', quantity: 1, orderType: 'take_away', notes: '不要葱', price: 10 }] }
test('kitchen ticket carries custom identifiers and packing, but no printed order number or prices', () => {
  const original = structuredClone(order)
  const payload = buildKitchenTicket(order, { tableLabel: 'Outside A', reference: 'QAA1234 / 8899' })
  assert.equal(payload.kind, 'kitchen_ticket')
  const text = payload.rows.map((row) => row.left).join('\n')
  for (const value of ['Outside A', 'QAA1234 / 8899', '2× 炒饭', 'TAKE AWAY', 'Dine in', '不要葱']) assert.ok(text.includes(value), value)
  assert.ok(payload.rows.some((row) => row.left === 'Outside A' && row.style === 'heading'))
  assert.ok(payload.rows.some((row) => row.left === 'QAA1234 / 8899' && row.style === 'heading'))
  assert.doesNotMatch(text, /System table|Table \/ seat|Phone suffix/)
  assert.ok(!text.includes(order.orderNumber))
  assert.equal(payload.receiptNumber, order.orderNumber) // Internal duplicate warning only, never rendered on paper.
  assert.ok(!text.includes('RM'))
  assert.ok(payload.rows.every((row) => row.right === ''))
  assert.deepEqual(order, original)
  assert.deepEqual(JSON.parse(Buffer.from(androidReceiptIntent(payload).match(/payload=([^#]+)/)[1], 'base64url')), payload)
})
test('kitchen aliases can be Chinese or familiar short forms, without automatic truncation', () => {
  const payload = buildKitchenTicket({ ...order, items: [{ name: '广东粿条 Cantonese Kueh Teow', kitchenName: 'cont kt', quantity: 1, orderType: 'take_away', optionSnapshot: [{ groupName: 'Add', options: [{ label: '加蛋', price: 2 }] }] }, { name: 'Original full dish name', kitchenName: '', quantity: 1, orderType: 'dine_in' }] })
  const text = payload.rows.map((row) => row.left).join('\n')
  assert.ok(text.includes('1× cont kt'))
  assert.ok(payload.rows.some((row) => row.left === '【TAKE AWAY】'))
  assert.ok(!text.includes('Cantonese'))
  assert.ok(text.includes('Original full dish name'))
  assert.ok(text.includes('加蛋'))
  assert.ok(!text.includes('RM'))
  assert.equal(payload.rows.filter((row) => row.style === 'rule').length, 3)
})
test('cancelled, incomplete and ambiguous mixed tickets fail closed', () => {
  for (const change of [{ status: 'cancelled' }, { createdAt: 'bad' }, { items: [] }, { items: [{ name: 'x', quantity: 1 }] }, { items: [{ name: 'x', quantity: -1, orderType: 'take_away' }] }]) assert.throws(() => buildKitchenTicket({ ...order, ...change }))
  assert.throws(() => buildKitchenTicket(order, { reference: 'x'.repeat(81) }))
})
test('printer controls are removed and revision warnings retained', () => {
  const payload = buildKitchenTicket({ ...order, isAddition: true, revisionNote: 'Quantity corrected' }, { reference: '\u001b@123' })
  assert.ok(!JSON.stringify(payload).includes('\\u001b'))
  assert.ok(payload.rows.some((row) => row.left.includes('Quantity corrected')))
  assert.ok(!payload.rows.some((row) => row.left.includes('prepare these items only')))
})
test('plain identifiers have no label prefixes or extra system-table row in either language', () => {
  for (const t of [(value) => value, (value) => ({ 'Kitchen ticket': '厨房单', 'Dine in': '堂食' })[value] ?? value]) {
    const payload = buildKitchenTicket({ ...order, isAddition: true }, { tableLabel: '8899', reference: 'QAA1234', t })
    assert.deepEqual(payload.rows.filter((row) => row.style === 'heading').map((row) => row.left), [t('Kitchen ticket'), '8899', 'QAA1234'])
    assert.ok(!payload.rows.some((row) => /Additional order|prepare these items only|System table/.test(row.left)))
  }
  const fallback = buildKitchenTicket(order)
  assert.equal(fallback.rows[1].left, '1')
})
test('minimal kitchen paper labels each dining group once, without queue numbers, dates or timestamps', () => {
  for (const type of ['dine_in', 'take_away']) {
    const ticket = buildKitchenTicket({ ...order, orderType: type, isAddition: true, items: [{ name: '公保猪肉饭', kitchenName: 'G/O Pork Rice', quantity: 3, orderType: type }] }, { tableLabel: '8899' })
    assert.deepEqual(ticket.rows.map((row) => row.left), ['Kitchen ticket', '8899', '', `【${type === 'take_away' ? 'TAKE AWAY' : 'Dine in'}】`, '3× G/O Pork Rice', ''])
  }
  const t = (value) => ({ 'Kitchen ticket': '厨房单', 'Dine in': '堂食', 'TAKE AWAY': '打包' })[value] ?? value
  const ticket = buildKitchenTicket(order, { t })
  assert.ok(ticket.rows.some((row) => row.left === '【堂食】'))
  assert.ok(ticket.rows.some((row) => row.left === '【打包】'))
  assert.ok(ticket.rows.some((row) => row.left === '2× 炒饭'))
  assert.ok(ticket.rows.some((row) => row.left === '1× 炒面'))
  assert.ok(ticket.rows.some((row) => row.left.includes('不要葱')))
})
test('interleaved mixed items retain quantities and attached notes within two clearly separated groups', () => {
  const items = [
    { name: 'A', quantity: 1, orderType: 'take_away', notes: 'A note' },
    { name: 'B', quantity: 2, orderType: 'dine_in', notes: 'B note' },
    { name: 'C', quantity: 3, orderType: 'take_away' },
    { name: 'D', quantity: 4, orderType: 'dine_in' },
  ]
  const original = structuredClone(items)
  const rows = buildKitchenTicket({ ...order, items }).rows.map((row) => row.left)
  assert.deepEqual(rows.slice(3), ['【Dine in】', '2× B', 'Notes: B note', '4× D', '', '【TAKE AWAY】', '1× A', 'Notes: A note', '3× C', ''])
  assert.equal(rows.filter((text) => text.includes('Dine in')).length, 1)
  assert.equal(rows.filter((text) => text.includes('TAKE AWAY')).length, 1)
  assert.deepEqual(items, original)
})
