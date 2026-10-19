import { watchPoll } from './pollSubscription.js'

export function watchCustomerSession(load, onVerified, onEnded, options = {}) {
  const { onUnavailable, ...pollOptions } = options
  const watcher = watchPoll(load, onVerified, (error) => {
    // Only the API's explicit rejection proves the table visit has ended.
    // Offline, timeout, and server errors retain the session and retry later.
    if (error?.status === 401) { watcher.stop(); onEnded() }
    else onUnavailable?.(error)
  }, { interval: 30000, ...pollOptions })
  return watcher
}
