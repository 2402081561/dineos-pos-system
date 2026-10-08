import { useEffect, useRef } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import Button from '../../components/common/Button'
import StatePanel from '../../components/common/StatePanel'
import ReceiptPaper from '../../components/cashier/ReceiptPaper'
import useReceipt from '../../hooks/useReceipt'
import useShopSettings from '../../hooks/useShopSettings'
import { reprintSupabaseReceipt } from '../../services/adminApiService'
import { waitForReceiptAssets } from '../../utils/receiptPrint'

function Receipt() {
  const { receiptNumber } = useParams()
  const { state } = useLocation()
  const returnTo = state?.returnTo === '/admin/orders' ? '/admin/orders' : '/cashier/history'
  const { error, isLoading, receipt } = useReceipt(receiptNumber)
  const { isLoading: isShopLoading, error: shopError, refresh: reloadShopSettings } = useShopSettings()
  const [searchParams] = useSearchParams()
  const autoPrint = searchParams.get('print') === '1'
  const printedReceipt = useRef(null)
  const needsShopName = !receipt?.restaurantName
  const canPrint = Boolean(!error && !isLoading && (!needsShopName || (!isShopLoading && !shopError)) && receipt?.receiptNumber === receiptNumber && receipt?.paidAt && Number.isFinite(new Date(receipt.paidAt).getTime()))
  useEffect(() => {
    if (!autoPrint || !canPrint || printedReceipt.current === receiptNumber) return
    let cancelled = false
    waitForReceiptAssets().then(() => {
      if (cancelled) return
      printedReceipt.current = receiptNumber
      window.print()
      void reprintSupabaseReceipt(receiptNumber).catch((error) => console.error('[Receipt] Reprint audit failed:', error))
    })
    return () => { cancelled = true }
  }, [autoPrint, canPrint, receiptNumber])
  if (isLoading) return <div className="mx-auto max-w-md animate-pulse rounded-lg bg-white h-[560px]" />
  if (error) return <StatePanel description={error} title="Receipt unavailable" tone="error" />
  if (!receipt) return <StatePanel description="The receipt may not exist or is no longer available." title="Receipt not found" />
  if (needsShopName && isShopLoading) return <StatePanel description="Loading the current shop name for this historical receipt." title="Loading shop settings" />
  if (needsShopName && shopError) return <StatePanel description="We could not load the current shop name. Please try again before printing." onRetry={reloadShopSettings} title="Shop name unavailable" tone="error" />
  if (!canPrint) return <StatePanel description="Only completed payments can be printed as receipts." title="Payment not completed" />
  async function handleReprint() {
    await waitForReceiptAssets()
    window.print()
    void reprintSupabaseReceipt(receipt.receiptNumber).catch((error) => console.error('[Receipt] Reprint audit failed:', error))
  }
  return <div className="receipt-preview">
    <div className="no-print receipt-toolbar">
      <Button onClick={handleReprint}>Print / Save PDF</Button>
      <Link className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700" to={returnTo}>Close</Link>
    </div>
    <ReceiptPaper receipt={receipt} />
  </div>
}

export default Receipt
