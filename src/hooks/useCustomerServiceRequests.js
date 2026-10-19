import { useEffect, useRef, useState } from 'react'
import { getCustomerServiceRequests } from '../services/customerApi'
import { watchPoll } from '../utils/pollSubscription'

export default function useCustomerServiceRequests(sessionId) {
  const [state, setState] = useState({ sessionId, requests: [], error: '', loading: true })
  const watcher = useRef(null)
  useEffect(() => {
    if (!sessionId) return
    const next = watchPoll(() => getCustomerServiceRequests(sessionId),
      (requests) => setState({ sessionId, requests, error: '', loading: false }),
      () => setState((current) => ({ sessionId, requests: current.sessionId === sessionId ? current.requests : [], error: 'Could not update service requests. Please try again.', loading: false })), { interval: 5000 })
    watcher.current = next
    return () => { next.stop(); watcher.current = null }
  }, [sessionId])
  const current = state.sessionId === sessionId ? state : { requests: [], error: '', loading: true }
  return { ...current, refresh: () => watcher.current?.refreshLatest() }
}
