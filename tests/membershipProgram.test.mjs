import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { defaultConfig, validateStoreConfig } from '../server/src/posRules.js'
import { membershipProgramGuard, requireMembershipProgram } from '../server/src/membershipProgram.js'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

test('membership defaults off, persists explicit booleans and rejects ambiguous settings', () => {
  assert.equal(defaultConfig.membershipEnabled, false)
  assert.equal(validateStoreConfig({}).membershipEnabled, false)
  assert.equal(validateStoreConfig({ membershipEnabled: true }).membershipEnabled, true)
  for (const value of ['true', 'false', 1, null]) assert.throws(() => validateStoreConfig({ membershipEnabled: value }))
})

test('backend membership guard fails closed and only reads settings', async () => {
  for (const membershipEnabled of [undefined, false, 'true', true]) {
    const queries = [], pool = { async query(sql) {
      queries.push(sql)
      return { rows: [{ name: 'Test', config: { membershipEnabled } }] }
    } }
    let status, body, next = false
    const response = { status(code) { status = code; return this }, json(value) { body = value; return this } }
    await membershipProgramGuard(pool)({}, response, () => { next = true })
    assert.equal(next, membershipEnabled === true)
    if (!next) { assert.equal(status, 503); assert.match(body.error, /currently paused/) }
    assert.equal(queries.length, 1); assert.match(queries[0], /FOR SHARE/)
    assert.doesNotMatch(queries[0], /UPDATE|INSERT|DELETE/)
  }
  await assert.rejects(requireMembershipProgram({ query: async () => ({ rows: [] }) }), /unavailable/)
})

test('disabled member routes never mount profile/rewards; admin checkbox is editable with normal settings save', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as Gate} from './src/components/member/MembershipFeatureGate.jsx';export {default as Settings} from './src/pages/admin/ShopSettings.jsx';export {fixture} from 'program-fixture'`, runtime, {
    'program-fixture': `export const fixture={config:{membershipEnabled:false},settings:{name:'Test',revision:2,config:{membershipEnabled:false}},saved:[]}`,
    useShopSettings: `import {fixture} from 'program-fixture';export default ()=>({...fixture,isLoading:false,error:'',saveSettings:async(...args)=>fixture.saved.push(args)})`,
    useCustomerLanguage: 'export default ()=>({t:text=>text})',
  })
  try {
    assert.notEqual(runtime.render(h.Gate, { children: 'mounted-member-page' }), 'mounted-member-page')
    h.fixture.config.membershipEnabled = true
    assert.equal(runtime.render(h.Gate, { children: 'mounted-member-page' }), 'mounted-member-page')
    const checkbox = findElement(runtime.render(h.Settings), node => node.type === 'input' && node.props?.checked === false && node.props?.className?.includes('accent-orange'))
    assert.equal(checkbox.props.type, 'checkbox')
    checkbox.props.onChange({ target: { checked: true } })
    await findElement(runtime.render(h.Settings), node => node.type === 'form').props.onSubmit({ preventDefault() {} })
    assert.equal(h.fixture.saved[0][0].config.membershipEnabled, true)
    assert.equal(h.fixture.saved[0][1], 2)
  } finally { runtime.cleanup() }
})

test('registration and both redemption paths recheck membership inside their write transaction', async () => {
  const index = await readFile(new URL('../server/src/index.js', import.meta.url), 'utf8')
  for (const route of ["app.post('/api/v1/public/rewards/:rewardId/redeem'", "app.post('/api/v1/cashier/rewards/:rewardId/redeem'"]) {
    const section = index.slice(index.indexOf(route), index.indexOf(route) + 1100)
    assert.match(section, /await client.query\('BEGIN'\)\s+await requireMembershipProgram\(client\)/)
  }
  const auth = await readFile(new URL('../server/src/memberEmailAuth.js', import.meta.url), 'utf8')
  assert.equal((auth.match(/await requireMembershipProgram\(client\)/g) ?? []).length, 2)
})
