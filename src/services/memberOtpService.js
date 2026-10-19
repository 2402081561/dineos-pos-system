import { createClient } from '@supabase/supabase-js'
import { getMemberEmailAuthConfig } from './customerApi'

export function normalizeMemberEmail(value) {
  const email = String(value ?? '').trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.')
  return email
}
export function createEmailOtpService({ client, isEnabled = async () => (await getMemberEmailAuthConfig()).emailOtpEnabled === true }) {
  async function requireEnabled() {
    let enabled = false
    try { enabled = await isEnabled() } catch { /* Fail closed while the API is unavailable. */ }
    if (!enabled) throw new Error('Member email login is not available yet. You can still order as Guest.')
  }
  function auth() {
    if (!client) throw new Error('Member email login is not configured yet. Please contact the restaurant.')
    return client.auth
  }
  return {
    async sendCode(value, purpose = 'login') {
      await requireEnabled()
      const email = normalizeMemberEmail(value)
      if (!['login', 'register'].includes(purpose)) throw new Error('Invalid member login request.')
      const authClient = auth()
      let result
      try { result = await authClient.signInWithOtp({ email, options: { shouldCreateUser: purpose === 'register' } }) }
      catch { throw new Error('Could not send the email code. Please try again or continue as Guest.') }
      const { error } = result
      if (error?.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error?.code)) throw new Error('Too many code requests. Please wait before trying again.')
      if (error?.code === 'email_address_not_authorized') throw new Error('Email delivery is not configured for customers yet. Please contact the restaurant.')
      if (error) throw new Error('Could not send the email code. Please try again or continue as Guest.')
      return email
    },
    async verifyCode(value, code) {
      await requireEnabled()
      const email = normalizeMemberEmail(value), token = String(code ?? '').trim()
      if (!/^\d{6}$/.test(token)) throw new Error('Enter the 6-digit code from your email.')
      const authClient = auth()
      let result
      try { result = await authClient.verifyOtp({ email, token, type: 'email' }) }
      catch { throw new Error('Email verification is temporarily unavailable. Please try again.') }
      const { data, error } = result
      if (error || !data?.session?.access_token || String(data?.user?.email ?? '').toLowerCase() !== email) throw new Error('The code is incorrect or expired. Please try again or request a new code.')
      return data.session.access_token
    },
  }
}
const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
// No staff client/storage, cross-tab account changes, persisted OTPs or tokens.
const memberClient = url && key ? createClient(url, key, { auth: {
  storageKey: 'dineos-member-email-otp', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
} }) : null
const service = createEmailOtpService({ client: memberClient })
export const sendMemberEmailCode = service.sendCode
export const verifyMemberEmailCode = service.verifyCode
