import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { cashTenderInCents } from '../src/cashTender.js'
import { cashierBillTotal, getCashPayment, moneyToCents } from '../../src/utils/cashPayment.js'
import { getReceiptDetails } from '../../src/utils/receipt.js'

test('cash amount validation agrees between frontend and backend', () => {
  for (const value of ['', ' ', null, undefined, false, {}, [], '-1', 'NaN', NaN, Infinity, 'Infinity', '1e3', '0x10', '1.001', '5.', '.5', '10,00', '10000000000', '999999999999999999999']) {
    assert.equal(moneyToCents(value), null, String(value))
    assert.equal(cashTenderInCents(value), null, String(value))
  }
  for (const [value, cents] of [['0', 0], [0, 0], ['10', 1000], ['10.0', 1000], ['10.00', 1000], [' 10.50 ', 1050], [5.9, 590], ['9999999999.99', 999999999999]]) {
    assert.equal(moneyToCents(value), cents)
    assert.equal(cashTenderInCents(value), cents)
  }
})

test('change, shortage, exact and zero payments use integer cents', () => {
  assert.deepEqual(getCashPayment(5.9, '10'), { error: '', cashReceived: 10, change: 4.1 })
  assert.deepEqual(getCashPayment('56.72', '100'), { error: '', cashReceived: 100, change: 43.28 })
  assert.equal(getCashPayment(5.9, '5.90').change, 0)
  assert.equal(getCashPayment(0, '0').change, 0)
  assert.equal(getCashPayment(5.9, '5').error, 'Cash is short by RM 0.90.')
  assert.equal(getCashPayment(5.9, '5').change, null)
  assert.ok(getCashPayment(null, '10').error)
  assert.ok(getCashPayment(5.9, '').error)
})

test('receipt tender survives numeric strings and does not invent old/non-cash data', () => {
  assert.deepEqual(getReceiptDetails({ paymentMethod: 'Cash', grandTotal: '5.90', cashReceived: '10.00', changeAmount: '4.10' }).cashTender, { received: 10, change: 4.1 })
  assert.deepEqual(getReceiptDetails({ paymentMethod: 'Cash', grandTotal: 0, cashReceived: 0, changeAmount: 0 }).cashTender, { received: 0, change: 0 })
  for (const receipt of [
    { paymentMethod: 'Cash', grandTotal: '5.90' },
    { paymentMethod: 'Cash', grandTotal: '5.90', cashReceived: null, changeAmount: null },
    { paymentMethod: 'Cash', grandTotal: '5.90', cashReceived: '10.00', changeAmount: '999' },
    { paymentMethod: 'FPX', grandTotal: '5.90', cashReceived: '10.00', changeAmount: '4.10' },
  ]) assert.equal(getReceiptDetails(receipt).cashTender, null)
})

test('discount preview matches backend separately rounded charges', () => {
  const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100
  for (let cents = 0; cents <= 10000; cents++) {
    const subtotal = cents / 100
    for (const discount of [0, round(subtotal * 0.15), subtotal]) {
      const netCents = Math.round(round(subtotal - discount) * 100)
      const total = (netCents + Math.round(netCents * 10 / 100) + Math.round(netCents * 6 / 100)) / 100
      assert.equal(cashierBillTotal(subtotal, discount), total, `${subtotal} - ${discount}`)
    }
  }
  assert.equal(cashierBillTotal(0.04, 0), 0.04)
  assert.equal(cashierBillTotal(34.25, 0), 39.74)
  assert.equal(cashierBillTotal(5, 5), 0)
  assert.equal(cashierBillTotal(1, 2), null)
  assert.equal(cashierBillTotal(Infinity, 0), null)
})

// Execute the real payment handler with an isolated database double. No Supabase
// account, real orders, receipts, loyalty balances or payment records are changed.
const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
const handlerSource = source.slice(source.indexOf("app.post('/api/v1/cashier/payments'"), source.indexOf("app.get('/api/v1/cashier/receipts/:receiptNumber'"))
const orderId = '11111111-1111-4111-8111-111111111111'

