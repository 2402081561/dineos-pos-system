import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCounterOrder, CounterOrderValidationError } from '../src/counterOrder.js'

const id = '22be8aab-4ad2-4338-97b6-5dbf274eddb5'
const cart = [{ menuItemId: id, quantity: 2, notes: 'Less spicy' }]
const menu = [{ id, name: 'Nasi Lemak', price: '8.90', isAvailable: true, categoryEnabled: true }]

test('counter order uses current menu price and existing service/SST rates', () => {
  assert.deepEqual(buildCounterOrder(cart, menu), {
    items: [{ ...cart[0], id, name: 'Nasi Lemak', unitPrice: 8.9, selections: [], optionSnapshot: [], extraPrice: 0 }],
    subtotal: 17.8, serviceCharge: 1.78, sst: 1.07, grandTotal: 20.65,
    serviceChargeRate: 10, sstRate: 6,
  })
})

test('counter order rejects unavailable, deleted, invalid price and quantity', () => {
  for (const rows of [[], [{ ...menu[0], isAvailable: false }], [{ ...menu[0], price: Number.NaN }], [{ ...menu[0], price: null }], [{ ...menu[0], categoryEnabled: false }]]) {
    assert.throws(() => buildCounterOrder(cart, rows), CounterOrderValidationError)
  }
  assert.throws(() => buildCounterOrder([{ ...cart[0], quantity: 0 }], menu), CounterOrderValidationError)
})
