import { readFile, stat } from 'node:fs/promises'
import { OAuth2Client } from 'google-auth-library'
import { normalizedEmail } from './memberEmailConfig.js'
import path from 'node:path'

export async function loadGmailCredentials(filename) {
  const info = await stat(filename)
  // Render mounts platform-managed secret files read-only. Only this exact
  // managed path may be group/world-readable; writable files remain rejected.
  const managed = path.resolve(filename) === '/etc/secrets/dineos-gmail.json'
  if (!info.isFile() || info.size > 20000 || (info.mode & (managed ? 0o022 : 0o077))) throw new Error('Private file required')
  return JSON.parse(await readFile(filename, 'utf8'))
}

export async function gmailAccessToken(credentials) {
  const client = new OAuth2Client({ clientId: credentials.clientId, clientSecret: credentials.clientSecret, transporterOptions: { timeout: 15000 } })
  client.setCredentials({ refresh_token: credentials.refreshToken })
  return (await client.getAccessToken()).token
}

// Gmail has no send idempotency guarantee. The queue must never replay an
// attempted Gmail job, including after a crash or an uncertain acknowledgement.
export function createGmailWelcomeSender({ config, fetchEmail = fetch, loadCredentials = () => loadGmailCredentials(config.gmailCredentialsFile), getAccessToken = gmailAccessToken }) {
  return async (body) => {
    const fail = (code) => { const error = new Error(code); error.code = code; throw error }
    if (!config.welcomeEnabled) fail('EMAIL_DISABLED')
    if (body.deliveryProvider !== 'gmail') fail('EMAIL_PROVIDER_MISMATCH')
    const recipient = body.to?.length === 1 ? normalizedEmail(body.to[0]) : ''
    if (!recipient || (config.mode === 'test' && recipient !== config.testRecipient)) fail('TEST_RECIPIENT_BLOCKED')
    if (typeof body.from !== 'string' || /[\r\n\p{Cc}]/u.test(body.from) || /[\r\n\p{Cc}]/u.test(body.subject ?? '')) fail('EMAIL_INVALID_HEADER')
    let credentials, token
    try {
      credentials = await loadCredentials()
      const address = normalizedEmail(body.from.match(/<([^<>]+)>$/)?.[1] ?? body.from)
      if (!address || address !== normalizedEmail(credentials.configuredSender)
        || credentials.scope !== 'https://www.googleapis.com/auth/gmail.send'
        || !credentials.refreshToken || !credentials.clientId || !credentials.clientSecret) fail('GMAIL_CREDENTIALS_INVALID')
      token = await getAccessToken(credentials)
      if (!token) fail('GMAIL_CREDENTIALS_INVALID')
    } catch { fail('GMAIL_AUTH_UNAVAILABLE') }
    // Base64 text avoids MIME boundary and header injection from user content.
    const raw = Buffer.from([
      `From: ${normalizedEmail(credentials.configuredSender)}`, `To: ${recipient}`,
      `Subject: =?UTF-8?B?${Buffer.from(body.subject).toString('base64')}?=`,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64', '',
      Buffer.from(body.text).toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '', '',
    ].join('\r\n')).toString('base64url')
    try {
      const response = await fetchEmail('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }), signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) fail('GMAIL_SEND_UNCONFIRMED')
      const result = await response.json()
      if (typeof result.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(result.id)) fail('GMAIL_SEND_UNCONFIRMED')
      return result.id // Provider acceptance only, not inbox delivery.
    } catch { fail('GMAIL_SEND_UNCONFIRMED') }
  }
}
