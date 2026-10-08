import { Link } from 'react-router-dom'
import Button from '../common/Button'
import { formatCurrency } from '../../utils/currency'

export default function PaymentSuccessPanel({ payment, tableNumber, canClear, cleared, isClearing, error, onClear, onBack }) {
  const date = new Date(payment.paidTime)
  const paidTime = Number.isFinite(date.getTime()) ? date.toLocaleString('en-MY', { timeZone: 'Asia/Kuching', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
  const receiptUrl = `/cashier/receipt/${encodeURIComponent(payment.receiptNumber)}`
  return <section className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white">
    <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 font-bold text-emerald-700">✓</span><div role="status"><h1 className="text-lg font-bold text-slate-900">Payment recorded</h1><p className="mt-0.5 text-xs text-slate-500">Table {tableNumber} · {paidTime}</p></div></header>
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">Paid amount</p><p className="mt-1 text-3xl font-bold tabular-nums text-orange-600">{formatCurrency(payment.total)}</p></div><span className="rounded-md bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700">{payment.method}</span></div>
      {payment.method === 'Cash' && payment.cashReceived != null && <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4"><div><dt className="text-xs text-slate-500">Cash received</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(payment.cashReceived)}</dd></div><div><dt className="text-xs text-slate-500">Change to return</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{payment.changeAmount == null ? '—' : formatCurrency(payment.changeAmount)}</dd></div></dl>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-100 py-3 text-sm"><span className="text-slate-500">Receipt</span><span className="break-all font-semibold text-slate-800">{payment.receiptNumber}</span></div>
      {payment.loyalty?.points > 0 && <p className="text-sm text-slate-600">{payment.loyalty.memberName} earned <strong className="text-orange-700">{payment.loyalty.points} points</strong> · Balance: {payment.loyalty.pointsBalance}</p>}
      {error && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2"><Link className="inline-flex min-h-11 items-center justify-center rounded-lg bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500" to={`${receiptUrl}?print=1`}>Print receipt</Link><Button className="min-h-11 rounded-lg" variant="outline" disabled={cleared || !canClear || isClearing} onClick={onClear}>{cleared ? 'Table cleared' : `Clear Table ${tableNumber}`}</Button></div>
      {cleared ? <p role="status" className="text-sm font-semibold text-emerald-700">Ready for the next customer.</p> : error ? <p className="text-xs leading-5 text-slate-500">Return to the table panel to check the latest bill before trying again.</p> : !canClear ? <p className="text-xs leading-5 text-slate-500">Clear table is available once all items are paid and served or collected. Finish any remaining payments or handoffs from the table panel.</p> : <p className="text-xs text-slate-500">All items are paid and handed over. You can clear this table.</p>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><Button variant="outline" className="rounded-lg" onClick={onBack}>← Back to tables</Button><Link to={receiptUrl} className="text-sm font-semibold text-slate-600 hover:text-orange-700">View receipt</Link></footer>
      <p className="text-xs text-slate-400">This receipt covers the selected items only. Remaining items stay on the table bill.</p>
    </div>
  </section>
}
