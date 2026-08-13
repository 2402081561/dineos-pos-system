import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import { subscribeToSupabaseShiftClosing } from '../../services/adminApiService'
import { formatCurrency } from '../../utils/currency'
import { downloadCsv } from '../../utils/reporting'
import { downloadSettlementPdf, settlementLines } from '../../utils/settlement'

const rows = [['cash', 'Cash'], ['card', 'Card'], ['touchNGo', "Touch 'n Go"], ['grabPay', 'GrabPay'], ['fpx', 'FPX'], ['other', 'Other']]

function ClosingDetails() {
  const { closingId } = useParams()
  const [closing, setClosing] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => subscribeToSupabaseShiftClosing(closingId, (nextClosing) => {
    setClosing(nextClosing)
    setIsLoading(false)
  }, (apiError) => {
    console.error('[Closing Details] Failed to load closing:', apiError)
    setError('We could not load this settlement record. Please try again shortly.')
    setIsLoading(false)
  }), [closingId])

  if (isLoading) return <div className="mx-auto max-w-3xl space-y-5 animate-pulse"><div className="h-24 rounded-3xl bg-slate-200" /><div className="h-96 rounded-3xl bg-white" /></div>
  if (error) return <StatePanel description={error} title="Settlement unavailable" tone="error" />
  if (!closing) return <StatePanel description="This settlement record may not exist." title="Settlement not found" />

  const closedDate = closing.closedAt?.toDate?.() ?? new Date(closing.closedAt)
  const closedText = Number.isNaN(closedDate.getTime()) ? '—' : closedDate.toLocaleString('en-MY')

  return <div className="mx-auto max-w-3xl space-y-6"><SectionHeading action={<Link className="no-print" to="/cashier/closing"><Button variant="outline">← Shift closing</Button></Link>} description="A finalized cashier settlement record." eyebrow="Cashier POS" title="Settlement details" /><div className="no-print flex flex-col gap-3 sm:flex-row sm:justify-end"><Button onClick={() => window.print()} variant="outline">⌁ Print settlement</Button><Button onClick={() => downloadSettlementPdf(closing)}>↓ Download PDF</Button><Button onClick={() => downloadCsv(`${closing.closingId}.csv`, settlementLines(closing).map((line) => [line]))} variant="secondary">↓ Export CSV</Button></div><article className="receipt-print overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_38px_rgb(15,23,42,0.07)]"><header className="border-b border-dashed border-slate-200 p-7 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600 text-xl text-white">⌁</div><h1 className="mt-4 text-2xl font-extrabold text-slate-900">DineOS Restaurant</h1><p className="mt-1 text-sm text-slate-500">Cashier shift settlement</p><p className="mt-5 font-mono text-sm font-bold text-orange-600">{closing.closingId}</p></header><section className="grid gap-4 border-b border-slate-100 p-6 text-sm sm:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Cashier</p><p className="mt-1 font-bold text-slate-800">{closing.cashierName}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Closed time</p><p className="mt-1 font-semibold text-slate-800">{closedText}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Transactions</p><p className="mt-1 font-semibold text-slate-800">{closing.transactionCount}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Average bill</p><p className="mt-1 font-semibold text-slate-800">{formatCurrency(closing.averageBill)}</p></div></section><section className="p-6"><h2 className="font-extrabold text-slate-900">Payment breakdown</h2><div className="mt-4 divide-y divide-slate-100">{rows.map(([key, label]) => <div className="flex justify-between py-3 text-sm" key={key}><span className="font-semibold text-slate-700">{label}</span><span className="font-bold text-slate-800">{formatCurrency(closing[key])}</span></div>)}</div><div className="mt-5 space-y-3 border-t border-dashed border-slate-200 pt-5 text-sm"><p className="flex justify-between text-slate-600"><span>Highest bill</span><span>{formatCurrency(closing.highestBill)}</span></p><p className="flex justify-between text-slate-600"><span>Lowest bill</span><span>{formatCurrency(closing.lowestBill)}</span></p><p className="flex justify-between border-t border-slate-200 pt-4 text-xl font-extrabold text-slate-900"><span>Grand total</span><span className="text-orange-600">{formatCurrency(closing.grandTotal)}</span></p></div></section><footer className="border-t border-dashed border-slate-200 bg-orange-50/60 p-6 text-center"><p className="font-extrabold text-slate-900">Settlement Finalized</p><p className="mt-1 text-sm text-slate-500">DineOS Cashier POS</p></footer></article></div>
}

export default ClosingDetails
