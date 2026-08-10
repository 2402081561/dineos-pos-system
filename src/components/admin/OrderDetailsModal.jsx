import { createPortal } from 'react-dom'
import Button from '../common/Button'
import { formatCurrency } from '../../utils/currency'

const statusSteps = ['received', 'preparing', 'ready', 'served']

function formatStatus(status) {
  return String(status ?? 'received').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDateTime(value) {
  if (!value?.toDate) return '—'
  return new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short' }).format(value.toDate())
}

function OrderDetailsModal({ isCancelling, onCancelOrder, onClose, order }) {
  const currentStatus = String(order.status ?? 'received').toLowerCase()
  const isCancelled = currentStatus === 'cancelled'
  const statusIndex = statusSteps.indexOf(currentStatus)
  const canCancel = ['received', 'preparing'].includes(currentStatus)
  const orderNumber = order.orderNumber ?? `#${order.id.slice(-6).toUpperCase()}`
  const tableNumber = order.tableNumber ?? order.tableId?.replace('temporary-table-', '') ?? '—'

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]">
      <div className="mx-auto flex min-h-full max-w-2xl items-center py-4">
        <section aria-modal="true" className="my-4 w-full animate-[page-enter_180ms_ease-out] rounded-3xl bg-white p-6 shadow-2xl sm:p-8" role="dialog"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">{orderNumber} · Table {tableNumber}</p><h2 className="mt-1 text-2xl font-bold">Order details</h2></div><button aria-label="Close dialog" className="rounded-lg px-2 text-2xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-200" disabled={isCancelling} onClick={onClose} type="button">×</button></div><div className="mt-6 grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Customer</p><p className="mt-1 font-semibold text-slate-800">{order.customerNickname || 'Guest'}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Created</p><p className="mt-1 text-sm font-semibold text-slate-800">{formatDateTime(order.createdAt)}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Updated</p><p className="mt-1 text-sm font-semibold text-slate-800">{formatDateTime(order.updatedAt)}</p></div></div><section className="mt-6 overflow-hidden rounded-2xl border border-slate-100"><div className="border-b border-slate-100 p-4"><h3 className="font-bold">Order items</h3></div><div className="divide-y divide-slate-100">{order.items?.map((item, index) => <div className="flex items-start justify-between gap-4 p-4" key={`${item.menuItemId}-${index}`}><div><p className="font-semibold text-slate-800">{item.quantity}× {item.name}</p>{item.notes && <p className="mt-1 text-sm text-slate-500">Note: {item.notes}</p>}</div><p className="whitespace-nowrap font-bold text-slate-700">{formatCurrency(Number(item.price) * Number(item.quantity))}</p></div>)}</div></section><section className="mt-6 rounded-2xl border border-slate-100 p-5"><h3 className="font-bold">Status timeline</h3>{isCancelled ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">Order cancelled</p> : <ol className="mt-5 grid gap-3 sm:grid-cols-4">{statusSteps.map((step, index) => { const isComplete = index <= statusIndex; const isCurrent = index === statusIndex; return <li className={`rounded-xl p-3 text-center text-sm font-bold ${isCurrent ? 'bg-orange-600 text-white' : isComplete ? 'bg-orange-50 text-orange-700' : 'bg-slate-50 text-slate-400'}`} key={step}>{isComplete && '✓ '}{formatStatus(step)}</li> })}</ol>}</section><section className="mt-6 rounded-2xl bg-slate-50 p-5"><div className="space-y-3 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div><div className="flex justify-between text-slate-600"><span>Service charge</span><span>{formatCurrency(order.serviceCharge)}</span></div><div className="flex justify-between text-slate-600"><span>SST</span><span>{formatCurrency(order.sst)}</span></div></div><div className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-lg font-bold"><span>Grand total</span><span className="text-orange-600">{formatCurrency(order.grandTotal)}</span></div></section><div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button disabled={isCancelling} onClick={onClose} variant="outline">Close</Button>{canCancel && <Button disabled={isCancelling} onClick={() => onCancelOrder(order)} variant="danger">{isCancelling ? 'Cancelling order...' : 'Cancel order'}</Button>}</div></section>
      </div>
    </div>,
    document.body,
  )
}

export default OrderDetailsModal
