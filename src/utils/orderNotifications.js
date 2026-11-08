const storageKey = 'dineos-order-push-device-v1'
const workerPath = '/order-notifications-sw.js'
const apiPath = '/api/v1/operations/push'

export function notificationSupport(browser = window) {
  const ios = /iPad|iPhone|iPod/.test(browser.navigator.userAgent) || (/Mac/.test(browser.navigator.userAgent) && browser.navigator.maxTouchPoints > 1)
  const standalone = browser.matchMedia?.('(display-mode: standalone)').matches || browser.navigator.standalone === true
  if (!browser.isSecureContext) return 'https'
  if (ios && !standalone) return 'install'
  if (!('serviceWorker' in browser.navigator) || !('PushManager' in browser) || !('Notification' in browser)) return 'unsupported'
  return browser.Notification.permission === 'denied' ? 'denied' : 'supported'
}

export function readPushDevice() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey))
    return value && /^[0-9a-f-]{36}$/i.test(value.deviceId) && typeof value.userId === 'string' ? value : null
  } catch { return null }
}

async function pushRegistration() {
  const registration = await navigator.serviceWorker.getRegistration('/')
  return registration?.active?.scriptURL === new URL(workerPath, window.location.origin).href ? registration : null
}

export async function notificationStatus(request, userId) {
  const config = await request(apiPath + '/config')
  const support = notificationSupport()
  const device = readPushDevice()
  const registration = support === 'supported' || support === 'denied' ? await pushRegistration() : null
  const subscription = await registration?.pushManager.getSubscription()
  if (device && device.userId !== userId && subscription) return { config, support, active: false, otherAccount: true }
  const server = device?.userId === userId ? await request(apiPath + '/devices/' + device.deviceId) : { active: false }
  return { config, support, active: Boolean(server.active && subscription && support === 'supported'), expiresAt: server.expiresAt }
}

function serverKey(value) {
  const data = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(data, (character) => character.charCodeAt(0))
}

// Must be called directly from a button tap. In particular, never await an API
// read before requesting iOS permission (it would lose the user gesture).
export async function enableOrderNotifications(request, { config, userId, language }) {
  if (notificationSupport() !== 'supported') throw new Error('Check your browser notification settings first.')
  if (!config.enabled || config.appOrigin !== window.location.origin) throw new Error('Open the configured HTTPS website to enable notifications.')
  const previous = readPushDevice()
  if (previous && previous.userId !== userId) throw new Error('Disable notifications on this device before switching accounts.')
  const permission = await window.Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')
  const device = previous ?? { deviceId: crypto.randomUUID(), userId }
  // Fail before subscribing if the device cannot remember who owns its pushes.
  localStorage.setItem(storageKey, JSON.stringify(device))
  let registration = await navigator.serviceWorker.register(workerPath, { scope: '/', updateViaCache: 'none' })
  if (!registration.active) registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  const key = serverKey(config.publicKey)
  if (subscription && String(new Uint8Array(subscription.options.applicationServerKey ?? [])) !== String(key)) {
    if (!await subscription.unsubscribe()) throw new Error('Could not disable this device. Check your network and try again.')
    subscription = null
    // A key rotation needs a fresh registration ID; remove only this account's
    // old server device so an old endpoint cannot occupy its unique slot.
  }
  if (!subscription) {
    await request(apiPath + '/devices/' + device.deviceId, { method: 'DELETE' })
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  }
  await request(apiPath + '/subscriptions', { method: 'POST', body: { subscription: subscription.toJSON(), deviceId: device.deviceId, language } })
  return device
}

export async function disableOrderNotifications(request, userId) {
  const device = readPushDevice()
  if (!device || device.userId !== userId) return
  let serverDisabled = false, browserDisabled = false
  try { await request(apiPath + '/devices/' + device.deviceId, { method: 'DELETE' }); serverDisabled = true } catch { /* Local unsubscribe also stops delivery when offline. */ }
  try {
    const registration = await pushRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    browserDisabled = !subscription || await subscription.unsubscribe()
    for (const notification of await registration?.getNotifications() ?? []) notification.close()
  } catch { /* Keep ownership metadata if the server could not stop delivery either. */ }
  if (!serverDisabled && !browserDisabled) throw new Error('Could not disable this device. Check your network and try again.')
  // Keep the device ID if only local unsubscribe succeeded: the next enable
  // must first remove its stale endpoint on the server.
  if (serverDisabled && browserDisabled) localStorage.removeItem(storageKey)
}

export async function testOrderNotification(request, userId) {
  const device = readPushDevice()
  if (device?.userId !== userId) throw new Error('Enable notifications on this device first.')
  return request(apiPath + '/devices/' + device.deviceId + '/test', { method: 'POST', body: {} })
}
