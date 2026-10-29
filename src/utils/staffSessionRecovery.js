import { watchPoll } from './pollSubscription.js'

// Only re-check an existing token against /me. Never sign in, submit a write or
// discard saved credentials because a network/database request failed.
export function recoverStaffSession(load, onVerified, onUnavailable, onRejected, options = {}) {
  const watcher = watchPoll(load, (user) => {
    watcher.stop()
    onVerified(user)
  }, (error) => {
    if ([401, 403].includes(error?.status)) { watcher.stop(); onRejected(error) }
    else onUnavailable(error)
  }, { interval: 5000, ...options })
  return watcher
}
