const emailPattern = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/
export function normalizedEmail(value) {
  const email = String(value ?? '').trim().toLowerCase()
  return email.length <= 254 && emailPattern.test(email) ? email : ''
}

export function memberEmailConfig(env) {
  const mode = env.MEMBER_EMAIL_MODE ?? 'test'
  const testRecipient = normalizedEmail(env.MEMBER_EMAIL_TEST_RECIPIENT)
  const authEnabled = env.MEMBER_EMAIL_OTP_ENABLED === 'true'
    && Boolean(env.SUPABASE_URL && (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY))
    && (mode === 'live' || (mode === 'test' && Boolean(testRecipient)))
  const from = String(env.MEMBER_EMAIL_FROM ?? 'DineOS <onboarding@resend.dev>').trim()
  const senderAddress = from.match(/<([^<>]+)>$/)?.[1] ?? from
  const senderValid = from.length <= 254 && !/[\r\n\p{Cc}]/u.test(from) && Boolean(normalizedEmail(senderAddress))
  const apiKey = String(env.RESEND_API_KEY ?? '').trim()
  const welcomeEnabled = authEnabled && env.MEMBER_WELCOME_EMAIL_ENABLED === 'true'
    && Boolean(apiKey) && senderValid
    && (mode === 'test' || !senderAddress.toLowerCase().endsWith('@resend.dev'))
  return { mode, testRecipient, authEnabled, welcomeEnabled, from, apiKey }
}
