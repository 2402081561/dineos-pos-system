import { useEffect, useState } from 'react'
import { getMemberEmailAuthConfig } from '../services/customerApi'
import { subscribePoll } from '../utils/pollSubscription'

export default function useMemberEmailAvailability() {
  const [state, setState] = useState({ isLoading: true, enabled: false })
  useEffect(() => subscribePoll(getMemberEmailAuthConfig,
    (config) => setState({ isLoading: false, enabled: config?.emailOtpEnabled === true }),
    () => setState({ isLoading: false, enabled: false }), 30000), [])
  return state
}
