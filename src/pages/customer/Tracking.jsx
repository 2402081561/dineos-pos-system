import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import OrderTrackingSkeleton from '../../components/customer/OrderTrackingSkeleton'
import CustomerOrderDetailsModal from '../../components/customer/CustomerOrderDetailsModal'
import useCustomerSession from '../../hooks/useCustomerSession'
import useLatestOrder from '../../hooks/useLatestOrder'
import { formatCurrency } from '../../utils/currency'
import { estimatePreparationTime } from '../../utils/preparationEstimate'
import { customerOrderLabel as getOrderNumber } from '../../utils/customerOrder'

const statuses = [{ key: 'received', title: 'Received', text: 'Your order has reached the kitchen.', icon: '✓' }, { key: 'preparing', title: 'Preparing', text: 'Your food is being prepared.', icon: '⌁' }, { key: 'ready', title: 'Ready', text: 'Your dishes are almost at your table.', icon: '★' }, { key: 'served', title: 'Served', text: 'Enjoy your meal!', icon: '✓' }]

function itemQuantity(items) {
  return Math.max(1, (items ?? []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0))
}

function getPreparationEstimate(status, order, t) {
  const totalQuantity = itemQuantity(order.items)

  if (status === 'ready') return { detail: 'Your dishes are ready.', time: 'Ready', totalQuantity }
  if (status === 'served') return { detail: 'Your order has been completed.', time: 'Completed', totalQuantity }

  const estimate = estimatePreparationTime(totalQuantity, status)
  const detail = t(status === 'preparing'
    ? 'Preparing {{count}} items. Kitchen demand may affect the time.'
    : 'Estimate based on {{count}} items. Kitchen demand may affect the time.', { count: totalQuantity })
  return { detail, time: estimate.label, totalQuantity }
}

