import { useEffect, useState } from 'react'
import { getSupabaseServiceRequests, subscribeToSupabaseServiceRequests } from '../services/adminApiService'

function useServiceRequests() {
  const [requests, setRequests] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsubscribe = subscribeToSupabaseServiceRequests(
      (pendingRequests) => {
        setRequests(pendingRequests)
        setError('')
        setIsLoading(false)
      },
      (apiError) => {
        console.error('[useServiceRequests] API subscription failed:', apiError)
        setError('We could not load service requests right now. Please try again shortly.')
        setIsLoading(false)
      },
    )

    return unsubscribe
  }, [])

  async function refresh() {
    try {
      const pendingRequests = await getSupabaseServiceRequests()
      setRequests(pendingRequests)
      setError('')
    } catch (apiError) {
      console.error('[useServiceRequests] API refresh failed:', apiError)
      setError('We could not refresh service requests right now. Please try again shortly.')
    } finally {
      setIsLoading(false)
    }
  }

  return { requests, isLoading, error, refresh }
}

export default useServiceRequests
