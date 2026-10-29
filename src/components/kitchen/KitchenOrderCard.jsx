import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import OrderTypeBadge from '../common/OrderTypeBadge'
import Button from '../common/Button'
import OptionSummary from '../common/OptionSummary'
import { formatCurrency } from '../../utils/currency'

const statusDetails = {
  received: { label: 'Received', actionLabel: 'Start preparing', nextStatus: 'preparing', variant: 'primary' },
  preparing: { label: 'Preparing', actionLabel: 'Mark ready', nextStatus: 'ready', variant: 'primary' },
  ready: { label: 'Ready', actionLabel: 'Waiting for staff handoff', nextStatus: null, variant: 'secondary' },
}

function itemNote(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function KitchenOrderCard({ order, isNewOrder, isUpdating, now, onUpdateStatus }) {
  const { t: uiText, locale } = useCustomerLanguage()

  const normalizedStatus = String(order.status ?? '').toLowerCase()
  const currentStatus = statusDetails[normalizedStatus] ?? statusDetails.received
  const orderNumber = order.orderNumber ?? `#${String(order.id ?? '').slice(-6).toUpperCase() || '—'}`
  const tableNumber = String(order.tableNumber ?? order.tableId ?? '—').replace('temporary-table-', '')
  const createdDate = order.createdAt?.toDate?.() ?? new Date(order.createdAt)
  const orderTime = createdDate ? createdDate.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : 'Just now'
  const waitingMinutes = createdDate ? Math.max(0, Math.floor((now - createdDate.getTime()) / 60000)) : 0
  const isNew = Boolean(isNewOrder) && normalizedStatus === 'received'
  const isWaitingLong = waitingMinutes >= 15 && normalizedStatus !== 'ready'

  return <article className={`overflow-hidden rounded-3xl border bg-white shadow-[0_12px_30px_rgb(15,23,42,0.07)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgb(15,23,42,0.11)] ${isNew ? 'border-orange-300 ring-2 ring-orange-100' : isWaitingLong ? 'border-amber-200' : 'border-slate-100'}`}><div className={`flex items-start justify-between border-b p-5 ${isNew ? 'border-orange-100 bg-orange-50/70' : 'border-slate-100'}`}><div><div className="flex flex-wrap items-center gap-2"><p className="text-xl font-extrabold tracking-tight">{uiText("Table")}{' '}{tableNumber}</p>{isNew && <span className="animate-pulse rounded-full bg-orange-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white motion-reduce:animate-none">{uiText("New")}</span>}{isWaitingLong && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">{uiText("Waiting")}{' '}{waitingMinutes}m</span>}</div><p className="mt-1 text-xs font-medium text-slate-400">{orderNumber} · {orderTime}</p><p className="mt-2 text-sm font-semibold text-slate-600">{(order.customerNickname || uiText('Guest'))}</p><OrderTypeBadge orderType={order.orderType} className="mt-2" /></div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${normalizedStatus === 'ready' ? 'bg-emerald-50 text-emerald-700' : normalizedStatus === 'preparing' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{order.orderType === 'take_away' && normalizedStatus === 'ready' ? uiText("Ready for collection") : uiText(currentStatus.label)}</span></div><div className="space-y-4 p-5">{(order.orderType === 'take_away' || order.orderType === 'mixed') && <p className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm font-extrabold text-violet-900">{order.orderType === 'mixed' ? uiText("MIXED ORDER · Only pack items marked Take away; serve Dine in items at the table") : uiText("TAKE AWAY · Pack every item in this order")}</p>}{order.isAddition && <p className="rounded-lg bg-orange-50 p-3 text-sm font-bold text-orange-800">{uiText("Additional order · prepare these items only")}</p>}{order.revisionNote && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">{uiText("⚠ Order changed:")}{' '}{order.revisionNote}</p>}{Array.isArray(order.items) && order.items.length > 0 ? order.items.map((item, index) => { const note = itemNote(item?.notes); return <div className="flex gap-3" key={`${item?.menuItemId ?? item?.name ?? 'item'}-${index}`}><span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">{Number.isInteger(Number(item?.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1}</span><div><p className="text-sm font-semibold text-slate-800">{(String(item?.kitchenName || item?.name || '').trim() || uiText('Menu item'))}</p><OptionSummary item={item} className="font-semibold" />{note && <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">{uiText("⚠ Customer note:")}{' '}{note}</p>}</div></div> }) : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">{uiText("Order item details are unavailable.")}</p>}<div className="flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-sm font-semibold text-slate-500">{uiText("Total amount")}</span><span className="text-lg font-extrabold text-orange-600">{formatCurrency(order.grandTotal)}</span></div></div><div className="border-t border-slate-100 bg-slate-50/70 p-4"><Button className="w-full" disabled={isUpdating || !currentStatus.nextStatus} onClick={() => onUpdateStatus(order.id, currentStatus.nextStatus, normalizedStatus, order.version)} variant={currentStatus.variant}>{isUpdating ? uiText("Updating order...") : uiText(currentStatus.actionLabel)}</Button></div></article>
}

export default KitchenOrderCard
