// Stop suppresses late responses when a different ticket is selected. Schedule
// after completion so slow connections never overlap reads for the same ticket.
export function watchOrderDetails(load, onChange, { schedule = setTimeout, cancel = clearTimeout, interval = 5000 } = {}) {
  let active = true
  let pending = null
  let timer
  let order = null
  function refresh() {
    if (!active || pending) return pending
    cancel(timer)
    // Keep a failed read visible until it actually succeeds. In particular,
    // retrying must not briefly re-enable printing from a stale paid snapshot.
    if (!order) onChange({ order: null, isLoading: true, error: '' })
    pending = Promise.resolve().then(load).then((result) => {
      if (!active) return
      order = result
      onChange({ order, isLoading: false, error: '' })
    }).catch((error) => {
      if (active) onChange({ order, isLoading: false, error: error.message || 'Order details unavailable' })
    }).finally(() => {
      pending = null
      if (active) timer = schedule(refresh, interval)
    })
    return pending
  }
  void refresh()
  return { refresh, stop() { active = false; cancel(timer) } }
}
