import { useEffect, useState } from 'react'
import { subscribeToSupabaseReceipts } from '../services/adminApiService'

function useReceiptHistory() {
  const [receipts, setReceipts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => subscribeToSupabaseReceipts((nextReceipts) => {
    setReceipts(nextReceipts)
    setError('')
    setIsLoading(false)
  }, (apiError) => {
    console.error('[Receipt History] Failed to load receipts:', apiError)
    setError('We could not load receipt history. Please try again shortly.')
    setIsLoading(false)
  }), [])

  return { error, isLoading, receipts }
}

export default useReceiptHistory
