const feeds = new Map(), listeners = new Set()
let sequence = 0
const emit = () => listeners.forEach((listener) => listener())
export function trackFeed(interval) {
  const id = ++sequence
  feeds.set(id, { startedAt: Date.now(), lastSuccess: null, failed: false, interval })
  emit()
  return {
    success() { const feed = feeds.get(id); if (feed) { feeds.set(id, { ...feed, failed: false, lastSuccess: Date.now() }); emit() } },
    failure() { const feed = feeds.get(id); if (feed) { feeds.set(id, { ...feed, failed: true }); emit() } },
    stop() { feeds.delete(id); emit() },
  }
}
export function connectionSnapshot(now = Date.now(), online = true) {
  const active = [...feeds.values()]
  const stale = active.some((feed) => now - (feed.lastSuccess ?? feed.startedAt) > Math.max(20000, feed.interval * 3))
  const pending = active.some((feed) => feed.lastSuccess === null)
  return {
    state: !online ? 'offline' : active.some((feed) => feed.failed) || stale ? 'stale' : pending ? 'checking' : active.length ? 'current' : 'idle',
    lastUpdated: active.length && active.every((feed) => feed.lastSuccess) ? Math.min(...active.map((feed) => feed.lastSuccess)) : null,
  }
}
export function subscribeConnection(listener) { listeners.add(listener); return () => listeners.delete(listener) }
