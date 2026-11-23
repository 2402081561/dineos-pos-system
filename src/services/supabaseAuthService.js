import { createClient } from '@supabase/supabase-js'
import { createRememberedStaffStorage, watchStaffActivity } from '../utils/rememberedStaffSession'
import { readStaffIdentity } from '../utils/staffIdentityRead'

const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
const apiUrl = String(import.meta.env.VITE_API_URL ?? 'http://localhost:4000').trim().replace(/\/$/, '')
let remembered = createRememberedStaffStorage()
const observers = new Map()

function makeClient(saved) { return url && publishableKey ? createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: saved.storage,
    storageKey: `dineos-staff-session-${saved.tabId}`,
  },
}) : null }
let supabase = makeClient(remembered)

function observe(onChange) {
  const saved = remembered
  return supabase.auth.onAuthStateChange((event, session) => {
    if (saved === remembered) onChange(saved.expired() ? null : session, event)
  }).data.subscription
}

function beginIndependentLogin() {
  // A deliberate new login gets a fresh key, so another restored tab/account
  // cannot be overwritten. Rebinding subscriptions does not resend credentials.
  for (const subscription of observers.values()) subscription.unsubscribe()
  void supabase?.auth.dispose?.().catch(() => {})
  remembered = createRememberedStaffStorage({ forceNew: true })
  supabase = makeClient(remembered)
  for (const onChange of observers.keys()) { onChange(null); observers.set(onChange, observe(onChange)) }
}

function assertNotIdleExpired() {
  if (!remembered.expired()) return
  throw Object.assign(new Error('Your saved login expired after 7 days without use. Please sign in again.'), { status: 401 })
}

export function watchStaffLoginActivity() {
  let notified
  return watchStaffActivity(() => remembered, () => {
    if (notified === remembered) return
    notified = remembered
    for (const onChange of observers.keys()) onChange(null)
  })
}

function client() {
  if (!supabase) throw new Error('Supabase login is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  return supabase
}

async function apiUser(accessToken, options) {
  const owner = remembered, auth = supabase
  assertNotIdleExpired()
  try {
    const user = await readStaffIdentity(apiUrl, accessToken, options)
    if (owner !== remembered) throw new Error('The active login changed. Please try again.')
    if (owner.expired()) throw Object.assign(new Error('Please sign in to continue.'), { status: 401 })
    owner.saveProfile(user)
    return user
  }
  catch (error) {
    if (error.status === 403 && auth) await auth.auth.signOut({ scope: 'local' })
    throw error
  }
}

export async function getSupabaseAccessToken() {
  assertNotIdleExpired()
  const { data, error } = await client().auth.getSession()
  if (error) throw new Error('Your Supabase session could not be read.')
  if (!data.session?.access_token) throw new Error('Please sign in to continue.')
  assertNotIdleExpired()
  return data.session.access_token
}

async function sendAuthenticatedRequest(path, { body, method, headers = {}, signal }, accessToken) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    signal,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}))
  return { data, response }
}

export async function authenticatedApiRequest(path, { body, method = 'GET', headers = {}, signal } = {}) {
  const owner = remembered, auth = supabase
  const checkOwner = () => {
    if (owner !== remembered) throw new Error('The active login changed. Please try again.')
    assertNotIdleExpired()
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You are offline. Orders and payments cannot be sent until you reconnect.')
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)
  let accessToken = await getSupabaseAccessToken()
  checkOwner()
  let result = await sendAuthenticatedRequest(path, { body, method, headers, signal }, accessToken)

  if (result.response.status === 401 && auth) {
    checkOwner()
    const { data: refreshed, error } = await auth.auth.refreshSession()
    if (!error && refreshed.session?.access_token) {
      checkOwner()
      accessToken = refreshed.session.access_token
      result = await sendAuthenticatedRequest(path, { body, method, headers, signal }, accessToken)
    }
  }

  if (!result.response.ok) {
    const error = new Error(result.data.error || 'The server could not complete this request.')
    error.status = result.response.status
    throw error
  }
  return result.data
}

export async function signInSupabaseAdmin(email, password, { onVerifying } = {}) {
  beginIndependentLogin()
  const { data, error } = await client().auth.signInWithPassword({ email: String(email).trim(), password })
  if (error || !data.session?.access_token) throw new Error('Unable to sign in. Please check your email and password.')
  onVerifying?.()
  const user = await apiUser(data.session.access_token, { waitForWakeup: true })
  if (user.role !== 'admin') {
    await client().auth.signOut({ scope: 'local' })
    throw new Error('This account is not authorized for the Admin portal.')
  }
  return user
}

export async function signInSupabaseUser(email, password, { onVerifying } = {}) {
  beginIndependentLogin()
  const { data, error } = await client().auth.signInWithPassword({ email: String(email).trim(), password })
  if (error || !data.session?.access_token) throw new Error('Unable to sign in. Please check your email and password.')
  onVerifying?.()
  return apiUser(data.session.access_token, { waitForWakeup: true })
}

export async function restoreSupabaseAdmin(session) {
  if (!session?.access_token) return null
  const user = await apiUser(session.access_token)
  if (user.role !== 'admin') throw new Error('This account is not authorized for the Admin portal.')
  return user
}

export async function restoreSupabaseUser(session) {
  if (!session?.access_token) return null
  return apiUser(session.access_token)
}

export async function signOutSupabaseAdmin() {
  if (supabase) await supabase.auth.signOut({ scope: 'local' })
}

export function subscribeToSupabaseSession(onChange) {
  if (!supabase) { onChange(null); return () => {} }
  observers.set(onChange, observe(onChange))
  return () => { observers.get(onChange)?.unsubscribe(); observers.delete(onChange) }
}
