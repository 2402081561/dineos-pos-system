import assert from 'node:assert/strict'
import { pickupFieldsSql } from '../src/takeawayQr.js'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { validateOrderType, orderTypeLabel, receiptOrderTypeLabel, resolveItemOrderTypes, summarizeOrderType } from '../src/orderType.js'
import { buildCounterOrder, CounterOrderValidationError } from '../src/counterOrder.js'
import { PosValidationError } from '../src/posRules.js'
import { registerTakeAwayRoutes } from '../src/takeAwayOrders.js'
import { getReceiptDetails } from '../../src/utils/receipt.js'

const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
export const insertSource = source.slice(source.indexOf('async function insertPreparedOrder'), source.indexOf('registerTakeAwayRoutes(app,'))
const id = '11111111-1111-4111-8111-111111111111'

test('per-item types override legacy ticket default and derive mixed on the server', () => {
  const original = [{ quantity: 1, orderType: 'dine_in' }, { quantity: 1, orderType: 'take_away' }]
  const resolved = resolveItemOrderTypes(original, 'take_away')
  assert.equal(summarizeOrderType(resolved), 'mixed')
  assert.deepEqual(resolved.map((item) => item.orderType), ['dine_in', 'take_away'])
  assert.equal(resolveItemOrderTypes([{}], 'take_away')[0].orderType, 'take_away')
  for (const orderType of [null, '', 'mixed', 'delivery']) assert.throws(() => resolveItemOrderTypes([{ orderType }]), (error) => error.status === 400)
  const receipt = getReceiptDetails({ orders: [{ orderType: 'mixed', subtotal: 18, items: original.map((item) => ({ ...item, name: 'Mee', price: 9 })) }] })
  assert.equal(receipt.orderType, 'Dine in / Take away')
  assert.deepEqual(receipt.items.map((item) => item.orderType), ['dine_in', 'take_away'])
  assert.equal(receipt.subtotal, 18)
})

test('order type accepts only two values and preserves old-client dine-in default', () => {
  assert.equal(validateOrderType(), 'dine_in')
  for (const value of ['dine_in', 'take_away']) assert.equal(validateOrderType(value), value)
  for (const value of [null, '', 'Take away', 'takeaway', 'delivery', 1, {}, ['take_away']]) {
    assert.throws(() => validateOrderType(value), (error) => error.status === 400)
  }
})

test('real order insertion saves server-validated type without changing prices or options', async () => {
  for (const orderType of [undefined, 'dine_in', 'take_away']) {
    const queries = []
    const client = { async query(sql, values) {
      queries.push({ sql, values })
      if (sql.startsWith('SELECT menu_items')) return { rows: [{ id, name: 'Tea', price: '5.00', isAvailable: true, categoryEnabled: true, optionGroups: [] }] }
      if (sql.startsWith('SELECT EXISTS')) return { rows: [{ present: false }] }
      if (sql.startsWith('INSERT INTO orders')) return { rows: [{ id, orderType: values.at(-1) }] }
      return { rows: [] }
    } }
    const insert = runInNewContext(insertSource + '; insertPreparedOrder', { validateOrderType, resolveItemOrderTypes, summarizeOrderType, PosValidationError, buildCounterOrder, loadStoreSettings: async () => ({ config: { serviceChargeRate: 10, sstRate: 6 }, revision: 1, isAcceptingOrders: true }) })
    const result = await insert(client, { tableSessionId: id, customerSessionId: id, requestId: id, orderType, cartItems: [{ menuItemId: id, quantity: 2, notes: 'Hot' }] })
    assert.equal(result.rows[0].orderType, orderType ?? 'dine_in')
    const values = queries.find((entry) => entry.sql.startsWith('INSERT INTO orders')).values
    assert.deepEqual(Array.from(values.slice(3, 7)), [10, 1, 0.6, 11.6])
    assert.equal(queries.find((entry) => entry.sql.startsWith('INSERT INTO order_items')).values[5], 'Hot')
    assert.equal(queries.find((entry) => entry.sql.startsWith('INSERT INTO order_items')).values[8], orderType ?? 'dine_in')
    assert.match(queries.find((entry) => entry.sql.startsWith('INSERT INTO orders')).sql, /order_type/)
  }
})

