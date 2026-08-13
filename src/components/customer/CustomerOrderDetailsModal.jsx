import { createPortal } from 'react-dom'
import Button from '../common/Button'
import { formatCurrency } from '../../utils/currency'

function valueOrDash(value) {
  const normalizedValue = String(value ?? '').trim()
  return normalizedValue || '—'
}

function positiveAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

function formatOrderDate(value) {
  const date = value?.toDate?.() ?? new Date(value)
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Date unavailable'
}

function textValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function ItemImage({ item }) {
  const imageUrl = textValue(item?.imageUrl)
  if (!imageUrl) return <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-2xl">🍽️</div>
  return <img alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" onError={(event) => { event.currentTarget.style.display = 'none' }} src={imageUrl} />
}

function CustomerOrderDetailsModal({ onClose, order }) {
  if (!order) return null

  const items = Array.isArray(order.items) ? order.items : []
  const discount = positiveAmount(order.discountAmount ?? order.discount)
  const orderNumber = order.orderNumber ?? `#${String(order.id ?? '').slice(-6).toUpperCase() || '—'}`
  const orderNote = textValue(order.orderNotes ?? order.notes ?? order.specialInstructions)

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <section aria-labelledby="customer-order-details-title" aria-modal="true" className="mx-auto my-6 w-full max-w-xl animate-[page-enter_180ms_ease-out] rounded-3xl bg-white p-5 shadow-2xl sm:my-10 sm:p-7" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Order details</p><h2 className="mt-1 text-xl font-bold text-slate-900" id="customer-order-details-title">{orderNumber}</h2></div><Button aria-label="Close order details" onClick={onClose} variant="outline">Close</Button></div>
        <dl className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4 text-sm"><div><dt className="text-slate-500">Table</dt><dd className="mt-1 font-bold text-slate-800">{valueOrDash(order.tableNumber ?? order.tableId)}</dd></div><div><dt className="text-slate-500">Order date</dt><dd className="mt-1 font-bold text-slate-800">{formatOrderDate(order.createdAt)}</dd></div><div><dt className="text-slate-500">Status</dt><dd className="mt-1 font-bold capitalize text-slate-800">{valueOrDash(order.status)}</dd></div><div><dt className="text-slate-500">Payment</dt><dd className="mt-1 font-bold capitalize text-slate-800">{valueOrDash(order.paymentStatus)}</dd></div><div className="col-span-2"><dt className="text-slate-500">Method</dt><dd className="mt-1 font-bold text-slate-800">{valueOrDash(order.paymentMethod)}</dd></div></dl>
        {orderNote && <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950"><p className="font-bold">Order note</p><p className="mt-1 whitespace-pre-wrap">{orderNote}</p></div>}
        <div className="mt-6"><h3 className="font-bold text-slate-900">Items</h3><div className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-100">{items.length ? items.map((item, index) => { const parsedQuantity = Math.floor(Number(item?.quantity)); const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 0; const price = Number(item?.price); const itemNote = textValue(item?.notes); return <div className="flex items-center justify-between gap-4 p-4" key={`${item?.menuItemId ?? 'item'}-${index}`}><div className="flex min-w-0 items-center gap-3"><ItemImage item={item} /><div className="min-w-0"><p className="font-semibold text-slate-800">{quantity || '—'}× {valueOrDash(item?.name)}</p>{itemNote && <p className="mt-1 text-xs text-slate-500">Note: {itemNote}</p>}</div></div><p className="shrink-0 font-bold text-slate-700">{formatCurrency((Number.isFinite(price) ? price : 0) * quantity)}</p></div> }) : <p className="p-4 text-sm text-slate-500">No item details are available for this order.</p>}</div></div>
        <dl className="mt-6 space-y-2 border-t border-slate-100 pt-5 text-sm"><div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd>{formatCurrency(order.subtotal)}</dd></div><div className="flex justify-between text-slate-600"><dt>Service charge</dt><dd>{formatCurrency(order.serviceCharge)}</dd></div><div className="flex justify-between text-slate-600"><dt>SST</dt><dd>{formatCurrency(order.sst)}</dd></div>{discount !== null && <div className="flex justify-between text-slate-600"><dt>Discount</dt><dd>-{formatCurrency(discount)}</dd></div>}<div className="flex justify-between pt-2 text-base font-bold text-slate-900"><dt>Grand total</dt><dd className="text-orange-600">{formatCurrency(order.grandTotal)}</dd></div></dl>
      </section>
    </div>,
    document.body,
  )
}

export default CustomerOrderDetailsModal
