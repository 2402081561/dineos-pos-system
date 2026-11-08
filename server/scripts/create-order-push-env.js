import { mkdir, open } from 'node:fs/promises'
import { generateVAPIDKeys } from 'web-push'

// Credentials are generated locally, never printed or committed. Keep this
// stable file backed up privately: replacing VAPID keys requires re-subscription.
const dir = new URL('../../.local-tools/', import.meta.url)
await mkdir(dir, { recursive: true, mode: 0o700 })
const target = new URL('order-push.env', dir)
const keys = generateVAPIDKeys()
const file = await open(target, 'wx', 0o600)
try {
  await file.writeFile(`ORDER_PUSH_ENABLED=false\nORDER_PUSH_APP_ORIGIN=https://dine-os.netlify.app\nORDER_PUSH_SUBJECT=mailto:dine.os.my@gmail.com\nORDER_PUSH_PUBLIC_KEY=${keys.publicKey}\nORDER_PUSH_PRIVATE_KEY=${keys.privateKey}\n`)
} finally { await file.close() }
console.info('Created private push configuration at .local-tools/order-push.env. Sending remains disabled. No existing file was overwritten.')
