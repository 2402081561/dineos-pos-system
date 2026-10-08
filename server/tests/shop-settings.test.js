import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { registerShopSettingsRoutes, ShopSettingsValidationError, validateShopSettings } from '../src/shopSettings.js'

test('shop names accept trimmed English, Chinese and literal punctuation', () => {
  for (const input of ['  Sin Ma Stir Fried  ', '新马小炒', 'JJ & Family', '<script>alert(1)</script>', '🍜'.repeat(80)]) {
    assert.deepEqual(validateShopSettings({ name: input, expectedName: 'DineOS' }), { name: input.trim(), expectedName: 'DineOS' })
  }
})

test('empty, long, non-string, control-character and unrelated settings are rejected', () => {
  for (const name of ['', '   ', 'a'.repeat(81), '🍜'.repeat(81), 123, null, 'Cafe\nName', 'Cafe\u0000Name', 'Cafe\u0085Name']) {
    assert.throws(() => validateShopSettings({ name, expectedName: 'DineOS' }), ShopSettingsValidationError)
  }
  for (const input of [null, [], { name: 'Cafe' }, { name: 'Cafe', expectedName: 'DineOS', role: 'admin' }, { name: 'Cafe', expectedName: 'DineOS', tax: 0 }]) {
    assert.throws(() => validateShopSettings(input), ShopSettingsValidationError)
  }
})

const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
// Exercise the actual production role middleware, without credentials or a DB.
const requireRole = runInNewContext(`(${source.slice(source.indexOf('function requireRole('), source.indexOf('function tableInput(')).trim()})`)

function fixture({ name = 'DineOS', failDatabase = false, failAudit = false } = {}) {
  const routes = new Map()
  const audits = []
  const queries = []
  let storedName = name
  registerShopSettingsRoutes({
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers) },
    patch(path, ...handlers) { routes.set(`PATCH ${path}`, handlers) },
  }, {
    pool: { async query(sql, values) {
      queries.push({ sql, values })
      if (failDatabase) throw new Error('Database offline')
      if (sql.startsWith('UPDATE')) {
        if (storedName !== values[1]) return { rows: [] }
        storedName = values[0]
      }
      return { rows: storedName === null ? [] : [{ name: storedName }] }
    } },
    requireAuthenticatedUser(request, response, next) { return request.user ? next() : response.status(401).json({ error: 'Authentication is required.' }) },
    requireRole,
    async logAuditEvent(event) { audits.push(event); if (failAudit) throw new Error('Audit offline') },
  })
  return {
    audits, queries, get name() { return storedName },
    async request(method, path, { role, body } = {}) {
      let code = 200, data, forwardedError, completed = false
      const headers = {}
      const response = { status(value) { code = value; return this }, set(key, value) { headers[key] = value; return this }, json(value) { data = value; completed = true; return this } }
      for (const handler of routes.get(`${method} ${path}`)) {
        if (completed) break
        await handler({ body, ...(role ? { user: { id: 'actor-1', role } } : {}) }, response, (error) => { if (error) { forwardedError = error; completed = true } })
      }
      return { code, data, headers, forwardedError }
    },
  }
}

test('public reads expose shop display/configuration fields and disable caching', async () => {
  const result = await fixture().request('GET', '/api/v1/public/shop-settings')
  assert.equal(result.data.settings.name, 'DineOS')
  assert.equal(result.data.settings.config.serviceChargeRate, 10)
  assert.equal(result.data.settings.isAcceptingOrders, true)
  assert.deepEqual(Object.keys(result.data.settings).sort(), ['config', 'isAcceptingOrders', 'name', 'orderingMessage', 'revision'].sort())
  assert.equal(result.headers['Cache-Control'], 'no-store')
})

