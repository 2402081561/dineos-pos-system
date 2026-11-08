import assert from 'node:assert/strict'
import test from 'node:test'
import { allocateBill, defaultConfig, orderingAvailability, orderAmounts, resolveOptions, validateOptionGroups, validateStoreConfig } from '../src/posRules.js'
import { buildCounterOrder } from '../src/counterOrder.js'
import { registerOrderChangeRoutes, validateOrderChange } from '../src/orderChanges.js'

const groups = [{ id: 'temp', name: 'Temperature', min: 1, max: 1, options: [{ id: 'hot', label: 'Hot', price: 0, isAvailable: true }, { id: 'ice', label: 'Ice', price: 0.5, isAvailable: true }] }, { id: 'extras', name: 'Add-ons', min: 0, max: 2, options: [{ id: 'egg', label: 'Egg', price: 1.5, isAvailable: true }, { id: 'milk', label: 'Milk', price: 2, isAvailable: false }] }]
test('handoff confirmation defaults to on for existing stores and accepts only explicit booleans', () => {
  assert.equal(validateStoreConfig({}).requireHandoffConfirmation, true)
  assert.equal(validateStoreConfig({ requireHandoffConfirmation: false }).requireHandoffConfirmation, false)
  assert.throws(() => validateStoreConfig({ requireHandoffConfirmation: 'false' }))
})
test('charges can be disabled independently without changing historical order rates', () => {
  const serviceOnly = validateStoreConfig({ serviceChargeRate: 5, sstRate: 0 })
  const sstOnly = validateStoreConfig({ serviceChargeRate: 0, sstRate: 6 })
  assert.equal(orderAmounts(100, serviceOnly).grandTotal, 105)
  assert.equal(orderAmounts(100, sstOnly).grandTotal, 106)
  const historical = { id: 'old', subtotal: 100, serviceChargeRate: 10, sstRate: 6 }
  assert.equal(allocateBill([historical]).grandTotal, 116)
  assert.equal(orderAmounts(100, validateStoreConfig({ serviceChargeRate: 0, sstRate: 0 })).grandTotal, 100)
})
test('store configuration accepts optional details, zero charges and overnight hours', () => {
  const config = validateStoreConfig({ address: 'Kuching\nSarawak', phone: '+60123456789', logoUrl: 'https://example.com/logo.png', serviceChargeRate: '0', sstRate: 0, openingHours: defaultConfig.openingHours.map((day) => ({ ...day, open: '18:00', close: '02:00' })) })
  assert.equal(config.serviceChargeRate, 0)
  assert.equal(config.address, 'Kuching\nSarawak')
  assert.deepEqual(orderAmounts(9.9, config), { subtotal: 9.9, serviceCharge: 0, sst: 0, grandTotal: 9.9, serviceChargeRate: 0, sstRate: 0 })
})
test('bad settings and arbitrary extra keys are rejected', () => {
  for (const config of [{ logoUrl: 'javascript:alert(1)' }, { logoUrl: 'https://user:pass@example.com/logo' }, { acceptingOrders: 'false' }, { serviceChargeRate: -1 }, { sstRate: 101 }, { serviceChargeRate: '5.555' }, { openingHours: [] }, { address: 'a'.repeat(301) }, { toString: 'x' }, { databasePassword: 'x' }]) assert.throws(() => validateStoreConfig(config))
  assert.throws(() => validateStoreConfig({ openingHours: defaultConfig.openingHours.map((day) => ({ ...day, close: day.open })) }))
})
test('QR pause and Malaysian opening hours use start inclusive / close exclusive', () => {
  const config = { ...defaultConfig, enforceOpeningHours: true }
  assert.equal(orderingAvailability(config, new Date('2026-10-05T00:59:00Z')).isAcceptingOrders, false)
  assert.equal(orderingAvailability(config, new Date('2026-10-05T01:00:00Z')).isAcceptingOrders, true)
  assert.equal(orderingAvailability(config, new Date('2026-10-05T14:00:00Z')).isAcceptingOrders, false)
  assert.equal(orderingAvailability({ ...config, acceptingOrders: false }, new Date('2026-10-05T04:00:00Z')).isAcceptingOrders, false)
})
test('overnight opening carries into a closed following day, but not beyond closing', () => {
  const config = { ...defaultConfig, enforceOpeningHours: true, openingHours: defaultConfig.openingHours.map((entry) => ({ ...entry, closed: entry.day !== 1, open: '18:00', close: '02:00' })) }
  assert.equal(orderingAvailability(config, new Date('2026-10-05T17:59:00Z')).isAcceptingOrders, true)
  assert.equal(orderingAvailability(config, new Date('2026-10-05T18:00:00Z')).isAcceptingOrders, false)
  assert.equal(orderingAvailability(config, new Date('2026-10-06T10:00:00Z')).isAcceptingOrders, false)
})
test('option rules reject duplicates, invalid prices and unsatisfiable requirements', () => {
  assert.equal(validateOptionGroups(groups).length, 2)
  for (const input of [[{ ...groups[0], id: undefined }], [groups[0], groups[0]], [{ ...groups[0], min: 3 }], [{ ...groups[0], options: [{ ...groups[0].options[0], price: -1 }] }], [{ ...groups[0], options: [{ ...groups[0].options[0], isAvailable: false }] }]]) assert.throws(() => validateOptionGroups(input))
})
test('required, maximum, removed and sold-out options cannot be ordered', () => {
  for (const selection of [[], [{ groupId: 'temp', optionIds: ['hot', 'ice'] }], [{ groupId: 'temp', optionIds: ['hot', 'hot'] }], [{ groupId: 'wrong', optionIds: [] }], [{ groupId: 'temp', optionIds: ['unknown'] }], [{ groupId: 'temp', optionIds: ['hot'] }, { groupId: 'extras', optionIds: ['milk'] }], [{ groupId: 'temp', optionIds: ['hot'] }, { groupId: 'temp', optionIds: ['ice'] }]]) assert.throws(() => resolveOptions(groups, selection))
})
test('server computes add-on pricing and saves names/prices independently of client amounts', () => {
  const selections = [{ groupId: 'temp', optionIds: ['ice'] }, { groupId: 'extras', optionIds: ['egg'] }]
  const resolved = resolveOptions(groups, selections)
  assert.equal(resolved.extraPrice, 2)
  assert.equal(resolved.optionSnapshot[0].options[0].label, 'Ice')
  const order = buildCounterOrder([{ menuItemId: 'tea', quantity: 2, selections, unitPrice: 0 }], [{ id: 'tea', name: 'Tea', price: 3, optionGroups: groups, isAvailable: true, categoryEnabled: true }], { serviceChargeRate: 0, sstRate: 0 })
  assert.equal(order.items[0].unitPrice, 5)
  assert.equal(order.grandTotal, 10)
  assert.equal(order.items[0].optionSnapshot[1].options[0].price, 1.5)
})
test('billing preserves rate snapshots, allocates every cent and never produces negative lines', () => {
  const bill = allocateBill([{ id: 'a', subtotal: 10, serviceChargeRate: 0, sstRate: 0 }, { id: 'b', subtotal: 20, serviceChargeRate: 10, sstRate: 6 }], 3)
  assert.equal(bill.grandTotal, 29.88)
  assert.equal(bill.finalOrders[0].grandTotal, 9)
  assert.equal(bill.finalOrders[1].grandTotal, 20.88)
  for (let subtotal = 1; subtotal < 100; subtotal++) for (let discount = 0; discount <= subtotal; discount++) {
    const parts = Array.from({ length: subtotal }, (_, id) => ({ id, subtotal: 0.01 }))
    const result = allocateBill(parts, discount / 100)
    assert.equal(Math.round(result.grandTotal * 100), Math.round(orderAmounts((subtotal - discount) / 100).grandTotal * 100))
    assert.equal(Math.round(result.finalOrders.reduce((sum, row) => sum + row.discountAmount, 0) * 100), discount)
    assert.ok(result.finalOrders.every((row) => row.discountAmount <= row.subtotal && row.grandTotal >= 0))
  }
  assert.throws(() => allocateBill([{ subtotal: 5 }], 6))
})

