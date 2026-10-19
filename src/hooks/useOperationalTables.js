import { useEffect, useState } from 'react'
import { authenticatedApiRequest } from '../services/supabaseAuthService'
import { subscribePoll } from '../utils/pollSubscription'

function toSafeNonNegativeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function useOperationalTables() {
  const [tables, setTables] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    return subscribePoll(() => authenticatedApiRequest('/api/v1/staff/tables'), (data) => {
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
      setIsLoading(false)
    }, (apiError) => {
      console.error('[Operational Tables] API query failed:', apiError)
      setError('We could not load the table overview right now. Please try again shortly.')
      setIsLoading(false)
    })
  }, [])

  return { tables, isLoading, error }
}

export default useOperationalTables
