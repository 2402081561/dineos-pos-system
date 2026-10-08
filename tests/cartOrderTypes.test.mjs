import assert from 'node:assert/strict'
import test from 'node:test'
import { cartLineId, moveCartQuantity } from '../src/utils/cartOrderType.js'
const line = (quantity = 2, type = 'dine_in') => ({ cartItemId: cartLineId('mee', 'Less spicy', [], type), menuItemId: 'mee', name: 'Fried Mee', unitPrice: 9,
  specialInstructions: 'Less spicy', selections: [], optionSnapshot: [{ groupName: 'Size', options: [{ label: 'Regular', price: 0 }] }], quantity, orderType: type })
const subtotal = (items) => items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

test('same dish has different line IDs for dine-in and take-away', () => {
  assert.notEqual(line(1).cartItemId, line(1, 'take_away').cartItemId)
})
test('split two identical dishes into one dine-in and one takeaway without changing totals or notes', () => {
  const original = line()
  const result = moveCartQuantity([original], original.cartItemId, 1, 'take_away')
  assert.equal(result.error, '')
  assert.deepEqual(result.items.map((item) => [item.orderType, item.quantity]), [['dine_in', 1], ['take_away', 1]])
  assert.equal(subtotal(result.items), 18)
  assert.equal(original.quantity, 2)
  for (const item of result.items) {
    assert.equal(item.specialInstructions, 'Less spicy')
    assert.deepEqual(item.optionSnapshot, original.optionSnapshot)
  }
})
test('changing back merges matching lines once, without losing or duplicating quantity', () => {
  const original = line(3)
  const split = moveCartQuantity([original], original.cartItemId, 1, 'take_away').items
  const pack = split.find((item) => item.orderType === 'take_away')
  const merged = moveCartQuantity(split, pack.cartItemId, pack.quantity, 'dine_in')
  assert.deepEqual(merged.items, [original])
  assert.equal(subtotal(merged.items), 27)
})
test('whole-line toggles preserve dish order and row identity in both directions', () => {
  const original = line(2)
  const other = { ...line(1), menuItemId: 'tea', cartItemId: 'tea' }
  const changed = moveCartQuantity([original, other], original.cartItemId, 2, 'take_away')
  assert.equal(changed.items.length, 2)
  assert.equal(changed.items.find((item) => item.menuItemId === 'mee').orderType, 'take_away')
  assert.equal(changed.items.find((item) => item.menuItemId === 'tea').orderType, 'dine_in')
  assert.equal(subtotal(changed.items), 27)
  assert.deepEqual(changed.items.map((item) => item.menuItemId), ['mee', 'tea'])
  assert.equal(changed.items[0].cartRowId, original.cartItemId)
  const restored = moveCartQuantity(changed.items, changed.items[0].cartItemId, 2, 'dine_in')
  assert.deepEqual(restored.items.map((item) => item.menuItemId), ['mee', 'tea'])
  assert.equal(restored.items[0].cartRowId, changed.items[0].cartRowId)
  assert.equal(restored.items[1], other)
})
test('split portions stay adjacent and have distinct stable rows', () => {
  const original = { ...line(3), cartRowId: 'stable-mee' }
  const other = { ...line(1), menuItemId: 'tea', cartItemId: 'tea', cartRowId: 'stable-tea' }
  const result = moveCartQuantity([original, other], original.cartItemId, 1, 'take_away')
  assert.deepEqual(result.items.map((item) => [item.menuItemId, item.quantity]), [['mee', 2], ['mee', 1], ['tea', 1]])
  assert.equal(result.items[0].cartRowId, original.cartRowId)
  assert.equal(new Set(result.items.map((item) => item.cartRowId)).size, 3)
  const merged = moveCartQuantity(result.items, result.items[1].cartItemId, 1, 'dine_in')
  assert.deepEqual(merged.items, [original, other])
  assert.equal(subtotal(result.items), subtotal(merged.items))
})
test('invalid splits and capacity limits never silently discard quantity', () => {
  const original = line(2)
  for (const quantity of [0, -1, 1.5, 3]) {
    const result = moveCartQuantity([original], original.cartItemId, quantity, 'take_away')
    assert.ok(result.error); assert.deepEqual(result.items, [original])
  }
  const max = [original, line(50, 'take_away')]
  assert.ok(moveCartQuantity(max, original.cartItemId, 1, 'take_away').error)
  const full = [original, ...Array.from({ length: 29 }, (_, i) => ({ ...line(1), cartItemId: `other${i}` }))]
  assert.ok(moveCartQuantity(full, original.cartItemId, 1, 'take_away').error)
})
