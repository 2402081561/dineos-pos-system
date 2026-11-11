import OrderTypeBadge from '../common/OrderTypeBadge'
import OrderSettlementSummary from './OrderSettlementSummary'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { createPortal } from 'react-dom'
import Button from '../common/Button'
import OptionSummary from '../common/OptionSummary'
import { formatCurrency } from '../../utils/currency'
import { customerOrderLabel } from '../../utils/customerOrder'
import useCustomerDialog from '../../hooks/useCustomerDialog'
import { useImageFallback } from '../../utils/image'

function valueOrDash(value) {
  const normalizedValue = String(value ?? '').trim()
  return normalizedValue || '—'
}

function positiveAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

function textValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function ItemImage({ item }) {
  const imageUrl = textValue(item?.imageUrl)
  if (!imageUrl) return <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-2xl">🍽️</div>
  return <img alt="" width="64" height="64" className="h-16 w-16 shrink-0 rounded-2xl bg-slate-100 object-cover" onError={useImageFallback} src={imageUrl} />
}

function CustomerOrderDetailsModal({ onClose, order }) {
  const { t, formatDate, statusLabel } = useCustomerLanguage()
  const { dialog, close, keyDown, isClosing } = useCustomerDialog(onClose, Boolean(order))
  if (!order) return null

  const items = Array.isArray(order.items) ? order.items : []
  const discount = positiveAmount(order.discountAmount ?? order.discount)
  const orderNumber = t(customerOrderLabel(order))
  const orderNote = textValue(order.orderNotes ?? order.notes ?? order.specialInstructions)

  return createPortal(
    <div className={`customer-dialog-backdrop ${isClosing ? 'is-closing' : ''}`} onKeyDown={keyDown} onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
      <section ref={dialog} aria-labelledby="customer-order-details-title" aria-modal="true" className="customer-dialog-panel w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7" role="dialog">
        <div className="customer-dialog-heading flex items-start justify-between gap-4"><div><p className="eyebrow">{t("Order details")}</p><OrderTypeBadge orderType={order.orderType} className="mb-2" /><h2 tabIndex={-1} className="mt-1 text-xl font-bold text-slate-900 outline-none" id="customer-order-details-title">{orderNumber}</h2></div><Button aria-label={t("Close order details")} className="min-h-11" onClick={close} variant="outline">{t("Close")}</Button></div>
        <dl className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4 text-sm"><div><dt className="text-slate-500">{t("Table")}</dt><dd className="mt-1 font-bold text-slate-800">{valueOrDash(order.tableNumber ?? order.tableId)}</dd></div><div><dt className="text-slate-500">{t("Order date")}</dt><dd className="mt-1 font-bold text-slate-800">{formatDate(order.createdAt)}</dd></div><div><dt className="text-slate-500">{t("Status")}</dt><dd className="mt-1 font-bold capitalize text-slate-800">{statusLabel(valueOrDash(order.status))}</dd></div><div><dt className="text-slate-500">{t("Payment")}</dt><dd className="mt-1 font-bold capitalize text-slate-800">{statusLabel(valueOrDash(order.paymentStatus))}</dd></div><div className="col-span-2"><dt className="text-slate-500">{t("Method")}</dt><dd className="mt-1 font-bold text-slate-800">{t(valueOrDash(order.paymentMethod))}</dd></div></dl>
        <OrderSettlementSummary order={order} />
        {orderNote && <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950"><p className="font-bold">{t("Order note")}</p><p className="mt-1 whitespace-pre-wrap">{orderNote}</p></div>}
        <div className="mt-6"><h3 className="font-bold text-slate-900">{t("Items")}</h3><div className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-100">{items.length ? items.map((item, index) => { const parsedQuantity = Math.floor(Number(item?.quantity)); const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 0; const price = Number(item?.price); const itemNote = textValue(item?.notes); return <div className="flex items-center justify-between gap-4 p-4" key={`${item?.menuItemId ?? 'item'}-${index}`}><div className="flex min-w-0 items-center gap-3"><ItemImage item={item} /><div className="min-w-0"><p className="font-semibold text-slate-800">{quantity || '—'}× {valueOrDash(item?.name)}</p><OptionSummary item={item} />{itemNote && <p className="mt-1 text-xs text-slate-500">{t("Note:")}{' '}{itemNote}</p>}</div></div><p className="shrink-0 font-bold text-slate-700">{formatCurrency((Number.isFinite(price) ? price : 0) * quantity)}</p></div> }) : <p className="p-4 text-sm text-slate-500">{t("No item details are available for this order.")}</p>}</div></div>
        <dl className="mt-6 space-y-2 border-t border-slate-100 pt-5 text-sm"><div className="flex justify-between text-slate-600"><dt>{t("Subtotal")}</dt><dd>{formatCurrency(order.subtotal)}</dd></div>{Number(order.serviceCharge) > 0 && <div className="flex justify-between text-slate-600"><dt>{t("Service charge")}</dt><dd>{formatCurrency(order.serviceCharge)}</dd></div>}{Number(order.sst) > 0 && <div className="flex justify-between text-slate-600"><dt>{t("SST")}</dt><dd>{formatCurrency(order.sst)}</dd></div>}{discount !== null && <div className="flex justify-between text-slate-600"><dt>{t("Discount")}</dt><dd>-{formatCurrency(discount)}</dd></div>}<div className="flex justify-between pt-2 text-base font-bold text-slate-900"><dt>{t("Grand total")}</dt><dd className="text-orange-600">{formatCurrency(order.grandTotal)}</dd></div></dl>
      </section>
    </div>,
    document.body,
  )
}

export default CustomerOrderDetailsModal
