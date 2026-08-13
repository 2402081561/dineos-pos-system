import { useEffect, useState } from 'react'
import { subscribeToSupabaseAdminDashboard } from '../services/adminApiService'

function useAdminDashboard() {
  const [dashboardData, setDashboardData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    const unsubscribe = subscribeToSupabaseAdminDashboard((data) => {
      if (isMounted) {
        setDashboardData(data)
        setError('')
        setIsLoading(false)
      }
    }, (apiError) => {
      console.error('[useAdminDashboard] API dashboard query failed:', apiError)
      if (isMounted) {
        setError('We could not load the dashboard right now. Please try again shortly.')
        setIsLoading(false)
      }
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  return { dashboardData, isLoading, error }
}

export default useAdminDashboard
