import { Link } from 'react-router-dom'
import OrderIdentifiers from './OrderIdentifiers'
import { hasSavedTableVisitTools } from '../../utils/deploymentFeatures'
import { useEffect, useRef } from 'react'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import useOrderDetails from '../../hooks/useOrderDetails'
import useShopSettings from '../../hooks/useShopSettings'
import OptionSummary from './OptionSummary'
import OrderTypeBadge from './OrderTypeBadge'
import { formatCurrency } from '../../utils/currency'
import { orderNumber, orderPaymentLabel, orderStatusLabel, orderStatusStyle, orderTable } from '../../utils/adminOrderPresentation'

// Kept separate from table operations: a historical ticket must never collect
// money or clear the new visit currently occupying the same table.
export function OrderDetailsPanelContent({ order, returnTo, compact = false }) {
  const { t, formatDate } = useCustomerLanguage()
  const { name } = useShopSettings()
  const paid = order.paymentStatus === 'paid'
  const partial = Number(order.paidAmount) > 0 && !paid
  const canPrint = Boolean(order.receiptNumber && order.latestPaymentAt)
  const fields = [
    ['Ordered', order.createdAt ? formatDate(order.createdAt) : '—'],
    ['Paid', order.paidAt ? formatDate(order.paidAt) : '—'],
    ['Payment method', order.paymentMethod ? t(order.paymentMethod) : '—'],
    ['Cashier', order.cashierName || '—'],
    ['Store', name],
    ['Customer', order.customerNickname || t('Guest')],
  ]
  const amounts = [['Subtotal', order.subtotal], ...(Number(order.discountAmount) > 0 ? [['Discount', -Number(order.discountAmount)]] : []), ...(Number(order.serviceCharge) > 0 ? [['Service charge', order.serviceCharge]] : []), ...(Number(order.sst) > 0 ? [['SST', order.sst]] : [])]
  const metadata = <>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-4">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{t(label)}</dt><dd className="mt-1 break-words text-xs font-semibold text-slate-800">{value}</dd></div>)}</dl>
    <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-xs"><span className="text-slate-500">{t('Last updated')}</span><span>{order.updatedAt ? formatDate(order.updatedAt) : '—'}</span></div>
  </>
  return <>
    <div className="border-b border-slate-100 px-4 pb-4">
      {!compact && <h3 className="break-words text-lg font-bold text-slate-900">{orderNumber(order)}</h3>}
      <div className={`${compact ? '' : 'mt-2'} flex flex-wrap items-center gap-2 text-xs`}>
        <span className={`rounded-md px-2 py-1 font-semibold ${paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{t(orderPaymentLabel(order))}</span>
        <span className={`rounded-md px-2 py-1 font-semibold ${orderStatusStyle(order.status)}`}>{t(orderStatusLabel(order.status))}</span>
        <OrderTypeBadge orderType={order.orderType} /><span className="text-slate-500">{t('Table')} {orderTable(order)}</span>
      </div>
    </div>
    <div className="space-y-5 px-4 py-4">
      {hasSavedTableVisitTools&&<OrderIdentifiers key={order.id} orderId={order.id}/>}
      {!compact && metadata}
      <section><h4 className={compact ? 'sr-only' : 'text-xs font-bold uppercase tracking-wide text-slate-500'}>{t('Items')}</h4>
        <div className="mt-1 divide-y divide-dashed divide-slate-200">{(order.items ?? []).map((item) => <div key={item.id} className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0"><p className="break-words text-sm font-semibold">{item.quantity}× {item.name}</p><OptionSummary item={item} />
            {item.notes && <p className="mt-1 break-words text-xs text-slate-500">{t('Note:')} {item.notes}</p>}
            {(!compact || Number(item.paidQuantity) > 0 || Number(item.fulfilledQuantity) > 0) && <p className="mt-2 text-xs text-slate-500">{t('Paid:')} {Number(item.paidQuantity || 0)}/{item.quantity} · {item.orderType === 'take_away' ? t('Collected') : t('Served')}: {Number(item.fulfilledQuantity || 0)}/{item.quantity}</p>}
          </div><span className="shrink-0 whitespace-nowrap text-sm tabular-nums">{formatCurrency(Number(item.price) * Number(item.quantity))}</span>
        </div>)}</div>{!order.items?.length && <p className="mt-3 text-sm text-slate-500">{t('No items.')}</p>}
      </section>
      <dl className="space-y-2 border-t border-slate-200 pt-4 text-sm">{amounts.map(([label, amount]) => <div key={label} className="flex justify-between gap-3"><dt className="text-slate-500">{t(label)}</dt><dd className="tabular-nums">{formatCurrency(amount)}</dd></div>)}
        <div className="flex justify-between gap-3 border-t border-slate-100 pt-3 text-base font-bold"><dt>{t('Total')}</dt><dd className="tabular-nums">{formatCurrency(order.grandTotal)}</dd></div>
        {partial && <><div className="flex justify-between gap-3"><dt>{t('Amount paid')}</dt><dd>{formatCurrency(order.paidAmount)}</dd></div><div className="flex justify-between gap-3 font-semibold"><dt>{t('Remaining bill')}</dt><dd>{formatCurrency(Math.max(0, Number(order.grandTotal) - Number(order.paidAmount)))}</dd></div></>}
      </dl>
      {compact && <details className="border-t border-slate-100 pt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-500">{t('More details')}</summary><div className="pt-4">{metadata}</div></details>}
    </div>
    {canPrint && <footer className="border-t border-slate-200 px-4 py-4">
      <p className="mb-3 break-words text-xs text-slate-500">{t('Latest paid receipt')}: {order.receiptNumber}{partial && <span className="mt-1 block">{t('This receipt covers only the items already paid for.')}</span>}</p>
      <Link className="block rounded-lg bg-orange-600 px-4 py-3 text-center text-sm font-bold text-white hover:bg-orange-700" to={`/cashier/receipt/${encodeURIComponent(order.receiptNumber)}?print=1`} state={{ returnTo, orderId: order.id }}>{t('Print receipt')}</Link>
    </footer>}
  </>
}

export default function RecentOrderDetailsPanel({ orderId, returnTo, onClose, compact = false }) {
  const { t } = useCustomerLanguage()
  const { order, isLoading, error, refresh } = useOrderDetails(orderId)
  const panelRef = useRef(null)
  const revealedOrder = useRef(null)
  useEffect(() => {
    if (!order || order.id !== orderId || error || isLoading || revealedOrder.current === orderId) return
    revealedOrder.current = orderId
    // Loading can initially leave too little page height to scroll to this
    // section. Reveal once after the ticket arrives, never on background polls.
    if (window.innerWidth < 1280) panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [order, orderId, error, isLoading])
  return <section ref={panelRef} aria-label={t('Order details')} className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto">
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white px-4 py-4"><h2 className={`min-w-0 break-words font-bold ${compact ? 'text-lg' : 'text-sm'}`}>{compact && order && !isLoading && !error ? orderNumber(order) : t('Order details')}</h2><button type="button" onClick={onClose} aria-label={t('Close order details')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-orange-500">×</button></header>
    <div aria-live="polite" aria-busy={isLoading}>
      {isLoading ? <p className="p-5 text-sm text-slate-500">{t('Loading order details…')}</p> : error ? <div className="space-y-3 p-5 text-sm"><p className="font-semibold">{t('Order details unavailable')}</p><p className="break-words text-slate-500">{t(error)}</p><button type="button" onClick={refresh} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold">{t('Try again')}</button></div> : order && <OrderDetailsPanelContent order={order} returnTo={returnTo} compact={compact} />}
    </div>
  </section>
}
