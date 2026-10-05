import { createClient } from '@supabase/supabase-js'

const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
const apiUrl = String(import.meta.env.VITE_API_URL ?? 'http://localhost:4000').trim().replace(/\/$/, '')
const authStorage = typeof window !== 'undefined' ? window.sessionStorage : undefined
const authTabIdKey = 'dineos-auth-tab-id'
const authTabId = (() => {
  if (!authStorage) return 'server'
  const existing = authStorage.getItem(authTabIdKey)
  if (existing) return existing
  const created = crypto.randomUUID()
  authStorage.setItem(authTabIdKey, created)
  return created
})()

const supabase = url && publishableKey ? createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: authStorage,
    storageKey: `dineos-staff-session-${authTabId}`,
  },
}) : null

function client() {
  if (!supabase) throw new Error('Supabase login is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  return supabase
}

async function apiUser(accessToken) {
  const response = await fetch(`${apiUrl}/api/v1/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 403 && supabase) await supabase.auth.signOut({ scope: 'local' })
    throw new Error(body.error || 'The server could not verify this account.')
  }
  return body.user
}

export async function getSupabaseAccessToken() {
  const { data, error } = await client().auth.getSession()
  if (error) throw new Error('Your Supabase session could not be read.')
  if (!data.session?.access_token) throw new Error('Please sign in to continue.')
  return data.session.access_token
}

async function sendAuthenticatedRequest(path, { body, method, headers = {} }, accessToken) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
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

export async function authenticatedApiRequest(path, { body, method = 'GET', headers = {} } = {}) {
  let accessToken = await getSupabaseAccessToken()
  let result = await sendAuthenticatedRequest(path, { body, method, headers }, accessToken)

  if (result.response.status === 401 && supabase) {
    const { data: refreshed, error } = await supabase.auth.refreshSession()
    if (!error && refreshed.session?.access_token) {
      accessToken = refreshed.session.access_token
      result = await sendAuthenticatedRequest(path, { body, method, headers }, accessToken)
    }
  }

  if (!result.response.ok) throw new Error(result.data.error || 'The server could not complete this request.')
  return result.data
}

export async function signInSupabaseAdmin(email, password) {
  const { data, error } = await client().auth.signInWithPassword({ email: String(email).trim(), password })
  if (error) throw new Error('Unable to sign in. Please check your email and password.')
  const user = await apiUser(data.session.access_token)
  if (user.role !== 'admin') {
    await client().auth.signOut({ scope: 'local' })
    throw new Error('This account is not authorized for the Admin portal.')
  }
  return user
}

export async function signInSupabaseUser(email, password) {
  const { data, error } = await client().auth.signInWithPassword({ email: String(email).trim(), password })
  if (error || !data.session?.access_token) throw new Error('Unable to sign in. Please check your email and password.')
  return apiUser(data.session.access_token)
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
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => onChange(session, event))
  return () => subscription.unsubscribe()
}
