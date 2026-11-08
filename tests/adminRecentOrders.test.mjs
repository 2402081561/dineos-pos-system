import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canOpenCurrentOrderVisit, orderWaitingMinutes } from '../src/utils/adminRecentOrders.js'

test('cashier actions require a verified current visit and fresh floor data', () => {
  const order = { tableId: 'T1', tableSessionId: 'visit-1', tableSessionStatus: 'active', status: 'preparing', paymentStatus: 'pending' }
  const floor = { floorTables: [{ id: 'T1', tableSessionId: 'visit-1' }], isLoading: false, error: '' }
  assert.equal(canOpenCurrentOrderVisit(order, floor), true)
  assert.equal(canOpenCurrentOrderVisit(order, { ...floor, error: 'offline' }), false)
  assert.equal(canOpenCurrentOrderVisit(order, { ...floor, isLoading: true }), false)
  assert.equal(canOpenCurrentOrderVisit(order, { ...floor, floorTables: [{ id: 'T1', tableSessionId: 'visit-2' }] }), false)
  for (const change of [{ tableSessionStatus: 'closed' }, { tableSessionId: null }, { paymentStatus: 'paid' }, { paymentStatus: undefined }, { status: 'cancelled' }]) assert.equal(canOpenCurrentOrderVisit({ ...order, ...change }, floor), false)
})

test('waiting time only applies to active orders still being prepared', () => {
  const now = Date.parse('2026-11-06T04:30:00Z')
  const order = { tableSessionStatus: 'active', status: 'received', createdAt: '2026-11-06T04:18:00Z' }
  assert.equal(orderWaitingMinutes(order, now), 12)
  assert.equal(orderWaitingMinutes({ ...order, status: 'ready' }, now), null)
  assert.equal(orderWaitingMinutes({ ...order, tableSessionStatus: 'closed' }, now), null)
  assert.equal(orderWaitingMinutes({ ...order, createdAt: 'bad' }, now), null)
})