test('only admin can save; unauthenticated, cashier, kitchen and staff never write', async () => {
  for (const role of [undefined, 'cashier', 'kitchen', 'staff']) {
    const app = fixture()
    const result = await app.request('PATCH', '/api/v1/admin/shop-settings', { role, body: { name: 'New', expectedName: 'DineOS' } })
    assert.equal(result.code, role ? 403 : 401)
    assert.equal(app.queries.length, 0)
    assert.equal(app.name, 'DineOS')
  }
})

test('admin name update is parameterized and audited once after success', async () => {
  const app = fixture()
  const result = await app.request('PATCH', '/api/v1/admin/shop-settings', { role: 'admin', body: { name: ' 新马小炒 ', expectedName: 'DineOS' } })
  assert.equal(result.code, 200)
  assert.equal(app.name, '新马小炒')
  assert.deepEqual(app.queries[0].values, ['新马小炒', 'DineOS'])
  assert.equal(app.audits.length, 1)
  assert.equal(app.audits[0].action, 'UPDATE_SHOP_SETTINGS')
  assert.equal(app.audits[0].actorId, 'actor-1')
})

test('stale saves and invalid names cannot overwrite settings or create audits', async () => {
  const app = fixture({ name: 'Other window' })
  const result = await app.request('PATCH', '/api/v1/admin/shop-settings', { role: 'admin', body: { name: 'Cafe', expectedName: 'DineOS' } })
  assert.equal(result.code, 409)
  assert.equal(app.name, 'Other window')
  assert.equal(app.audits.length, 0)
  const invalid = await app.request('PATCH', '/api/v1/admin/shop-settings', { role: 'admin', body: { name: ' ', expectedName: 'Other window' } })
  assert.equal(invalid.code, 400)
  assert.equal(app.queries.length, 1)
})

test('database failures remain errors; audit failures do not undo a saved name', async () => {
  const failed = fixture({ failDatabase: true })
  const result = await failed.request('PATCH', '/api/v1/admin/shop-settings', { role: 'admin', body: { name: 'Cafe', expectedName: 'DineOS' } })
  assert.equal(result.forwardedError.message, 'Database offline')
  assert.equal(failed.name, 'DineOS')
  assert.equal(failed.audits.length, 0)
  const audited = fixture({ failAudit: true })
  assert.equal((await audited.request('PATCH', '/api/v1/admin/shop-settings', { role: 'admin', body: { name: 'Cafe', expectedName: 'DineOS' } })).code, 200)
  assert.equal(audited.name, 'Cafe')
  await new Promise((resolve) => setImmediate(resolve))
})

test('missing singleton reports unavailable; migration locks down browser access', async () => {
  assert.equal((await fixture({ name: null }).request('GET', '/api/v1/public/shop-settings')).code, 503)
  const migration = await readFile(new URL('../db/021_shop_settings.sql', import.meta.url), 'utf8')
  assert.match(migration, /CHECK \(id = 1\)/)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON shop_settings FROM anon, authenticated/)
  assert.ok(!migration.includes('UPDATE payments'))
})

test('payments snapshot the DB name; receipt read retains snapshot and receipt identity', () => {
  const payment = source.slice(source.indexOf("app.post('/api/v1/cashier/payments'"), source.indexOf("app.get('/api/v1/cashier/receipts/:receiptNumber'"))
  assert.match(payment, /restaurant_name, shop_snapshot/)
  assert.match(payment, /SELECT name FROM shop_settings WHERE id = 1/)
  assert.match(payment, /jsonb_build_object/)
  assert.match(payment, /config FROM shop_settings WHERE id = 1/)
  const receipt = source.slice(source.indexOf("app.get('/api/v1/cashier/receipts/:receiptNumber'"), source.indexOf("app.post('/api/v1/cashier/receipts/:receiptNumber/reprint'"))
  assert.match(receipt, /payments.restaurant_name AS "restaurantName"/)
  assert.match(receipt, /payments.receipt_number = \$1/)
  assert.ok(!receipt.includes('UPDATE payments'))
})
