import { useEffect, useState } from 'react'
import { getMemberEmailAuthConfig } from '../services/customerApi'
import { subscribePoll } from '../utils/pollSubscription'

export default function useMemberEmailAvailability() {
  const [state, setState] = useState({ isLoading: true, enabled: false, programEnabled: false, testMode: false })
  useEffect(() => subscribePoll(getMemberEmailAuthConfig,
    (config) => setState({ isLoading: false, enabled: config?.emailOtpEnabled === true, programEnabled: config?.membershipEnabled === true, testMode: config?.testMode === true }),
    () => setState({ isLoading: false, enabled: false, programEnabled: false, testMode: false }), 30000), [])
  return state
}
