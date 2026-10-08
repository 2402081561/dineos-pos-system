import assert from 'node:assert/strict'
import test from 'node:test'
import { kitchenEstimates, registerKitchenEstimateRoutes } from '../src/kitchenEstimate.js'
import { validateStoreConfig } from '../src/posRules.js'

const ticket = (id, quantity, status = 'received', time = 0) => ({ id, quantity, status, createdAt: new Date(time).toISOString() })

test('idle kitchen is 3–4 minutes and processes three portions in parallel', () => {
  assert.equal(kitchenEstimates([]).preview.label, '3–4 mins')
  assert.equal(kitchenEstimates([], {}, 3).preview.label, '3–4 mins')
  assert.equal(kitchenEstimates([], {}, 4).preview.label, '6–8 mins')
})
test('other tables, counter orders and take-away all contribute workload', () => {
  const queue = [ticket('table1', 3), { ...ticket('counter', 3, 'received', 1), orderType: 'take_away' }, ticket('table2', 1, 'received', 2)]
  const result = kitchenEstimates(queue)
  assert.equal(result.byOrder.get('table1').label, '3–4 mins')
  assert.equal(result.byOrder.get('counter').label, '6–8 mins')
  assert.equal(result.byOrder.get('table2').label, '9–12 mins')
  assert.equal(result.preview.label, '9–12 mins')
})
test('later arrivals do not move earlier orders back; input order does not matter', () => {
  const earlier = ticket('earlier', 3), later = ticket('later', 30, 'received', 1)
  assert.deepEqual(kitchenEstimates([later, earlier]).byOrder.get('earlier'), kitchenEstimates([earlier]).byOrder.get('earlier'))
})
test('ready, served and cancelled release capacity, regardless of payment state', () => {
  const queue = ['ready', 'served', 'cancelled'].map((status) => ticket(status, 999, status))
  queue.push({ ...ticket('paid-but-not-ready', 3, 'preparing'), paymentStatus: 'paid' })
  assert.equal(kitchenEstimates(queue).preview.label, '6–8 mins')
  assert.equal(kitchenEstimates(queue).byOrder.size, 0)
  assert.equal(kitchenEstimates(queue.filter((order) => order.status !== 'preparing')).preview.label, '3–4 mins')
})
test('preparing has priority and remains workload until kitchen marks ready', () => {
  const result = kitchenEstimates([ticket('waiting', 1), ticket('preparing', 3, 'preparing', 1)])
  assert.equal(result.byOrder.get('waiting').label, '6–8 mins')
  assert.equal(result.byOrder.has('preparing'), false)
})
test('custom capacity and preparation times are validated and affect estimates', () => {
  const config = validateStoreConfig({ kitchenCapacity: '1', preparationMinMinutes: '2', preparationMaxMinutes: '5' })
  assert.equal(kitchenEstimates([ticket('ahead', 2)], config).preview.label, '6–15 mins')
  for (const invalid of [{ kitchenCapacity: 0 }, { kitchenCapacity: 21 }, { kitchenCapacity: 1.5 }, { preparationMinMinutes: 0 }, { preparationMinMinutes: 5, preparationMaxMinutes: 4 }, { preparationMaxMinutes: 121 }]) assert.throws(() => validateStoreConfig(invalid))
})
test('public estimate returns only the duration, no identities, tables or workload', async () => {
  let handler
  registerKitchenEstimateRoutes({ get(_path, next) { handler = next } }, { pool: { query: async () => ({ rows: [{ config: {}, queue: [ticket('secret-other-table-order', 6)] }] }) } })
  const headers = {}, response = { set(key, value) { headers[key] = value; return this }, json(data) { this.data = data; return this }, status(value) { this.code = value; return this } }
  await handler({ query: { quantity: '2' } }, response, (error) => { throw error })
  assert.deepEqual(response.data, { estimate: { minimum: 9, maximum: 12, label: '9–12 mins' } })
  assert.equal(headers['Cache-Control'], 'no-store')
  assert.equal(JSON.stringify(response.data).includes('secret'), false)
  for (const quantity of ['0', '51', '1.5', 'abc', ['1', '2']]) {
    await handler({ query: { quantity } }, response, (error) => { throw error })
    assert.equal(response.code, 400)
  }
})