test('customer and counter endpoints reject invalid type before touching the database', async () => {
  for (const [start, end] of [
    ["app.post('/api/v1/public/orders'", "app.get('/api/v1/public/orders'"],
    ["app.post('/api/v1/cashier/orders'", "app.patch('/api/v1/cashier/table-layout'"],
  ]) {
    let handler, touched = false, status
    const section = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
    assert.ok(section.length)
    runInNewContext(section, {
      app: { post(_path, ...list) { handler = list.at(-1) } }, requireCustomerSession() {}, requireAuthenticatedUser() {}, requireRole: () => {},
      pool: { connect() { touched = true; throw new Error('Should not connect') } }, uuid: /^[0-9a-f-]{36}$/i, validateOrderType,
      orderCartItems: (items) => items, PosValidationError, CounterOrderValidationError,
    })
    const response = { status(code) { status = code; return this }, json() {} }
    await handler({ get: () => id, body: { tableId: id, expectedTableSessionId: null, items: [{ menuItemId: id, quantity: 1 }], orderType: 'invalid' } }, response, (error) => { throw error })
    assert.equal(status, 400)
    assert.equal(touched, false)
  }
})

test('same idempotency key returns the saved original type, not a replacement order', async () => {
  let handler, insertCount = 0, body
  const section = source.slice(source.indexOf("app.post('/api/v1/public/orders'"), source.indexOf("app.get('/api/v1/public/orders'"))
  const client = { async query(sql) {
    if (sql.startsWith('SELECT id,')) return { rows: [{ id, orderType: 'take_away' }] }
    return { rows: [] }
  }, release() {} }
  runInNewContext(section, { app: { post(_path, ...list) { handler = list.at(-1) } }, requireCustomerSession() {}, uuid: /^[0-9a-f-]{36}$/i,
    validateOrderType, pickupFieldsSql, orderCartItems: (items) => items, pool: { connect: async () => client },
    insertPreparedOrder() { insertCount++; throw new Error('Must reuse saved order') }, PosValidationError, CounterOrderValidationError })
  const response = { status() { return this }, json(value) { body = value } }
  await handler({ get: () => id, customerSession: { id }, body: { items: [], orderType: 'dine_in' } }, response, (error) => { throw error })
  assert.equal(body.duplicate, true)
  assert.equal(body.order.orderType, 'take_away')
  assert.equal(insertCount, 0)
})

test('receipt preserves type per line and supports a mixed table bill without changing totals', () => {
  const orders = [{ orderType: 'take_away', subtotal: 5, items: [{ name: 'Tea', quantity: 1, price: 5 }] }, { subtotal: 10, items: [{ name: 'Rice', quantity: 1, price: 10 }] }]
  assert.equal(orderTypeLabel('take_away'), 'Take away')
  assert.equal(receiptOrderTypeLabel(orders), 'Dine in / Take away')
  const details = getReceiptDetails({ orders })
  assert.deepEqual(details.items.map((item) => item.orderType), ['take_away', 'dine_in'])
  assert.equal(details.subtotal, 15)
  assert.equal(orders[0].items[0].orderType, undefined)
})

test('staff take-away read route requires authentication and only admin/staff roles', async () => {
  let middleware, requestedRoles, handler, body
  const authenticated = () => {}
  const roleGuard = () => {}
  registerTakeAwayRoutes({ get(_path, ...list) { middleware = list.slice(0, -1); handler = list.at(-1) } }, {
    pool: { query: async () => ({ rows: [{ id, orderType: 'take_away' }] }) }, requireAuthenticatedUser: authenticated,
    requireRole: (...roles) => { requestedRoles = roles; return roleGuard },
  })
  assert.deepEqual(middleware, [authenticated, roleGuard])
  assert.deepEqual(requestedRoles, ['admin', 'staff'])
  await handler({}, { status() { return this }, json(value) { body = value } }, (error) => { throw error })
  assert.equal(body.orders[0].orderType, 'take_away')
})
