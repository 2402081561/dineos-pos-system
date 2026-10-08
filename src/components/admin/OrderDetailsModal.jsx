import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import Button from '../common/Button'
import OptionSummary from '../common/OptionSummary'
import useShopSettings from '../../hooks/useShopSettings'
import { formatCurrency } from '../../utils/currency'
import { orderDate, orderNumber, orderPaymentLabel, orderStatusLabel, orderStatusStyle, orderTable, orderTypeLabel } from '../../utils/adminOrderPresentation'

const steps = ['received', 'preparing', 'ready', 'served']

function Detail({ label, children }) {
  return <div className="min-w-0"><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-900">{children || '—'}</dd></div>
}

function OrderDetailsModal({ isCancelling, onCancelOrder, onClose, order }) {
  const { name } = useShopSettings()
  const navigate = useNavigate()
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const titleId = useId()
  const status = String(order.status ?? 'received').toLowerCase()
  const cancelled = status === 'cancelled'
  const statusIndex = steps.indexOf(status)
  const paid = order.paymentStatus === 'paid'
  const hasSettledItems = (order.items ?? []).some((item) => Number(item.paidQuantity) > 0 || Number(item.fulfilledQuantity) > 0)
  const canCancel = ['received', 'preparing'].includes(status) && !paid && !hasSettledItems
  const canPrintReceipt = Boolean(order.receiptNumber && !cancelled && (paid || (order.items ?? []).some((item) => Number(item.paidQuantity) > 0)))

  useEffect(() => {
    const previousFocus = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => { document.body.style.overflow = overflow; previousFocus?.focus?.() }
  }, [])

  function handleKeyDown(event) {
    if (event.key === 'Escape' && !isCancelling) { event.stopPropagation(); onClose() }
    if (event.key !== 'Tab') return
    const controls = [...panelRef.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled)')]
    const first = controls[0], last = controls.at(-1)
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return createPortal(<div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
    <button aria-label="Close order details" className="absolute inset-0 cursor-default" tabIndex={-1} disabled={isCancelling} onClick={onClose} />
    <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown} className="relative flex h-full w-full max-w-[640px] flex-col bg-white shadow-2xl">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
        <div className="min-w-0"><h2 id={titleId} className="break-words text-xl font-bold tracking-tight text-slate-900">{orderNumber(order)}</h2><div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{orderPaymentLabel(order)}</span><span className="text-slate-500">{orderTypeLabel(order.orderType)} · Table {orderTable(order)}</span></div></div>
        <button ref={closeRef} aria-label="Close dialog" disabled={isCancelling} onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl text-slate-600 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" type="button">×</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
          <Detail label="Ordered">{orderDate(order.createdAt)}</Detail><Detail label="Paid">{orderDate(order.paidAt)}</Detail>
          <Detail label="Payment">{order.paymentMethod}</Detail><Detail label="Customer">{order.customerNickname || 'Guest'}</Detail>
          <Detail label="Store">{name}</Detail><Detail label="Status"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${orderStatusStyle(status)}`}>{orderStatusLabel(status)}</span></Detail>
          {order.receiptNumber && <Detail label="Latest receipt">{order.receiptNumber}</Detail>}
        </dl>
        <section className="mt-8"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Order progress</h3>
          {cancelled ? <div className="mt-4 border-l-2 border-slate-200 pl-4"><p className="text-sm font-semibold text-slate-900">Order cancelled</p><p className="mt-1 text-xs text-slate-500">{orderDate(order.updatedAt)}</p></div> : <ol className="mt-4">{steps.map((step, index) => {
            const complete = index <= statusIndex
            const current = index === statusIndex
            return <li className="relative ml-1.5 border-l border-slate-200 pb-5 pl-5 last:border-transparent last:pb-0" key={step}><span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${complete ? 'bg-orange-500' : 'bg-slate-200'}`} /><p className={`text-sm font-semibold ${complete ? 'text-slate-900' : 'text-slate-400'}`}>{orderStatusLabel(step)}</p><p className="mt-1 text-xs text-slate-500">{step === 'received' ? orderDate(order.createdAt) : current ? `Current status · updated ${orderDate(order.updatedAt)}` : complete ? 'Completed' : 'Pending'}</p></li>
          })}</ol>}
        </section>
        <section className="mt-8"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Items</h3><div className="mt-2 divide-y divide-dashed divide-slate-200">{(order.items ?? []).map((item, index) => <div className="flex items-start justify-between gap-4 py-4" key={item.id ?? `${item.menuItemId}-${index}`}><div className="min-w-0"><p className="text-sm font-medium text-slate-900">{item.quantity}× {item.name}</p><OptionSummary item={item} />{item.notes && <p className="mt-1 text-xs text-slate-500">Note: {item.notes}</p>}{(Number(item.paidQuantity) > 0 || Number(item.fulfilledQuantity) > 0) && <p className="mt-2 text-xs text-slate-500">Paid: {Number(item.paidQuantity ?? 0)}/{item.quantity} · {item.orderType === 'take_away' ? 'Collected' : 'Served'}: {Number(item.fulfilledQuantity ?? 0)}/{item.quantity}</p>}</div><span className="shrink-0 text-sm font-medium text-slate-900">{formatCurrency(Number(item.price) * Number(item.quantity))}</span></div>)}</div></section>
        <section className="mt-6 border-t border-dashed border-slate-200 pt-5"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Bill</h3><dl className="mt-4 space-y-3 text-sm text-slate-600">
          <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd>{formatCurrency(order.subtotal)}</dd></div>
          {Number(order.discountAmount) > 0 && <div className="flex justify-between gap-4"><dt>Discount</dt><dd>− {formatCurrency(order.discountAmount)}</dd></div>}
          <div className="flex justify-between gap-4"><dt>Service charge</dt><dd>{formatCurrency(order.serviceCharge)}</dd></div><div className="flex justify-between gap-4"><dt>SST</dt><dd>{formatCurrency(order.sst)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-4 text-lg font-bold text-slate-900"><dt>Total</dt><dd>{formatCurrency(order.grandTotal)}</dd></div>
          {orderPaymentLabel(order) === 'Partly paid' && <><div className="flex justify-between gap-4"><dt>Paid amount</dt><dd>{formatCurrency(order.paidAmount)}</dd></div><div className="flex justify-between gap-4 font-semibold text-orange-700"><dt>Remaining</dt><dd>{formatCurrency(Math.max(0, Number(order.grandTotal) - Number(order.paidAmount ?? 0)))}</dd></div></>}
        </dl></section>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7"><div>{canCancel && <Button disabled={isCancelling} onClick={() => onCancelOrder(order)} variant="danger">{isCancelling ? 'Cancelling...' : 'Cancel order'}</Button>}</div><div className="ml-auto flex gap-2"><Button disabled={isCancelling} onClick={onClose} variant="outline">Close</Button>{canPrintReceipt && <Button disabled={isCancelling} onClick={() => navigate(`/cashier/receipt/${encodeURIComponent(order.receiptNumber)}?print=1`, { state: { returnTo: '/admin/orders' } })}>{paid ? 'Print receipt' : 'Print latest receipt'}</Button>}</div></footer>
    </section>
  </div>, document.body)
}

export default OrderDetailsModal
