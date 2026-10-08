import assert from 'node:assert/strict'
import test from 'node:test'
import { paymentPlan } from '../src/paymentSelection.js'
import { validateHandoff } from '../src/handoffs.js'
import { validateOrderChange } from '../src/orderChanges.js'

const order = { id: 'o', serviceChargeRate: 10, sstRate: 6, items: [{ id: 'a', price: 9, quantity: 3, paidQuantity: 0, orderType: 'dine_in' }, { id: 'b', price: 5, quantity: 1, paidQuantity: 0, orderType: 'take_away' }] }
test('pay one of three portions, then only the remaining quantities', () => {
  const first = paymentPlan([order], [{ itemId: 'a', quantity: 1 }])
  assert.equal(first.grandTotal, 10.44)
  assert.equal(first.finalOrders[0].remaining.grandTotal, 26.68)
  assert.equal(first.finalOrders[0].fullyPaid, false)
  assert.equal(first.finalOrders[0].items[0].quantity, 1)
  const next = { ...order, items: order.items.map((i) => ({ ...i, paidQuantity: i.id === 'a' ? 1 : 0 })) }
  assert.throws(() => paymentPlan([next], [{ itemId: 'a', quantity: 3 }]), /already been paid/)
  const final = paymentPlan([next], [{ itemId: 'a', quantity: 2 }, { itemId: 'b', quantity: 1 }])
  assert.equal(final.grandTotal, 26.68)
  assert.equal(final.finalOrders[0].fullyPaid, true)
  assert.equal(final.finalOrders[0].remaining.grandTotal, 0)
  assert.equal(order.items[0].paidQuantity, 0)
})
test('invalid quantities, foreign and duplicate item IDs are rejected', () => {
  for (const selections of [[], [{ itemId: 'a', quantity: 0 }], [{ itemId: 'a', quantity: -1 }], [{ itemId: 'a', quantity: 0.5 }], [{ itemId: 'a', quantity: NaN }], [{ itemId: 'missing', quantity: 1 }], [{ itemId: 'a', quantity: 1 }, { itemId: 'a', quantity: 1 }]]) assert.throws(() => paymentPlan([order], selections))
})
test('discount is applied only to the selected bill, including zero-price items', () => {
  const result = paymentPlan([order], [{ itemId: 'b', quantity: 1 }], 5)
  assert.equal(result.grandTotal, 0)
  assert.equal(result.finalOrders[0].remaining.grandTotal, 31.32)
  assert.equal(result.finalOrders[0].fullyPaid, false)
})
test('handoff is quantity- and version-checked, regardless of payment', () => {
  const item = { quantity: 3, fulfilledQuantity: 1 }
  for (const paymentStatus of ['pending', 'paid']) assert.doesNotThrow(() => validateHandoff({ status: 'ready', version: 2, paymentStatus }, item, 2, 2))
  for (const [status, quantity, version] of [['preparing', 1, 2], ['cancelled', 1, 2], ['ready', 3, 2], ['ready', 0, 2], ['ready', 1, 1]]) assert.throws(() => validateHandoff({ status, version: 2 }, item, quantity, version))
})
test('editing cannot rewrite partially paid or partially handed-over history', () => {
  for (const item of [{ paidQuantity: 1 }, { fulfilledQuantity: 1 }]) assert.throws(() => validateOrderChange({ status: 'ready', paymentStatus: 'pending' }, [item], {}, 'admin'), /history/)
})
