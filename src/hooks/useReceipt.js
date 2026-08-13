import { useEffect, useState } from 'react'
import { subscribeToSupabaseReceipt } from '../services/adminApiService'

function useReceipt(receiptNumber) {
  const [receipt, setReceipt] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!receiptNumber) {
      setReceipt(null)
      setIsLoading(false)
      return () => {}
    }
    setIsLoading(true)
    return subscribeToSupabaseReceipt(receiptNumber, (nextReceipt) => {
      setReceipt(nextReceipt)
      setError('')
      setIsLoading(false)
    }, (apiError) => {
      console.error('[Receipt] Failed to load receipt:', apiError)
      setError('We could not load this receipt. Please try again shortly.')
      setIsLoading(false)
    })
  }, [receiptNumber])

  return { error, isLoading, receipt }
}

export default useReceipt
