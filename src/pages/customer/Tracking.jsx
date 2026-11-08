import OrderTypeBadge from '../../components/common/OrderTypeBadge'
import OrderSettlementSummary from '../../components/customer/OrderSettlementSummary'
import CustomerOrderTotals from '../../components/customer/CustomerOrderTotals'
import OptionSummary from '../../components/common/OptionSummary'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import OrderTrackingSkeleton from '../../components/customer/OrderTrackingSkeleton'
import CustomerOrderDetailsModal from '../../components/customer/CustomerOrderDetailsModal'
import useLatestOrder from '../../hooks/useLatestOrder'
import { formatCurrency } from '../../utils/currency'
import { customerOrderLabel as getOrderNumber } from '../../utils/customerOrder'
import useShopSettings from '../../hooks/useShopSettings'

const statuses = [{ key: 'received', title: 'Received', text: 'Your order has reached the kitchen.', icon: '✓' }, { key: 'preparing', title: 'Preparing', text: 'Your food is being prepared.', icon: '⌁' }, { key: 'ready', title: 'Ready', text: 'Your dishes are almost at your table.', icon: '★' }, { key: 'served', title: 'Served', text: 'Enjoy your meal!', icon: '✓' }]

function itemQuantity(items) {
  return Math.max(1, (items ?? []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0))
}

function getPreparationEstimate(status, order, t) {
  const totalQuantity = itemQuantity(order.items)

  if (status === 'ready') return { detail: 'Your dishes are ready.', time: 'Ready', totalQuantity }
  if (status === 'served') return { detail: 'Your order has been completed.', time: 'Completed', totalQuantity }
  if (status === 'preparing') return { detail: 'Your food is being prepared.', time: 'Preparing', totalQuantity }
  const estimate = order.preparationEstimate
  const detail = t(estimate ? 'Includes the current kitchen queue. Estimated only; actual time may vary.' : 'Waiting for the kitchen. Please ask our staff for an update.')
  return { detail, time: estimate?.label ?? 'Estimate unavailable', totalQuantity }
}

