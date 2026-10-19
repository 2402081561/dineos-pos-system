import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import Button from '../../components/common/Button'
import StatePanel from '../../components/common/StatePanel'
import ReceiptPaper from '../../components/cashier/ReceiptPaper'
import ReceiptRefundSummary from '../../components/cashier/ReceiptRefundSummary'
import useReceipt from '../../hooks/useReceipt'
import useShopSettings from '../../hooks/useShopSettings'
import { reprintSupabaseReceipt } from '../../services/adminApiService'
import { waitForReceiptAssets } from '../../utils/receiptPrint'
import { androidReceiptIntent, buildAndroidReceipt, isAndroidPrintDevice } from '../../utils/androidReceiptPrint'

function Receipt() {
  const { t: uiText, language } = useCustomerLanguage()
  const [printError, setPrintError] = useState('')
  const [handedOff, setHandedOff] = useState(false)
  const android = isAndroidPrintDevice(navigator.userAgent)

  const { receiptNumber } = useParams()
  const { state } = useLocation()
  const returnTo = ['/admin/orders', '/admin/dashboard', '/cashier'].includes(state?.returnTo) ? state.returnTo : '/cashier/history'
  const { error, isLoading, receipt } = useReceipt(receiptNumber)
  const { name, isLoading: isShopLoading, error: shopError, refresh: reloadShopSettings } = useShopSettings()
  const [searchParams] = useSearchParams()
  const autoPrint = searchParams.get('print') === '1'
  const printedReceipt = useRef(null)
  const needsShopName = !receipt?.restaurantName
  const canPrint = Boolean(!error && !isLoading && (!needsShopName || (!isShopLoading && !shopError)) && receipt?.receiptNumber === receiptNumber && receipt?.paidAt && Number.isFinite(new Date(receipt.paidAt).getTime()))
  useEffect(() => {
    // Chrome requires a fresh tap to open native apps. Never auto-launch the
    // helper after an asynchronous fetch, nor fall through to window.print.
    if (android || !autoPrint || !canPrint || printedReceipt.current === receiptNumber) return
    let cancelled = false
    waitForReceiptAssets().then(() => {
      if (cancelled) return
      printedReceipt.current = receiptNumber
      window.print()
      void reprintSupabaseReceipt(receiptNumber).catch((error) => console.error('[Receipt] Reprint audit failed:', error))
    })
    return () => { cancelled = true }
  }, [android, autoPrint, canPrint, receiptNumber])
  if (isLoading) return <div className="mx-auto max-w-md animate-pulse rounded-lg bg-white h-[560px]" />
  if (error) return <StatePanel description={uiText(error)} title={uiText("Receipt unavailable")} tone="error" />
  if (!receipt) return <StatePanel description={uiText("The receipt may not exist or is no longer available.")} title={uiText("Receipt not found")} />
  if (needsShopName && isShopLoading) return <StatePanel description={uiText("Loading the current shop name for this historical receipt.")} title={uiText("Loading shop settings")} />
  if (needsShopName && shopError) return <StatePanel description={uiText("We could not load the current shop name. Please try again before printing.")} onRetry={reloadShopSettings} title={uiText("Shop name unavailable")} tone="error" />
  if (!canPrint) return <StatePanel description={uiText("Only completed payments can be printed as receipts.")} title={uiText("Payment not completed")} />
  async function handleReprint() {
    await waitForReceiptAssets()
    window.print()
    void reprintSupabaseReceipt(receipt.receiptNumber).catch((error) => console.error('[Receipt] Reprint audit failed:', error))
  }
  function handleAndroidPrint() {
    if (!canPrint) return
    setPrintError('')
    try {
      const intent = androidReceiptIntent(buildAndroidReceipt(receipt, { shopName: name, t: uiText, language }))
      // Keep navigation synchronous with this explicit user gesture.
      window.location.assign(intent)
      setHandedOff(true)
      void reprintSupabaseReceipt(receipt.receiptNumber).catch((error) => console.error('[Receipt] Reprint audit failed:', error))
    } catch (error) { setPrintError(error.message) }
  }
  return <div className="receipt-preview">
    <div className="no-print receipt-toolbar">
      {android && <Button onClick={handleAndroidPrint}>{uiText('Print with Bluetooth helper')}</Button>}
      <Button variant={android ? 'outline' : 'primary'} onClick={handleReprint}>{uiText("Print / Save PDF")}</Button>
      <Link className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700" to={returnTo} state={{ orderId: state?.orderId }}>{uiText("Close")}</Link>
    </div>
    {android && <div className="no-print mx-auto mb-4 max-w-lg space-y-2 rounded-xl border border-orange-100 bg-orange-50 p-4 text-sm text-slate-700">
      <p>{uiText('Install DineOS Print Helper v0.2.0 or later. Tap Bluetooth print, then confirm the receipt in the helper. Use Android Chrome.')}</p>
      <p>{uiText('Nothing opened? Update the helper APK and check Chrome allows opening the app, or use Print / Save PDF.')}</p>
      {handedOff && <p role="status">{uiText('The helper was requested. This does not confirm printing; check the helper and paper before retrying.')}</p>}
      {printError && <p role="alert" className="text-red-700">{uiText(printError)}</p>}
    </div>}
    <ReceiptRefundSummary key={receiptNumber} receiptNumber={receiptNumber} />
    <ReceiptPaper receipt={receipt} />
  </div>
}

export default Receipt
