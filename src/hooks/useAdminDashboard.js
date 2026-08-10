import { useEffect, useState } from 'react'
import { getAdminDashboardData } from '../services/adminDashboardService'

function useAdminDashboard() {
  const [dashboardData, setDashboardData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadDashboard() {
      try {
        setIsLoading(true)
        setError('')
        const data = await getAdminDashboardData()

        if (isMounted) setDashboardData(data)
      } catch (firebaseError) {
        console.error('[useAdminDashboard] Firestore dashboard query failed:', firebaseError)
        if (isMounted) setError('We could not load the dashboard right now. Please try again shortly.')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadDashboard()

    return () => {
      isMounted = false
    }
  }, [])

  return { dashboardData, isLoading, error }
}

export default useAdminDashboard
