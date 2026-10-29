import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { hookRuntime, bundleHarness, findElement, flush } from './helpers/hookHarness.mjs'

test('real OTP service normalizes email and sends/verifies only through dedicated Supabase Auth', async () => {
  const h = await bundleHarness(`export {createEmailOtpService,normalizeMemberEmail} from './src/services/memberOtpService.js'`, hookRuntime())
  const calls = []
  const service = h.createEmailOtpService({ isEnabled: async()=>true, client: { auth: {
    async signInWithOtp(body) { calls.push(body); return { error: null } },
    async verifyOtp(body) { calls.push(body); return { data: { user: { email: 'test@example.com' }, session: { access_token: 'test-only-token' } } } },
  } } })
  assert.equal(await service.sendCode(' Test@Example.com ', 'register'), 'test@example.com')
  assert.equal(await service.sendCode('test@example.com', 'login'), 'test@example.com')
  assert.deepEqual(calls[0], { email: 'test@example.com', options: { shouldCreateUser: true } })
  assert.deepEqual(calls[1], { email: 'test@example.com', options: { shouldCreateUser: false } })
  assert.equal(await service.verifyCode('test@example.com', '123456'), 'test-only-token')
  assert.deepEqual(calls[2], { email: 'test@example.com', token: '123456', type: 'email' })
  await assert.rejects(service.verifyCode('test@example.com', '12345'), /6-digit/)
  await assert.rejects(service.sendCode('not-email'), /valid email/)
  const source = await readFile(new URL('../src/services/memberOtpService.js', import.meta.url), 'utf8')
  assert.match(source, /persistSession: false/); assert.match(source, /autoRefreshToken: false/)
  assert.match(source, /detectSessionInUrl: false/); assert.match(source, /storageKey: 'dineos-member-email-otp'/)
  assert.doesNotMatch(source, /supabaseAuthService|signOut|localStorage|sessionStorage/)
})

test('OTP provider rejects expired/mismatched identities, unconfigured delivery and rate limits', async () => {
  const h = await bundleHarness(`export {createEmailOtpService} from './src/services/memberOtpService.js'`, hookRuntime())
  await assert.rejects(h.createEmailOtpService({ isEnabled: async()=>true, client: null }).sendCode('test@example.com'), /not configured/)
  for (const [error, message] of [[{ status: 429 }, /Too many/], [{ code: 'email_address_not_authorized' }, /delivery is not configured/], [{ code: 'smtp_failed' }, /Could not send/]]) {
    const service = h.createEmailOtpService({ isEnabled: async()=>true, client: { auth: { signInWithOtp: async () => ({ error }) } } })
    await assert.rejects(service.sendCode('test@example.com'), message)
  }
  for (const result of [{ error: { code: 'otp_expired' } }, { data: { user: { email: 'other@example.com' }, session: { access_token: 'test-only' } } }, { data: {} }]) {
    await assert.rejects(h.createEmailOtpService({ isEnabled: async()=>true, client: { auth: { verifyOtp: async () => result } } }).verifyCode('test@example.com', '123456'), /incorrect or expired/)
  }
})

test('paused membership sends no email and performs no OTP verification, even when called directly', async () => {
  const h = await bundleHarness(`export {createEmailOtpService} from './src/services/memberOtpService.js'`, hookRuntime())
  let calls = 0
  const service = h.createEmailOtpService({ isEnabled: async () => false, client: { auth: { signInWithOtp() { calls++ }, verifyOtp() { calls++ } } } })
  await assert.rejects(service.sendCode('test@example.com'), /not available yet/)
  await assert.rejects(service.verifyCode('test@example.com', '123456'), /not available yet/)
  assert.equal(calls, 0)
})

