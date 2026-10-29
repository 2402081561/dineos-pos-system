// Only schedule the next read after this one finishes. Cleanup also suppresses
// late successes/errors from a previous page, session, or selected table.
import { trackFeed } from './connectionStatus.js'

export function watchPoll(load, onData, onError, { interval = 10000, schedule = setTimeout, cancel = clearTimeout, eventTarget = typeof window !== 'undefined' ? window : null } = {}) {
  const feed = trackFeed(interval)
  let active = true
  let pending = null
  let timer
  let revision = 0
  let controller
  function refresh() {
    if (!active || pending) return pending
    cancel(timer)
    const readRevision = revision
    controller = new AbortController()
    const signal = controller.signal
    pending = Promise.resolve().then(() => active ? load(signal) : undefined).then((result) => {
      if (active && readRevision === revision) { onData(result); feed.success() }
    }).catch((error) => {
      if (active && readRevision === revision) { feed.failure(); onError?.(error) }
    }).finally(() => {
      pending = null
      controller = null
      if (active) timer = schedule(refresh, interval)
    })
    return pending
  }
  void refresh()
  // Read-only refresh, never re-send an order/payment after connectivity returns.
  const reconnect = () => { void refresh() }
  eventTarget?.addEventListener?.('online', reconnect)
  return {
    refresh,
    invalidate() { revision++ },
    async refreshLatest() {
      revision++
      controller?.abort()
      // A read begun before a mutation must not be used as its confirmation.
      // Wait for it without publishing it, then take a new serialized snapshot.
      if (pending) await pending
      return active ? refresh() : undefined
    },
    stop() { active = false; controller?.abort(); cancel(timer); eventTarget?.removeEventListener?.('online', reconnect); feed.stop() },
  }
}

export function subscribePoll(load, onData, onError, interval = 10000) {
  return watchPoll(load, onData, onError, { interval }).stop
}
