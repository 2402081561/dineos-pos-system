import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateKitchenName } from '../src/kitchenName.js'
import { readFile } from 'node:fs/promises'
import { validateOptionGroups } from '../src/posRules.js'

test('kitchen name accepts explicit Chinese and restaurant shorthand; absent legacy fields preserve aliases', () => {
  assert.equal(validateKitchenName(' cont kt '), 'cont kt')
  assert.equal(validateKitchenName('奶油鸡饭'), '奶油鸡饭')
  assert.equal(validateKitchenName(''), '')
  assert.equal(validateKitchenName(undefined), null)
  assert.equal(validateKitchenName(null), null)
})
test('kitchen name rejects hidden controls, multiline values, non-text and overlong aliases', () => {
  for (const value of [12, {}, 'a'.repeat(41), 'a\nb', '\u001b@', 'a\u202eb']) assert.throws(() => validateKitchenName(value))
})

const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
const menuInput = new Function('validateKitchenName', 'money', 'optionalImageUrl', 'textList', 'validateOptionGroups', `${source.slice(source.indexOf('function menuItemInput('), source.indexOf('function orderCartItems('))}; return menuItemInput`)(validateKitchenName, Number, (value) => value, (value) => value ?? [], validateOptionGroups)
function routes(query) {
  const handlers = new Map()
  const guards = []
  const app = Object.fromEntries(['get', 'post', 'patch'].map((method) => [method, (url, auth, role, handler) => {
    assert.equal(auth, 'auth'); assert.equal(role, 'admin'); handlers.set(`${method} ${url}`, handler)
  }]))
  new Function('app', 'pool', 'requireAuthenticatedUser', 'requireRole', 'menuItemInput', source.slice(source.indexOf("app.post('/api/v1/admin/menu-items',"), source.indexOf("app.patch('/api/v1/admin/menu-items/:itemId/availability'")))(app, { query }, 'auth', (...roles) => { guards.push(roles); return 'admin' }, menuInput)
  assert.deepEqual(guards, [['admin'], ['admin']])
  return handlers
}
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this } })
const item = { name: '广东粿条 Cantonese Kueh Teow', price: 9, imageUrl: 'https://example.com/food.jpg', optionGroups: [] }
test('real menu write handlers persist aliases with parameterized SQL and leave full names intact', async () => {
  const calls = []
  const handlers = routes(async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: 'dish', name: params[1], kitchenName: params.at(-1) }] } })
  const created = response()
  await handlers.get('post /api/v1/admin/menu-items')({ body: { ...item, kitchenName: 'cont kt' } }, created, (error) => { throw error })
  assert.equal(created.statusCode, 201)
  assert.equal(created.body.item.kitchenName, 'cont kt')
  assert.equal(calls[0].params[1], item.name)
  assert.match(calls[0].sql, /kitchen_name\) VALUES/)
  assert.match(calls[0].sql, /COALESCE\(\$11, ''\)/)
  const updated = response()
  await handlers.get('patch /api/v1/admin/menu-items/:itemId')({ params: { itemId: 'dish' }, body: item }, updated, (error) => { throw error })
  assert.equal(calls[1].params.at(-1), null)
  assert.match(calls[1].sql, /kitchen_name = COALESCE\(\$12, kitchen_name\)/)
  assert.equal(calls[1].params[9], 'dish')
  const invalid = response()
  await handlers.get('post /api/v1/admin/menu-items')({ body: { ...item, kitchenName: 'a\nb' } }, invalid, (error) => { throw error })
  assert.equal(invalid.statusCode, 400)
  assert.equal(calls.length, 2)
})
test('only internal kitchen/menu APIs select the alias; customer and receipt snapshots stay unchanged', () => {
  const kitchen = source.slice(source.indexOf("app.get('/api/v1/kitchen/orders',"), source.indexOf('const kitchenTransitions'))
  assert.match(kitchen, /'kitchenName', to_jsonb\(menu_items\)->>'kitchen_name'/)
  const publicOrders = source.slice(source.indexOf("app.get('/api/v1/public/orders"), source.indexOf("app.get('/api/v1/kitchen/orders',"))
  assert.doesNotMatch(publicOrders, /kitchenName|kitchen_name/)
})