async function uiHarness() {
  const runtime = hookRuntime()
  const module = await bundleHarness(`
    import MemberEmailAuth from './src/components/member/MemberEmailAuth.jsx';import JoinSession from './src/pages/customer/JoinSession.jsx';import {fixture} from 'member-fixture';export {MemberEmailAuth,JoinSession,fixture}
  `, runtime, {
    'member-fixture': `export const fixture={memberEnabled:true,sends:[],verifies:0,requests:[],failedCode:false,failedApi:false,joins:0,result:{member:{id:'member-1',memberId:'MEM-00001',email:'test@example.com',pointsBalance:29},session:{sessionId:'test-visit',tableNumber:'1'}}}`,
    useMemberEmailAvailability: `import {fixture} from 'member-fixture';export default ()=>({isLoading:false,enabled:fixture.memberEnabled,testMode:fixture.testMode===true})`,
    useCustomerLanguage: 'export default ()=>({t:(text,options={})=>text.replace(/{{(\\w+)}}/g,(match,key)=>options[key]??match)})',
    useShopSettings: 'export default ()=>({name:"Test restaurant"})',
    useCustomerSession: 'export default ()=>({session:null,sessionError:"",clearSession:async()=>{},startSession(){}})',
    memberOtpService: `import {fixture} from 'member-fixture';export const normalizeMemberEmail=(value)=>String(value).trim().toLowerCase();export async function sendMemberEmailCode(...args){fixture.sends.push(args)}export async function verifyMemberEmailCode(){fixture.verifies++;if(fixture.failedCode)throw new Error('The code is incorrect or expired. Please try again or request a new code.');return 'test-only-token'}`,
    customerApi: `import {fixture} from 'member-fixture';export async function getCustomerSession(){return fixture.result.session}export async function createCustomerMember(...args){fixture.requests.push(args);if(fixture.failedApi)throw new Error('Test-only lost response');return fixture.result}export async function loginCustomerMember(...args){fixture.requests.push(args);if(fixture.failedApi)throw new Error('Test-only lost response');return fixture.result}`,
    tableSessionService: `import {fixture} from 'member-fixture';export async function joinTableSession(){fixture.joins++;return fixture.result.session}`,
    'react-router-dom': 'export const useSearchParams=()=>[new URLSearchParams("table=1")];export const useNavigate=()=>()=>{}',
  })
  return { ...module, runtime }
}
const submit = (h, props) => findElement(h.runtime.render(h.MemberEmailAuth, props), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
const input = (h, props, id, value) => findElement(h.runtime.render(h.MemberEmailAuth, props), (node) => node.props?.id === id).props.onChange({ target: { value } })

test('member email UI sends no table/API request until OTP verified; invalid codes keep guest flow intact', async () => {
  const h = await uiHarness(), success = []
  const props = { purpose: 'login', getTableSession: async () => { h.fixture.joins++; return h.fixture.result.session }, onSuccess: (value) => success.push(value), onBack() {} }
  try {
    h.runtime.render(h.MemberEmailAuth, props); h.runtime.effects()
    input(h, props, 'member-email', ' Test@Example.com ')
    await submit(h, props); h.runtime.effects()
    assert.deepEqual(h.fixture.sends, [['test@example.com', 'login']])
    assert.equal(h.fixture.joins, 0); assert.equal(h.fixture.requests.length, 0)
    const resend = findElement(h.runtime.render(h.MemberEmailAuth, props), (node) => node.props?.children === 'Resend code in 60s')
    assert.equal(resend.props.disabled, true)
    resend.props.onClick(); await flush(); assert.equal(h.fixture.sends.length, 1)
    input(h, props, 'member-otp', '12ab3456'); h.fixture.failedCode = true
    await submit(h, props)
    assert.equal(h.fixture.joins, 0); assert.equal(success.length, 0)
    assert.ok(findElement(h.runtime.render(h.MemberEmailAuth, props), (node) => node.props?.role === 'alert'))
    h.fixture.failedCode = false; await submit(h, props)
    assert.equal(success[0].member.pointsBalance, 29)
    assert.deepEqual(h.fixture.requests[0], ['test-visit', 'test-only-token'])
  } finally { h.runtime.cleanup() }
})

test('registration API retries reuse verified token after consumed OTP, preserving identity and points', async () => {
  const h = await uiHarness(), success = []
  const props = { purpose: 'register', getTableSession: async () => h.fixture.result.session, onSuccess: (value) => success.push(value), onBack() {} }
  try {
    h.runtime.render(h.MemberEmailAuth, props); h.runtime.effects()
    input(h, props, 'member-name', 'Test name'); input(h, props, 'member-phone', '0123456789'); input(h, props, 'member-email', 'test@example.com')
    await submit(h, props); h.runtime.effects(); input(h, props, 'member-otp', '123456')
    h.fixture.failedApi = true; await submit(h, props)
    assert.equal(h.fixture.verifies, 1); assert.equal(success.length, 0)
    h.fixture.failedApi = false; await submit(h, props)
    assert.equal(h.fixture.verifies, 1); assert.equal(success.length, 1)
    assert.equal(h.fixture.requests[0][2], 'test-only-token'); assert.deepEqual(h.fixture.requests[0], h.fixture.requests[1])
    assert.equal(h.fixture.requests[0][1].emailNotificationsEnabled, false)
  } finally { h.runtime.cleanup() }
})

test('changing email clears the previous proof; leaving the panel suppresses late verification/session activation', async () => {
  const h = await uiHarness(), success = []
  const props = { purpose: 'login', getTableSession: async () => h.fixture.result.session, onSuccess: (value) => success.push(value), onBack() {} }
  try {
    h.runtime.render(h.MemberEmailAuth, props); h.runtime.effects(); input(h, props, 'member-email', 'test@example.com'); await submit(h, props); h.runtime.effects()
    const change = findElement(h.runtime.render(h.MemberEmailAuth, props), (node) => node.props?.children === 'Change email or details')
    change.props.onClick()
    assert.ok(findElement(h.runtime.render(h.MemberEmailAuth, props), (node) => node.props?.id === 'member-email'))
    await submit(h, props); input(h, props, 'member-otp', '123456')
    const request = submit(h, props); h.runtime.cleanup(); await request
    assert.equal(success.length, 0); assert.equal(h.fixture.requests.length, 0)
  } finally { h.runtime.cleanup() }
})

test('join screen retains guest entry and removes legacy ID/phone login form', async () => {
  const h = await uiHarness()
  try {
    const welcome = h.runtime.render(h.JoinSession)
    assert.ok(findElement(welcome, (node) => node.props?.children === 'Continue as Guest'))
    findElement(welcome, (node) => node.props?.children === 'Member Login').props.onClick()
    const panel = findElement(h.runtime.render(h.JoinSession), (node) => node.type === h.MemberEmailAuth)
    assert.equal(panel.props.purpose, 'login')
    assert.equal(findElement(h.runtime.render(h.JoinSession), (node) => node.props?.id === 'member-id'), null)
  } finally { h.runtime.cleanup() }
})

test('paused membership disables login and registration while Guest entry still works', async () => {
  const h = await uiHarness()
  try {
    h.fixture.memberEnabled = false
    let page = h.runtime.render(h.JoinSession)
    for (const label of ['Member Login', 'Create Membership']) assert.equal(findElement(page, (node) => node.props?.children === label).props.disabled, true)
    findElement(page, (node) => node.props?.children === 'Member Login').props.onClick()
    page = h.runtime.render(h.JoinSession)
    assert.equal(findElement(page, (node) => node.type === h.MemberEmailAuth), null)
    const guest = findElement(page, (node) => node.props?.children === 'Continue as Guest')
    assert.equal(guest.props.disabled, false)
    await guest.props.onClick()
    assert.equal(h.fixture.joins, 1); assert.equal(h.fixture.sends.length, 0)
  } finally { h.runtime.cleanup() }
})

test('test registration is clearly labelled and welcome delivery never blocks ordering after membership success', async () => {
  const h = await uiHarness()
  try {
    h.fixture.testMode = true
    findElement(h.runtime.render(h.JoinSession), node => node.props?.children === 'Create Membership').props.onClick()
    const panel = findElement(h.runtime.render(h.JoinSession), node => node.type === h.MemberEmailAuth)
    assert.equal(panel.props.testMode, true)
    panel.props.onSuccess({ ...h.fixture.result, welcomeEmail: { status: 'queued' } })
    let success = h.runtime.render(h.JoinSession)
    assert.ok(findElement(success, node => node.props?.children === 'Your welcome email is being processed. You can start ordering now.'))
    assert.ok(findElement(success, node => node.props?.children === 'Start Ordering'))
    panel.props.onSuccess({ ...h.fixture.result, welcomeEmail: { status: 'unavailable' } })
    success = h.runtime.render(h.JoinSession)
    assert.ok(findElement(success, node => node.props?.children === 'Your membership is active. The welcome email is temporarily unavailable.'))
    assert.ok(findElement(success, node => node.props?.children === 'Start Ordering'))
  } finally { h.runtime.cleanup() }
  const second = await uiHarness()
  try {
    const tree = second.runtime.render(second.MemberEmailAuth, { purpose: 'register', testMode: true })
    assert.ok(findElement(tree, node => node.props?.children === 'Email testing only. Use the test inbox configured by the restaurant; customer registration is not open yet.'))
  } finally { second.runtime.cleanup() }
})

test('membership availability fails closed on network errors, recovers, and only accepts a boolean flag', async () => {
  const runtime = hookRuntime(), timers = new Map()
  const previousSet = globalThis.setTimeout, previousClear = globalThis.clearTimeout
  let id = 0
  globalThis.setTimeout = (callback) => { timers.set(++id, callback); return id }
  globalThis.clearTimeout = (key) => timers.delete(key)
  try {
    const h = await bundleHarness(`import useMemberEmailAvailability from './src/hooks/useMemberEmailAvailability.js';import {fixture} from 'gate-fixture';export {useMemberEmailAvailability,fixture}`, runtime, {
      'gate-fixture': 'export const fixture={fail:true,enabled:true}',
      customerApi: `import {fixture} from 'gate-fixture';export async function getMemberEmailAuthConfig(){if(fixture.fail)throw new Error('Test-only offline');return {emailOtpEnabled:fixture.enabled}}`,
    })
    runtime.render(h.useMemberEmailAvailability); runtime.effects(); await flush()
    assert.equal(runtime.render(h.useMemberEmailAvailability).enabled, false)
    async function tick() { const [key, callback] = timers.entries().next().value; timers.delete(key); await callback() }
    h.fixture.fail = false; await tick()
    assert.equal(runtime.render(h.useMemberEmailAvailability).enabled, true)
    h.fixture.enabled = 'true'; await tick()
    assert.equal(runtime.render(h.useMemberEmailAvailability).enabled, false)
  } finally { runtime.cleanup(); globalThis.setTimeout = previousSet; globalThis.clearTimeout = previousClear }
})
