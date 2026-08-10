import { useEffect, useState } from 'react'
import { subscribeToPendingServiceRequests } from '../services/serviceRequestService'

function useServiceRequests() {
  const [requests, setRequests] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsubscribe = subscribeToPendingServiceRequests(
      (pendingRequests) => {
        setRequests(pendingRequests)
        setError('')
        setIsLoading(false)
      },
      (firebaseError) => {
        console.error('[useServiceRequests] Firestore subscription failed:', firebaseError)
        setError('We could not load service requests right now. Please try again shortly.')
        setIsLoading(false)
      },
    )

    return unsubscribe
  }, [])

  return { requests, isLoading, error }
}

export default useServiceRequests
