import { Link, useParams } from 'react-router-dom'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useReceipt from '../../hooks/useReceipt'
import { reprintSupabaseReceipt } from '../../services/adminApiService'
import { formatCurrency } from '../../utils/currency'
import { downloadReceiptPdf, getReceiptDetails } from '../../utils/receipt'

function formatDate(value, options) {
  const date = value?.toDate?.() ?? new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-MY', options).format(date)
}

function Receipt() {
  const { receiptNumber } = useParams()
  const { error, isLoading, receipt } = useReceipt(receiptNumber)
  if (isLoading) return <div className="mx-auto max-w-3xl space-y-5 animate-pulse"><div className="h-24 rounded-3xl bg-slate-200" /><div className="h-[560px] rounded-3xl bg-white" /></div>
  if (error) return <StatePanel description={error} title="Receipt unavailable" tone="error" />
  if (!receipt) return <StatePanel description="The receipt may not exist or is no longer available." title="Receipt not found" />
  const details = getReceiptDetails(receipt)
  function handleReprint() {
    window.print()
    void reprintSupabaseReceipt(receipt.receiptNumber).catch((error) => console.error('[Receipt] Reprint audit failed:', error))
  }
  return <div className="mx-auto max-w-3xl space-y-6"><SectionHeading action={<Link className="no-print" to="/cashier/history"><Button variant="outline">← Receipt history</Button></Link>} description="A completed payment record for this table." eyebrow="Cashier POS" title="Receipt" /><div className="no-print flex flex-col gap-3 sm:flex-row sm:justify-end"><Button onClick={handleReprint} variant="outline">⌁ Reprint receipt</Button><Button onClick={() => downloadReceiptPdf(receipt)}>↓ Download PDF</Button></div><article className="receipt-print overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_38px_rgb(15,23,42,0.07)]"><header className="border-b border-dashed border-slate-200 p-7 text-center sm:p-9"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600 text-xl text-white">⌁</div><h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">DineOS Restaurant</h1><p className="mt-1 text-sm text-slate-500">Payment receipt</p><p className="mt-5 font-mono text-sm font-bold text-orange-600">{receipt.receiptNumber}</p></header><section className="grid gap-4 border-b border-slate-100 p-6 text-sm sm:grid-cols-2 sm:p-7"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Table</p><p className="mt-1 font-bold text-slate-800">Table {receipt.tableNumber}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Customer(s)</p><p className="mt-1 font-bold text-slate-800">{details.customers.join(', ') || 'Guest'}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Receipt date</p><p className="mt-1 font-semibold text-slate-800">{formatDate(receipt.paidAt, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Receipt time</p><p className="mt-1 font-semibold text-slate-800">{formatDate(receipt.paidAt, { hour: 'numeric', minute: '2-digit' })}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Cashier</p><p className="mt-1 font-semibold text-slate-800">{details.cashier}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Payment method</p><p className="mt-1 font-semibold text-slate-800">{receipt.paymentMethod}</p></div></section><section className="p-6 sm:p-7"><div className="flex items-center justify-between border-b border-slate-100 pb-3 text-xs font-bold uppercase tracking-wide text-slate-400"><span>Order details</span><span>Amount</span></div><div className="divide-y divide-slate-100">{details.items.map((item, index) => <div className="flex items-start justify-between gap-4 py-4" key={`${item.menuItemId}-${index}`}><div><p className="font-semibold text-slate-800">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.quantity} × {formatCurrency(item.price)}</p></div><p className="whitespace-nowrap font-bold text-slate-700">{formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 0))}</p></div>)}</div><div className="mt-5 space-y-3 border-t border-dashed border-slate-200 pt-5 text-sm"><p className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatCurrency(details.subtotal)}</span></p>{details.discount > 0 && <p className="flex justify-between text-slate-600"><span>Discount</span><span>-{formatCurrency(details.discount)}</span></p>}<p className="flex justify-between text-slate-600"><span>Service charge</span><span>{formatCurrency(details.serviceCharge)}</span></p><p className="flex justify-between text-slate-600"><span>SST</span><span>{formatCurrency(details.sst)}</span></p><p className="flex justify-between border-t border-slate-200 pt-4 text-xl font-extrabold text-slate-900"><span>Grand total</span><span className="text-orange-600">{formatCurrency(receipt.grandTotal)}</span></p></div></section><footer className="border-t border-dashed border-slate-200 bg-orange-50/60 p-7 text-center"><span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Paid</span><p className="mt-5 text-lg font-extrabold text-slate-900">Thank You For Dining With Us</p><p className="mt-1 text-sm text-slate-500">Visit Again</p></footer></article></div>
}

export default Receipt
