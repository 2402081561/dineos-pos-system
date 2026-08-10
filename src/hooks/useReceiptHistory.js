import { useEffect, useState } from 'react'
import { subscribeToReceiptHistory } from '../services/receiptService'

function useReceiptHistory() {
  const [receipts, setReceipts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => subscribeToReceiptHistory((nextReceipts) => {
    setReceipts(nextReceipts)
    setError('')
    setIsLoading(false)
  }, (firebaseError) => {
    console.error('[Receipt History] Failed to load receipts:', firebaseError)
    setError('We could not load receipt history. Please try again shortly.')
    setIsLoading(false)
  }), [])

  return { error, isLoading, receipts }
}

export default useReceiptHistory
