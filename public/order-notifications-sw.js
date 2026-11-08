/* global clients */
// Deliberately no fetch handler, app shell cache, API cache or offline ordering.
// This worker handles notifications only; it cannot submit orders or payments.
self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data?.json() ?? {} } catch { /* Always show a visible notification. */ }
  const orderId = /^[0-9a-f-]{36}$/i.test(payload.orderId ?? '') ? payload.orderId : null
  const isTest = payload.kind === 'test'
  const path = isTest ? '/cashier/notifications' : orderId ? '/cashier?orderId=' + encodeURIComponent(orderId) : '/cashier'
  event.waitUntil(self.registration.showNotification(String(payload.title || 'DineOS').slice(0, 100), {
    body: String(payload.body || 'New order update. Open DineOS to check.').slice(0, 180),
    icon: '/branding/dineos-touch-icon.png',
    badge: '/branding/dineos-favicon.png',
    tag: String(payload.tag || 'dineos-update').slice(0, 100),
    data: { path },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // No arbitrary URL from the payload: only known, same-origin staff routes.
  const raw = event.notification.data?.path
  const path = raw === '/cashier/notifications' || /^\/cashier\?orderId=[0-9a-f-]{36}$/i.test(raw ?? '') ? raw : '/cashier'
  const target = new URL(path, self.location.origin).href
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const current = windows.find((client) => client.url === target)
    // Never navigate a different window: it may contain a payment or draft.
    if (current) {
      try { await current.focus(); return } catch { /* Open a fresh window if the old client has gone away. */ }
    }
    await clients.openWindow(target)
  })())
})
