// Explicit operator command. No .env loading, mail sending, database access,
// token output or membership enabling. Safe for a hosted preflight after deploy.
import { loadGmailCredentials, gmailAccessToken } from '../src/memberWelcomeGmail.js'
try {
  const credentials = await loadGmailCredentials(process.env.MEMBER_GMAIL_CREDENTIALS_FILE ?? '')
  if (credentials.testingMode !== false || credentials.authorizationMode !== 'personal'
    || credentials.configuredSender !== 'dine.os.my@gmail.com'
    || credentials.scope !== 'https://www.googleapis.com/auth/gmail.send'
    || !credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) throw new Error()
  if (!await gmailAccessToken(credentials)) throw new Error()
  console.log('GMAIL_AUTH_READY: Personal grant refreshed; no email sent. Sender identity and inbox delivery are not verified by this check.')
} catch {
  console.error('GMAIL_AUTH_UNAVAILABLE: check private file, Personal grant and network. No credentials logged.')
  process.exitCode = 1
}
