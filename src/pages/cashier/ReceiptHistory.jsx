import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useReceiptHistory from '../../hooks/useReceiptHistory'
import { formatCurrency } from '../../utils/currency'

function receiptDate(value) {
  const date = value?.toDate?.() ?? new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function dateInputValue(value) {
  const date = value?.toDate?.() ?? new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function ReceiptHistory() {
  const { error, isLoading, receipts } = useReceiptHistory()
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const filteredReceipts = useMemo(() => receipts.filter((receipt) => {
    const text = searchTerm.trim().toLowerCase()
    const matchesText = !text || receipt.receiptNumber.toLowerCase().includes(text) || String(receipt.tableNumber).toLowerCase().includes(text)
    return matchesText && (!dateFilter || dateInputValue(receipt.paidAt) === dateFilter)
  }), [dateFilter, receipts, searchTerm])

  if (isLoading) return <div className="space-y-6 animate-pulse"><div className="h-24 rounded-3xl bg-slate-200" /><div className="h-96 rounded-3xl bg-white" /></div>
  if (error) return <StatePanel description={error} title="Receipt history unavailable" tone="error" />

  return <div className="space-y-6"><SectionHeading description="Paid receipts update automatically after every completed payment." eyebrow="Cashier POS" title="Receipt history" /><section className="surface-card overflow-hidden"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-sm"><label className="sr-only" htmlFor="receipt-search">Search receipt or table</label><span aria-hidden="true" className="absolute left-3 top-2.5 text-slate-400">⌕</span><input className="w-full rounded-xl bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-orange-400" id="receipt-search" onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search receipt number or table" value={searchTerm} /></div><label className="text-sm font-semibold text-slate-600">Date<input className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" onChange={(event) => setDateFilter(event.target.value)} type="date" value={dateFilter} /></label></div>{filteredReceipts.length === 0 ? <div className="p-8"><StatePanel description={receipts.length === 0 ? 'Completed payments will appear here automatically.' : 'Try another receipt number, table, or date.'} title={receipts.length === 0 ? 'No receipts yet.' : 'No matching receipts.'} /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3.5 font-bold">Receipt number</th><th className="px-5 py-3.5 font-bold">Table</th><th className="px-5 py-3.5 font-bold">Date</th><th className="px-5 py-3.5 font-bold">Amount</th><th className="px-5 py-3.5 font-bold">Method</th><th className="px-5 py-3.5 text-right font-bold">Receipt</th></tr></thead><tbody>{filteredReceipts.map((receipt) => <tr className="border-b border-slate-100 transition hover:bg-slate-50" key={receipt.receiptNumber}><td className="px-5 py-4 font-mono font-bold text-slate-800">{receipt.receiptNumber}</td><td className="px-5 py-4 font-semibold text-slate-700">Table {receipt.tableNumber}</td><td className="px-5 py-4 text-slate-600">{receiptDate(receipt.paidAt)}</td><td className="px-5 py-4 font-extrabold text-orange-600">{formatCurrency(receipt.grandTotal)}</td><td className="px-5 py-4 text-slate-600">{receipt.paymentMethod}</td><td className="px-5 py-4 text-right"><Link to={`/cashier/receipt/${encodeURIComponent(receipt.receiptNumber)}`}><Button className="px-3 py-2 text-xs" variant="outline">View receipt</Button></Link></td></tr>)}</tbody></table></div>}</section></div>
}

export default ReceiptHistory
