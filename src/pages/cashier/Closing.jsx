import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import RefundTotals from '../../components/cashier/RefundTotals'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/common/Button'
import ConfirmationDialog from '../../components/common/ConfirmationDialog'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useAdminAuth from '../../hooks/useAdminAuth'
import useShiftClosing from '../../hooks/useShiftClosing'
import { createSupabaseShiftClosing } from '../../services/adminApiService'
import { formatCurrency } from '../../utils/currency'
import { downloadCsv } from '../../utils/reporting'

const paymentRows = [['cash', 'Cash'], ['card', 'Card'], ['touchNGo', "Touch 'n Go"], ['grabPay', 'GrabPay'], ['fpx', 'FPX'], ['other', 'Other']]
const paymentColors = ['#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa', '#cbd5e1']



function ShiftClosing() {
  const { t: uiText, formatDate: uiDate, locale } = useCustomerLanguage()

  const { authUser: user } = useAdminAuth()
  const { closings, error, isLoading, summary } = useShiftClosing()
  const [isConfirming, setIsConfirming] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [closeError, setCloseError] = useState('')
  const [success, setSuccess] = useState(null)
  const [shiftStartTime] = useState(() => {
    const key = `dineos.cashierShiftStart.${user?.uid ?? 'cashier'}`
    const saved = sessionStorage.getItem(key)
    if (saved) return saved
    const startedAt = new Date().toISOString()
    sessionStorage.setItem(key, startedAt)
    return startedAt
  })
  const total = summary.grandTotal
  let position = 0
  const gradient = total ? paymentRows.map(([key], index) => {
    const percentage = (summary[key] / total) * 100
    const start = position
    position += percentage
    return `${paymentColors[index]} ${start}% ${position}%`
  }).join(', ') : '#e2e8f0 0 100%'

  async function handleClose() {
    try {
      setIsClosing(true)
      setCloseError('')
      const result = await createSupabaseShiftClosing()
      setSuccess({ closingId: result.closingId, grandTotal: result.grandTotal, transactionCount: result.transactionCount, closedAt: new Date() })
      setIsConfirming(false)
    } catch (apiError) {
      console.error('[Shift Closing] Failed to close shift:', apiError)
      setCloseError(apiError.message || 'We could not close this shift. Please try again.')
      setIsConfirming(false)
    } finally {
      setIsClosing(false)
    }
  }

  function exportCsv() {
    downloadCsv('dineos-today-settlement.csv', [['Payment method', 'Transactions', 'Amount'], ...paymentRows.map(([key, label]) => [label, summary.counts[key], formatCurrency(summary[key])]), [], ['Grand total', '', formatCurrency(summary.grandTotal)], ['Transactions', summary.transactionCount], ['Average bill', '', formatCurrency(summary.averageBill)]])
  }

  if (isLoading) return <div className="space-y-6 animate-pulse"><div className="h-24 rounded-3xl bg-slate-200" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div className="h-32 rounded-3xl bg-white" key={index} />)}</div></div>
  if (error) return <StatePanel description={uiText(error)} title={uiText("Shift closing unavailable")} tone="error" />

  return <div className="space-y-7"><SectionHeading action={<div className="flex flex-col gap-2 sm:flex-row"><Button onClick={() => window.print()} variant="outline">{uiText("⌁ Print settlement")}</Button><Button onClick={exportCsv} variant="secondary">{uiText("↓ Export CSV")}</Button></div>} description={uiText("Live sales settlement for today's completed payments.")} eyebrow={uiText("Cashier POS")} title={uiText("Today's closing")} /><RefundTotals summary={summary} /><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[[formatCurrency(summary.grandTotal), 'Grand total', 'Paid sales today'], [summary.transactionCount, 'Transactions', 'Paid orders today'], [formatCurrency(summary.averageBill), 'Average bill', 'Average paid order'], [formatCurrency(summary.highestBill), 'Highest bill', `Lowest: ${formatCurrency(summary.lowestBill)}`]].map(([value, label, note]) => <article className="surface-card p-5" key={label}><p className="text-2xl font-extrabold text-slate-900">{value}</p><p className="mt-3 text-sm font-bold text-slate-700">{uiText(label)}</p><p className="mt-1 text-xs text-slate-400">{uiText(note)}</p></article>)}</section><section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]"><article className="surface-card p-5 sm:p-6"><h2 className="text-lg font-extrabold">{uiText("Payment breakdown")}</h2><p className="mt-1 text-sm text-slate-500">{uiText("Today's paid sales by payment method.")}</p><div className="mt-7 grid items-center gap-6 sm:grid-cols-[160px_1fr]"><div className="relative mx-auto h-40 w-40 rounded-full" style={{ background: `conic-gradient(${gradient})` }}><div className="absolute inset-6 flex flex-col items-center justify-center rounded-full bg-white"><span className="text-xl font-extrabold">{summary.transactionCount}</span><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{uiText("Paid orders")}</span></div></div><div className="space-y-3">{paymentRows.map(([key, label], index) => <div className="flex items-center justify-between gap-3 text-sm" key={key}><span className="flex items-center gap-2 text-slate-600"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: paymentColors[index] }} />{uiText(label)}</span><span className="font-bold text-slate-800">{formatCurrency(summary[key])}</span></div>)}</div></div></article><article className="surface-card p-5 sm:p-6"><h2 className="text-lg font-extrabold">{uiText("Settlement information")}</h2><div className="mt-6 grid gap-4 text-sm"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{uiText("Cashier")}</p><p className="mt-1 font-bold text-slate-800">{uiText(user?.displayName || user?.email || 'Cashier')}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{uiText("Shift date")}</p><p className="mt-1 font-semibold text-slate-800">{new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{uiText("Shift start time")}</p><p className="mt-1 font-semibold text-slate-800">{new Date(shiftStartTime).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{uiText("Current time")}</p><p className="mt-1 font-semibold text-slate-800">{new Date().toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</p></div></div>{closeError && <p className="mt-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{uiText(closeError)}</p>}<Button className="mt-6 w-full py-3" onClick={() => setIsConfirming(true)}>{uiText("Close shift")}</Button></article></section><section className="surface-card overflow-hidden"><div className="border-b border-slate-100 p-5 sm:p-6"><h2 className="text-lg font-extrabold">{uiText("Payment settlement")}</h2><p className="mt-1 text-sm text-slate-500">{uiText("Transaction count, value and share of paid sales.")}</p></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3.5 font-bold">{uiText("Payment method")}</th><th className="px-5 py-3.5 font-bold">{uiText("Transaction count")}</th><th className="px-5 py-3.5 font-bold">{uiText("Amount")}</th><th className="px-5 py-3.5 font-bold">{uiText("Percentage")}</th></tr></thead><tbody>{paymentRows.map(([key, label]) => <tr className="border-t border-slate-100" key={key}><td className="px-5 py-4 font-bold text-slate-800">{uiText(label)}</td><td className="px-5 py-4 text-slate-600">{summary.counts[key]}</td><td className="px-5 py-4 font-extrabold text-orange-600">{formatCurrency(summary[key])}</td><td className="px-5 py-4 text-slate-600">{total ? ((summary[key] / total) * 100).toFixed(1) : '0.0'}%</td></tr>)}</tbody></table></div></section>{success && <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6 text-center shadow-sm"><p className="text-4xl">✓</p><h2 className="mt-3 text-2xl font-extrabold text-emerald-900">{uiText("Shift Closed Successfully")}</h2><p className="mt-2 text-sm text-emerald-800">{success.closingId} · {success.closedAt.toLocaleString(locale)}</p><p className="mt-4 text-2xl font-extrabold text-emerald-900">{formatCurrency(success.grandTotal)} · {success.transactionCount}{' '}{uiText("transactions")}</p><Link className="mt-5 inline-flex" to={`/cashier/closing/${encodeURIComponent(success.closingId)}`}><Button>{uiText("View settlement")}</Button></Link></section>}<section className="surface-card overflow-hidden"><div className="border-b border-slate-100 p-5 sm:p-6"><h2 className="text-lg font-extrabold">{uiText("Previous shift closings")}</h2><p className="mt-1 text-sm text-slate-500">{uiText("Settlement records update automatically.")}</p></div>{closings.length === 0 ? <p className="p-6 text-sm text-slate-500">{uiText("No previous shift closings yet.")}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3.5 font-bold">{uiText("Closing ID")}</th><th className="px-5 py-3.5 font-bold">{uiText("Cashier")}</th><th className="px-5 py-3.5 font-bold">{uiText("Date")}</th><th className="px-5 py-3.5 font-bold">{uiText("Transactions")}</th><th className="px-5 py-3.5 font-bold">{uiText("Grand total")}</th><th className="px-5 py-3.5 text-right font-bold">{uiText("Details")}</th></tr></thead><tbody>{closings.map((closing) => <tr className="border-t border-slate-100" key={closing.id}><td className="px-5 py-4 font-mono font-bold text-slate-800">{closing.closingId}</td><td className="px-5 py-4 text-slate-600">{closing.cashierName}</td><td className="px-5 py-4 text-slate-600">{uiDate(closing.closedAt)}</td><td className="px-5 py-4 text-slate-600">{closing.transactionCount}</td><td className="px-5 py-4 font-extrabold text-orange-600">{formatCurrency(closing.grandTotal)}</td><td className="px-5 py-4 text-right"><Link to={`/cashier/closing/${encodeURIComponent(closing.closingId)}`}><Button className="px-3 py-2 text-xs" variant="outline">{uiText("View details")}</Button></Link></td></tr>)}</tbody></table></div>}</section>{isConfirming && <ConfirmationDialog confirmLabel="Close Shift" description={uiText("Close today’s shift? Today’s settlement will be finalized.")} isLoading={isClosing} onCancel={() => { if (!isClosing) setIsConfirming(false) }} onConfirm={handleClose} title={uiText("Close today’s shift?")} />}</div>
}

export default ShiftClosing