const orderId = '11111111-1111-4111-8111-111111111111'
const order = { id: orderId, status: 'received', paymentStatus: 'pending', version: 2, serviceChargeRate: 0, sstRate: 6 }
const items = [{ id: 'line1', name: 'Tea', price: '5.00', quantity: 2, notes: '', optionSnapshot: [] }]
const body = { expectedVersion: 2, reason: 'Customer requested one', items: [{ id: 'line1', quantity: 1, notes: 'Less sugar' }] }
test('only before-preparation cashier edits are allowed; admin edits retain prices and restart ready tickets', () => {
  assert.equal(validateOrderChange(order, items, body, 'cashier').grandTotal, 5.3)
  assert.throws(() => validateOrderChange({ ...order, status: 'preparing' }, items, body, 'cashier'), { status: 403 })
  assert.equal(validateOrderChange({ ...order, status: 'ready' }, items, body, 'admin').status, 'preparing')
  for (const state of [{ paymentStatus: 'paid' }, { status: 'served' }, { status: 'cancelled' }]) assert.throws(() => validateOrderChange({ ...order, ...state }, items, body, 'admin'), { status: 409 })
})
test('edit validation blocks stale versions, missing reasons, omitted/duplicate rows and invalid quantities', () => {
  for (const input of [{ ...body, expectedVersion: 1 }, { ...body, reason: '' }, { ...body, items: [] }, { ...body, items: [{ id: 'line1', quantity: -1, notes: '' }] }, { ...body, items: [{ id: 'line1', quantity: '1', notes: '' }] }, { ...body, items: [{ id: 'line2', quantity: 1, notes: '' }] }, { ...body, items: [{ id: 'line1', quantity: 2, notes: '' }] }]) assert.throws(() => validateOrderChange(order, items, input, 'admin'))
  const cancelled = validateOrderChange(order, items, { ...body, items: [{ id: 'line1', quantity: 0, notes: '' }] }, 'cashier')
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.grandTotal, 0)
})