async function paymentRequest(body, { status = 'served', paymentStatus = 'pending' } = {}) {
  let handler
  const queries = []
  const client = {
    async query(sql, values) {
      queries.push({ sql, values })
      if (sql.includes('FOR UPDATE OF orders')) return { rows: [{ id: orderId, tableSessionId: 'session', tableId: 'table', tableNumber: 1, status, paymentStatus, subtotal: '5.00', memberId: null }] }
      if (sql.includes('INSERT INTO receipt_sequences')) return { rows: [{ last_number: 1 }] }
      if (sql.includes('INSERT INTO payments')) return { rows: [{ id: 'payment', receiptNumber: values[0], amount: String(values[4]), cashReceived: values[5], changeAmount: values[6], paidAt: new Date() }] }
      return { rows: [] }
    },
    release() { queries.push({ sql: 'RELEASE' }) },
  }
  runInNewContext(handlerSource, {
    app: { post(_route, _auth, _role, callback) { handler = callback } },
    requireAuthenticatedUser() {}, requireRole() {},
    uuid: /^[0-9a-f-]{36}$/i,
    paymentMethods: new Set(['Cash', 'Credit/Debit Card', "Touch 'n Go", 'GrabPay', 'FPX', 'Other']),
    cashTenderInCents,
    pool: { connect: async () => client },
    money: Number,
    roundMoney: (value) => Math.round((value + Number.EPSILON) * 100) / 100,
    discountInput: () => ({ amount: 0 }), businessDate: () => '2026-09-29',
    logAuditEvent: async () => {},
  })
  let code, result
  const response = { status(value) { code = value; return this }, json(value) { result = value; return this } }
  await handler({ body: { orderIds: [orderId], paymentMethod: 'Cash', ...body }, user: { id: 'cashier' } }, response, (error) => { throw error })
  return { code, result, queries }
}

test('server rejects missing/invalid tender before connecting to database', async () => {
  for (const cashReceived of [undefined, null, '', -10, '5.001', Infinity]) {
    const result = await paymentRequest({ cashReceived })
    assert.equal(result.code, 400)
    assert.equal(result.queries.length, 0)
  }
})

test('server rolls back insufficient cash and changed confirmed total', async () => {
  for (const [body, code] of [[{ cashReceived: '5' }, 400], [{ cashReceived: '10', expectedAmount: 5.79 }, 409]]) {
    const result = await paymentRequest(body)
    assert.equal(result.code, code)
    assert.ok(result.queries.some(({ sql }) => sql === 'ROLLBACK'))
    assert.ok(!result.queries.some(({ sql }) => sql.includes('INSERT INTO payments') || sql.includes('UPDATE orders') || sql === 'COMMIT'))
  }
})

test('server calculates change itself, persists tender, and keeps revenue at bill amount', async () => {
  const result = await paymentRequest({ cashReceived: '10', expectedAmount: 5.8, changeAmount: 999, amount: 0 })
  assert.equal(result.code, 201)
  assert.equal(Number(result.result.payment.amount), 5.8)
  assert.equal(result.result.payment.cashReceived, 10)
  assert.equal(result.result.payment.changeAmount, 4.2)
  const payment = result.queries.find(({ sql }) => sql.includes('INSERT INTO payments'))
  assert.equal(payment.values[4], 5.8)
  assert.equal(payment.values[5], 10)
  assert.equal(payment.values[6], 4.2)
  assert.equal(result.queries.filter(({ sql }) => sql === 'COMMIT').length, 1)
})

test('non-cash methods do not require or save cash tender', async () => {
  for (const paymentMethod of ['Credit/Debit Card', "Touch 'n Go", 'GrabPay', 'FPX', 'Other']) {
    const result = await paymentRequest({ paymentMethod, cashReceived: 'bad', expectedAmount: 5.8 })
    assert.equal(result.code, 201)
    assert.equal(result.result.payment.cashReceived, null)
    assert.equal(result.result.payment.changeAmount, null)
  }
})

test('already paid or non-served orders cannot create a payment', async () => {
  for (const state of [{ paymentStatus: 'paid' }, { status: 'ready' }]) {
    const result = await paymentRequest({ cashReceived: '10' }, state)
    assert.equal(result.code, 409)
    assert.ok(!result.queries.some(({ sql }) => sql.includes('INSERT INTO payments')))
  }
})
