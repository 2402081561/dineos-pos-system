import assert from 'node:assert/strict'
import test from 'node:test'
import { canCancelCustomerOrder, ordersForParticipant, unpaidOrderItems } from '../src/utils/customerOrder.js'

test('counter tickets cannot be cancelled by customers, while own unpaid received orders still can', () => {
  const received = { status: 'received', paymentStatus: 'pending' }
  assert.equal(canCancelCustomerOrder(received), true)
  assert.equal(canCancelCustomerOrder({ ...received, isCounterOrder: true }), false)
  assert.equal(canCancelCustomerOrder({ ...received, paymentStatus: 'paid' }), false)
  for (const status of ['preparing', 'ready', 'served', 'cancelled', undefined]) {
    assert.equal(canCancelCustomerOrder({ ...received, status }), false)
  }
})

test('visible counter tickets belong to the counter participant, not the current guest bill twice', () => {
  const own = { id: 'own', customerSessionId: 'qr', isCounterOrder: false }
  const counter = { id: 'counter', customerSessionId: 'cashier', isCounterOrder: true }
  const legacy = { id: 'old-api-own', isCounterOrder: false }
  const orders = [own, counter, legacy]
  assert.deepEqual(ordersForParticipant(orders, { id: 'qr', isCurrentCustomer: true }), [own, legacy])
  assert.deepEqual(ordersForParticipant(orders, { id: 'cashier', isCounterOrder: true }), [counter])
  assert.deepEqual(ordersForParticipant(orders, { id: 'other-guest' }), [])
})

test('table summary shows only unpaid quantities without rewriting order history', () => {
  const order = { status: 'received', paymentStatus: 'pending', items: [{ id: 'mee', quantity: 3, paidQuantity: 1 }, { id: 'tea', quantity: 1, paidQuantity: 1 }] }
  assert.deepEqual(unpaidOrderItems(order), [{ id: 'mee', quantity: 2, paidQuantity: 1 }])
  assert.equal(order.items[0].quantity, 3)
  assert.equal(canCancelCustomerOrder(order), false)
})