function Tracking() {
  const { t, statusLabel, formatDate } = useCustomerLanguage()
  const { config } = useShopSettings()
  const { order, orders, isLoading, error } = useLatestOrder()
  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const selectedOrder = orders.find((entry) => entry.id === selectedOrderId) ?? null

  if (isLoading) return <div className="mx-auto max-w-2xl"><OrderTrackingSkeleton /></div>
  if (error) return <div className="mx-auto max-w-2xl"><StatePanel description={t(error)} title={t("Order tracking unavailable")} tone="error" /></div>
  if (!order) return <div className="mx-auto max-w-2xl space-y-5"><StatePanel description={t("Place an order from the menu to begin tracking it here.")} title={t("No active order.")} /><div className="text-center"><Link to="/menu"><Button>{t("Back to Menu")}</Button></Link></div></div>

  if (order.status === 'cancelled') return <div className="mx-auto max-w-2xl space-y-5">
    <SectionHeading eyebrow={t(getOrderNumber(order))} title={t('Order cancelled')} description={t('This order will not be prepared or charged.')} />
    <StatePanel title={t('Order cancelled')} description={t('You can place a new order from the menu.')} />
    <div className="flex flex-wrap gap-3"><Link to="/menu"><Button>{t('Back to Menu')}</Button></Link><Link to="/orders"><Button variant="outline">{t('View All Orders')}</Button></Link></div>
  </div>

  const isMixed = order.orderType === 'mixed'
  const isTakeAway = order.orderType === 'take_away'
  const progressStatuses = config.requireHandoffConfirmation === false && order.status !== 'served' ? statuses.filter((step) => step.key !== 'served') : statuses
  const displayStatuses = progressStatuses.map((step) => !isTakeAway ? isMixed && step.key === 'ready' ? { ...step, text: 'Dine-in items will be served at your table. Collect take-away items at the counter.' } : isMixed && step.key === 'served' ? { ...step, text: 'Dine-in items have been served and take-away items collected.' } : step : step.key === 'preparing'
    ? { ...step, text: 'Your food is being prepared and packed.' }
    : step.key === 'ready' ? { ...step, title: 'Ready for collection', text: 'Please collect your take-away order from the counter.' }
    : step.key === 'served' ? { ...step, title: 'Collected', text: 'Your take-away order has been collected.' } : step)
  const currentStatus = String(order.status).toLowerCase()
  const statusIndex = Math.max(0, statuses.findIndex((step) => step.key === currentStatus))
  const progress = ((statusIndex + 1) / progressStatuses.length) * 100
  const orderNumber = t(getOrderNumber(order))
  const tableNumber = order.tableNumber ?? order.tableId ?? '—'
  const isPaid = String(order.paymentStatus ?? 'pending').toLowerCase() === 'paid'
  const isAwaitingPayment = currentStatus === 'served' && !isPaid
  const isCompleted = currentStatus === 'served' && isPaid
  const isReady = currentStatus === 'ready'
  const olderOrders = orders.slice(1)
  const preparationEstimate = getPreparationEstimate(currentStatus, order, t)
  if (isTakeAway && currentStatus === 'ready') { preparationEstimate.time = 'Ready for collection'; preparationEstimate.detail = 'Please collect your take-away order from the counter.' }
  if (isTakeAway && currentStatus === 'served') preparationEstimate.detail = 'Your take-away order has been collected.'

  const paidAmount = Number(order.paidAmount ?? (isPaid ? order.grandTotal : 0))
  const paymentLabel = isPaid ? 'Paid' : paidAmount > 0 ? 'Partially paid' : 'Unpaid'
  const title = isCompleted ? t('Payment Completed') : isAwaitingPayment ? t('Awaiting Payment') : currentStatus === 'received' ? t('Order received') : t('Order {{status}}', { status: isTakeAway ? t(displayStatuses[statusIndex].title) : statusLabel(statuses[statusIndex].key) })

  return <div className="customer-tracking-page mx-auto max-w-2xl space-y-5">
    <section className="rounded-2xl border border-slate-200/70 bg-white p-5 text-center sm:p-6">
      <span aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-2xl font-bold text-orange-600">{isCompleted || currentStatus === 'received' ? '✓' : isReady ? '✓' : '◷'}</span>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
      {order.pickupCode && <div className="mt-5 rounded-2xl bg-orange-50 p-4"><p className="text-xs font-bold text-orange-700">{t('Your pickup number')}</p><p className="mt-2 text-5xl font-extrabold tracking-wide text-orange-800">{order.pickupCode}</p><p className="mt-2 text-sm font-semibold">{order.pickupReference}</p><p className="mt-2 text-xs text-slate-500">{t('Show this pickup number at the counter. Numbers restart each Malaysia business day.')}</p></div>}
      <p className="mt-2 text-sm leading-6 text-slate-500">{t(isCompleted ? 'Thank you for your order.' : isAwaitingPayment ? isTakeAway ? 'Your take-away order has been collected. Please settle the bill with the cashier.' : 'Your order has been served. Please settle the bill with the cashier.' : 'We will keep this page updated as your order moves through the kitchen.')}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2"><OrderTypeBadge orderType={order.orderType} /><span className={`rounded-lg px-3 py-1 text-xs font-bold ${isPaid ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{t(paymentLabel)}</span></div>
      {!isPaid && <p className="mt-3 text-xs font-medium leading-5 text-slate-500">{t('Order received does not mean paid. Please pay at the counter.')}</p>}
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5"><h2 className="font-bold text-slate-900">{orderNumber}</h2><span className="rounded-lg bg-orange-50 px-3 py-1 text-sm font-bold text-orange-800">{order.pickupCode?t('Take-away ordering'):t('Table {{number}}', { number: tableNumber })}</span></div>
      <dl className="grid grid-cols-2 gap-4 p-4 text-sm sm:p-5">
        <div className="min-w-0"><dt className="text-xs text-slate-500">{t('Order date')}</dt><dd className="mt-1 break-words font-semibold text-slate-800">{formatDate(order.createdAt)}</dd></div>
        <div><dt className="text-xs text-slate-500">{t('Payment')}</dt><dd className={`mt-1 font-bold ${isPaid ? 'text-emerald-700' : 'text-amber-800'}`}>{t(paymentLabel)}</dd></div>
        <div><dt className="text-xs text-slate-500">{t('Paid amount')}</dt><dd className="mt-1 font-semibold tabular-nums">{formatCurrency(paidAmount)}</dd></div>
        <div><dt className="text-xs text-slate-500">{t('Remaining amount')}</dt><dd className="mt-1 font-semibold tabular-nums">{formatCurrency(Math.max(0, Number(order.grandTotal) - paidAmount))}</dd></div>
      </dl>
    </section>

    <section aria-label={t('Order progress')} className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-bold text-slate-900">{t(isReady ? 'Your order is ready' : 'Order progress')}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{t(isReady ? isMixed ? 'Dine-in items will be served at your table. Collect take-away items at the counter.' : isTakeAway ? 'Please collect your take-away order from the counter.' : 'Our team will bring it to your table shortly.' : displayStatuses[statusIndex].text)}</p></div><span className="shrink-0 rounded-lg bg-orange-50 px-2 py-1 text-xs font-bold text-orange-800">{t(preparationEstimate.time)}</span></div>
      <div aria-hidden="true" className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-500 transition-all duration-700" style={{ width: `${progress}%` }} /></div>
      <ol className={`mt-3 grid gap-2 ${displayStatuses.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>{displayStatuses.map((step, index) => <li aria-current={index === statusIndex ? 'step' : undefined} className={`min-w-0 break-words text-center text-[11px] font-semibold leading-5 ${index <= statusIndex ? 'text-orange-700' : 'text-slate-400'}`} key={step.key}><span aria-hidden="true" className="mb-1 block">{index <= statusIndex ? '●' : '○'}</span>{t(step.title)}</li>)}</ol>
      {['received', 'preparing'].includes(currentStatus) && <p className="mt-3 text-xs leading-5 text-slate-500">{t(preparationEstimate.detail)}</p>}
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5"><h2 className="font-bold text-slate-900">{t('Your items')}</h2><span className="text-xs text-slate-500">{t('{{count}} items', { count: preparationEstimate.totalQuantity })}</span></div>
      <div className="divide-y divide-slate-100">{Array.isArray(order.items) && order.items.length ? order.items.map((item, index) => <div className="flex items-start justify-between gap-3 p-4 sm:px-5" key={item?.id ?? `${item?.menuItemId ?? 'item'}-${index}`}>
        <div className="min-w-0"><p className="break-words text-sm font-semibold leading-6 text-slate-800"><span className="mr-2 font-bold text-orange-700">{item?.quantity ?? '—'}×</span>{item?.name ?? t('Item unavailable')}</p><OptionSummary item={item} />{typeof item?.notes === 'string' && item.notes.trim() && <p className="mt-1 break-words text-xs leading-5 text-slate-500">{t('Note:')} {item.notes}</p>}</div>
        <span className="shrink-0 pt-1 text-sm font-semibold tabular-nums text-slate-700">{formatCurrency(Number(item?.price) * Number(item?.quantity))}</span>
      </div>) : <p className="p-4 text-sm text-slate-500">{t('No item details are available for this order.')}</p>}</div>
      <CustomerOrderTotals order={order} />
    </section>

    <details className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700">{t('Payment and collection details')}</summary><OrderSettlementSummary order={order} /><Button className="w-full" onClick={() => setSelectedOrderId(order.id)} variant="outline">{t('View Order Details')}</Button></details>
    <div className="grid grid-cols-2 gap-3"><Link className="flex min-h-11 items-center justify-center rounded-xl bg-orange-600 px-3 py-3 text-center text-sm font-bold text-white hover:bg-orange-700" to="/menu">{t('Continue ordering')}</Link><Link className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-sm font-semibold text-slate-700" to="/orders">{t('View All Orders')}</Link></div>

    {olderOrders.length > 0 && <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white"><h2 className="border-b border-slate-100 p-4 font-bold">{t('Recent orders')}</h2><div className="divide-y divide-slate-100">{olderOrders.map((previousOrder) => <button className="flex min-h-11 w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50" key={previousOrder.id} onClick={() => setSelectedOrderId(previousOrder.id)} type="button"><span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{t(getOrderNumber(previousOrder))}</span><span className="mt-1 block text-xs text-slate-500">{statusLabel(previousOrder.status)}</span></span><span className="shrink-0 text-sm font-bold tabular-nums text-orange-600">{formatCurrency(previousOrder.grandTotal)}</span></button>)}</div></section>}
    <CustomerOrderDetailsModal onClose={() => setSelectedOrderId(null)} order={selectedOrder} />
  </div>
}

export default Tracking
