import { useEffect, useState } from 'react'
import { authenticatedApiRequest } from '../services/supabaseAuthService'

function toSafeNonNegativeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function useOperationalTables() {
  const [tables, setTables] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      try {
        const data = await authenticatedApiRequest('/api/v1/staff/tables')
        if (!isMounted) return
        setTables(data.tables.map((table) => {
          const orderCount = Math.trunc(toSafeNonNegativeNumber(table.orderCount))
          return {
            ...table,
            isActive: table.isEnabled,
            orderCount,
            participantCount: Math.trunc(toSafeNonNegativeNumber(table.participantCount)),
            unpaidTotal: toSafeNonNegativeNumber(table.unpaidTotal),
            tableOrders: Array.from({ length: orderCount }),
          }
        }))
        setError('')
      } catch (apiError) {
        console.error('[Operational Tables] API query failed:', apiError)
        if (isMounted) setError('We could not load the table overview right now. Please try again shortly.')
      } finally { if (isMounted) setIsLoading(false) }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 10000)
    return () => {
      isMounted = false
      window.clearInterval(timer)
    }
  }, [])

  return { tables, isLoading, error }
}

export default useOperationalTables