function Tracking() {
  const { t, statusLabel } = useCustomerLanguage()
  const { order, orders, isLoading, error } = useLatestOrder()
  const { clearSession } = useCustomerSession()
  const [selectedOrder, setSelectedOrder] = useState(null)
  useEffect(() => { if (String(order?.status).toLowerCase() === 'served' && String(order?.paymentStatus).toLowerCase() === 'paid') clearSession() }, [clearSession, order?.paymentStatus, order?.status])

  if (isLoading) return <div className="mx-auto max-w-2xl"><OrderTrackingSkeleton /></div>
  if (error) return <div className="mx-auto max-w-2xl"><StatePanel description={t(error)} title={t("Order tracking unavailable")} tone="error" /></div>
  if (!order) return <div className="mx-auto max-w-2xl space-y-5"><StatePanel description={t("Place an order from the menu to begin tracking it here.")} title={t("No active order.")} /><div className="text-center"><Link to="/menu"><Button>{t("Back to Menu")}</Button></Link></div></div>

  const currentStatus = String(order.status).toLowerCase()
  const statusIndex = Math.max(0, statuses.findIndex((step) => step.key === currentStatus))
  const progress = ((statusIndex + 1) / statuses.length) * 100
  const orderNumber = t(getOrderNumber(order))
  const tableNumber = order.tableNumber ?? order.tableId ?? '—'
  const isPaid = String(order.paymentStatus ?? 'pending').toLowerCase() === 'paid'
  const isAwaitingPayment = currentStatus === 'served' && !isPaid
  const isCompleted = currentStatus === 'served' && isPaid
  const isReady = currentStatus === 'ready'
  const olderOrders = orders.slice(1)
  const preparationEstimate = getPreparationEstimate(currentStatus, order, t)

  return <div className="mx-auto max-w-2xl space-y-7"><SectionHeading description={isCompleted ? t("Thank you for dining with us.") : isAwaitingPayment ? t("Your order has been served. Please settle the bill with the cashier.") : t("We will keep this page updated as your order moves through the kitchen.")} eyebrow={t('{{order}} · Table {{number}}', { order: orderNumber, number: tableNumber })} title={isCompleted ? t("Payment Completed") : isAwaitingPayment ? t("Awaiting Payment") : t('Order {{status}}', { status: statusLabel(statuses[statusIndex].key) })} />{isReady && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-900 shadow-sm"><p className="font-bold">{t("Your order is ready")}</p><p className="mt-1 text-sm text-emerald-800">{t("Our team will bring it to your table shortly.")}</p></div>}{isAwaitingPayment && <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-amber-900 shadow-sm"><p className="font-bold">{t("Awaiting Payment")}</p><p className="mt-1 text-sm text-amber-800">{t("Your food has been served. A cashier can now complete the payment.")}</p></div>}<section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_14px_38px_rgb(15,23,42,0.07)]"><div className="bg-gradient-to-br from-orange-50 via-white to-white p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-orange-700">{t("Estimated waiting time")}</p><p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{t(preparationEstimate.time)}</p><p className="mt-1 text-xs font-medium text-slate-500">{t(preparationEstimate.detail)}</p></div><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600 text-xl text-white shadow-lg shadow-orange-600/20">◷</span></div><div className="mt-5 h-2.5 overflow-hidden rounded-full bg-orange-100"><div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all duration-700 ease-out" style={{ width: `${progress}%` }} /></div></div><ol className="p-5 sm:p-6">{statuses.map((step, index) => { const isCurrent = index === statusIndex; const isComplete = index <= statusIndex; return <li className="relative flex gap-4 pb-9 last:pb-0" key={step.key}>{index < statuses.length - 1 && <span className={`absolute left-[18px] top-10 h-[calc(100%-12px)] w-0.5 transition-colors duration-500 ${index < statusIndex ? 'bg-orange-300' : 'bg-slate-200'}`} />}<span className={`z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${isCurrent ? 'bg-orange-600 text-white ring-4 ring-orange-100' : isComplete ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400'}`}>{isComplete ? step.icon : index + 1}</span><div className="pt-1"><h2 className={`font-bold ${isComplete ? 'text-slate-900' : 'text-slate-400'}`}>{t(step.title)}{isCurrent && <span className="ml-2 text-xs font-semibold text-orange-600">{t("Current")}</span>}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{t(step.text)}</p></div></li> })}</ol></section>{isCompleted && <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-7 text-center shadow-sm"><p className="text-4xl">🎉</p><h2 className="mt-3 text-2xl font-bold text-emerald-900">{t("Payment Completed")}</h2><p className="mt-2 text-sm text-emerald-800">{t("Thank you for dining with us.")}</p><Link className="mt-5 inline-flex" to="/menu"><Button>{t("Back to Menu")}</Button></Link></section>}<section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm"><div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5"><h2 className="font-bold">{t("Latest order")}</h2><div className="flex items-center gap-3"><span className="text-sm font-bold text-slate-400">{t('{{count}} items', { count: preparationEstimate.totalQuantity })}</span><Button className="px-3 py-2" onClick={() => setSelectedOrder(order)} variant="outline">{t("View Order Details")}</Button></div></div><div className="divide-y divide-slate-100">{Array.isArray(order.items) ? order.items.map((item, index) => <div className="flex items-center justify-between gap-4 p-4 sm:p-5" key={`${item?.menuItemId ?? 'item'}-${index}`}><div className="flex min-w-0 items-center gap-3">{item?.imageUrl ? <img alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" onError={(event) => { event.currentTarget.style.display = 'none' }} src={item.imageUrl} /> : <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-xl">🍽️</span>}<div><p className="text-sm font-semibold text-slate-800">{item?.quantity ?? '—'}× {item?.name ?? t("Item unavailable")}</p>{typeof item?.notes === 'string' && item.notes.trim() && <p className="mt-1 text-xs text-slate-500">{item.notes}</p>}</div></div><span className="whitespace-nowrap text-sm font-bold text-slate-700">{formatCurrency(Number(item?.price) * Number(item?.quantity))}</span></div>) : <p className="p-5 text-sm text-slate-500">{t("No item details are available for this order.")}</p>}</div><div className="flex items-center justify-between bg-slate-50 p-5"><span className="font-bold">{t("Total amount")}</span><span className="text-xl font-extrabold text-orange-600">{formatCurrency(order.grandTotal)}</span></div></section>{olderOrders.length > 0 && <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm"><div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5"><div><h2 className="font-bold">{t("Recent orders")}</h2><p className="mt-1 text-sm text-slate-500">{t("Orders placed in this session.")}</p></div><Link to="/orders"><Button className="px-3 py-2" variant="outline">{t("View All Orders")}</Button></Link></div><div className="divide-y divide-slate-100">{olderOrders.map((previousOrder) => <div className="flex items-center justify-between gap-4 p-4" key={previousOrder.id}><div><p className="font-semibold text-slate-800">{t(getOrderNumber(previousOrder))}</p><p className="mt-1 text-xs text-slate-500">{statusLabel(previousOrder.status)} · {t('{{count}} items', { count: Array.isArray(previousOrder.items) ? previousOrder.items.length : 0 })}</p></div><div className="flex items-center gap-3"><span className="font-bold text-orange-600">{formatCurrency(previousOrder.grandTotal)}</span><Button className="px-3 py-2" onClick={() => setSelectedOrder(previousOrder)} variant="outline">{t("View Order Details")}</Button></div></div>)}</div></section>}<CustomerOrderDetailsModal onClose={() => setSelectedOrder(null)} order={selectedOrder} /></div>
}

export default Tracking