function changeFixture({ row = order, failAudit = false } = {}) {
  const routes = new Map(), queries = []
  const client = { async query(sql, values) {
    queries.push({ sql, values })
    if (sql.includes('FROM orders WHERE id')) return { rows: [row] }
    if (sql.includes('FROM order_items WHERE order_id')) return { rows: items }
    if (failAudit && sql.includes('INSERT INTO audit_logs')) throw new Error('Audit database error')
    return { rows: [] }
  }, release() {} }
  const auth = (request, response, next) => request.user ? next() : response.status(401).json({ error: 'No auth' })
  const roles = (...allowed) => (request, response, next) => allowed.includes(request.user.role) ? next() : response.status(403).json({ error: 'No permission' })
  registerOrderChangeRoutes({ get(path, ...handlers) { routes.set('GET ' + path, handlers) }, patch(path, ...handlers) { routes.set('PATCH ' + path, handlers) } }, { pool: { connect: async () => client }, requireAuthenticatedUser: auth, requireRole: roles })
  return { queries, async request(role = 'cashier', input = body, path = '/api/v1/cashier/orders/:orderId/items') {
    let code = 200, data, error, complete = false
    const response = { status(next) { code = next; return this }, json(next) { data = next; complete = true; return this } }
    for (const handler of routes.get('PATCH ' + path)) { if (complete) break; await handler({ params: { orderId }, body: input, ...(role ? { user: { role, id: 'actor' } } : {}) }, response, (next) => { if (next) { error = next; complete = true } }) }
    return { code, data, error }
  } }
}
test('transaction commits the ticket and immutable before/after audit together', async () => {
  const app = changeFixture(), response = await app.request()
  assert.equal(response.code, 200)
  assert.equal(response.data.order.version, 3)
  const history = app.queries.find(({ sql }) => sql.includes('INSERT INTO order_revisions'))
  assert.equal(JSON.parse(history.values[3]).items[0].quantity, 2)
  assert.equal(JSON.parse(history.values[4]).items[0].quantity, 1)
  assert.equal(app.queries.filter(({ sql }) => sql === 'COMMIT').length, 1)
  assert.ok(app.queries.some(({ sql }) => sql.includes('FOR UPDATE')))
})
test('unauthorized, paid and stale edits never write; audit failures roll back all changes', async () => {
  for (const role of [undefined, 'kitchen', 'staff']) { const app = changeFixture(); assert.equal((await app.request(role === undefined ? '' : role)).code, role === undefined ? 401 : 403); assert.equal(app.queries.length, 0) }
  for (const row of [{ ...order, paymentStatus: 'paid' }, { ...order, version: 3 }]) { const app = changeFixture({ row }); assert.equal((await app.request()).code, 409); assert.ok(!app.queries.some(({ sql }) => sql.startsWith('UPDATE') || sql.startsWith('DELETE'))) }
  const app = changeFixture({ failAudit: true })
  assert.equal((await app.request()).error.message, 'Audit database error')
  assert.ok(app.queries.some(({ sql }) => sql === 'ROLLBACK'))
  assert.ok(!app.queries.some(({ sql }) => sql === 'COMMIT'))
})
test('admin cancel uses the same reason, version and snapshot guard', async () => {
  const app = changeFixture()
  const result = await app.request('admin', { reason: 'Wrong order', expectedVersion: 2 }, '/api/v1/admin/orders/:orderId/cancel')
  assert.equal(result.data.order.status, 'cancelled')
  assert.ok(app.queries.some(({ sql }) => sql.startsWith('DELETE FROM order_items')))
  assert.ok(app.queries.some(({ sql }) => sql.includes('INSERT INTO order_revisions')))
})
