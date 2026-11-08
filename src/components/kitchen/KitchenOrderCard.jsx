import { orderLocationLabel } from '../../utils/orderLocation'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import useShopSettings from '../../hooks/useShopSettings'
import OrderTypeBadge from '../common/OrderTypeBadge'
import Button from '../common/Button'
import OptionSummary from '../common/OptionSummary'
import { formatCurrency } from '../../utils/currency'

const statusDetails = {
  received: { label: 'Received', actionLabel: 'Start preparing', nextStatus: 'preparing', variant: 'primary', tone: 'bg-blue-50 text-blue-800' },
  preparing: { label: 'Preparing', actionLabel: 'Mark ready', nextStatus: 'ready', variant: 'primary', tone: 'bg-amber-50 text-amber-800' },
  ready: { label: 'Kitchen ready', actionLabel: 'Waiting for staff handoff', nextStatus: null, variant: 'secondary', tone: 'bg-emerald-50 text-emerald-800' },
}

export default function KitchenOrderCard({ order, isNewOrder, isUpdating, now, onUpdateStatus }) {
  const { t: uiText, locale } = useCustomerLanguage()
  const { config } = useShopSettings()
  const normalizedStatus = String(order.status ?? '').toLowerCase()
  const currentStatus = statusDetails[normalizedStatus] ?? statusDetails.received
  const actionLabel = normalizedStatus === 'ready' && config.requireHandoffConfirmation === false ? 'Ready — handoff not tracked' : currentStatus.actionLabel
  const orderNumber = order.orderNumber ?? `#${String(order.id ?? '').slice(-6).toUpperCase() || '—'}`

  const createdDate = order.createdAt?.toDate?.() ?? new Date(order.createdAt)
  const validDate = Number.isFinite(createdDate?.getTime())
  const orderTime = validDate ? createdDate.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : '—'
  const waitingMinutes = validDate ? Math.max(0, Math.floor((now - createdDate.getTime()) / 60000)) : 0
  const isNew = Boolean(isNewOrder) && normalizedStatus === 'received'
  const isWaitingLong = waitingMinutes >= 15 && normalizedStatus !== 'ready'

  return <article className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${isNew ? 'border-orange-400 ring-2 ring-orange-100' : isWaitingLong ? 'border-amber-300' : 'border-slate-200'}`}>
    <header className={`border-b px-4 py-4 sm:px-5 ${isNew ? 'border-orange-100 bg-orange-50' : 'border-slate-100'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-2xl font-extrabold tracking-tight text-slate-900">{orderLocationLabel(order, uiText)}</h2>{isNew && <span className="rounded-full bg-orange-600 px-2.5 py-1 text-xs font-bold text-white">{uiText('New')}</span>}</div><p className="mt-1 break-words text-xs font-medium text-slate-500">{orderNumber} · {orderTime} · {order.customerNickname || uiText('Guest')}</p></div>
        <span className={`shrink-0 rounded-lg px-3 py-2 text-sm font-bold ${currentStatus.tone}`}>{order.orderType === 'take_away' && normalizedStatus === 'ready' ? uiText('Ready for collection') : uiText(currentStatus.label)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><OrderTypeBadge orderType={order.orderType} />{isWaitingLong && <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{uiText('Waiting')} {waitingMinutes}m</span>}</div>
    </header>
    <div className="space-y-3 px-4 py-4 sm:px-5">
      {(order.orderType === 'take_away' || order.orderType === 'mixed') && <p className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm font-bold text-violet-900">{uiText(order.orderType === 'mixed' ? 'MIXED ORDER · Only pack items marked Take away; serve Dine in items at the table' : 'TAKE AWAY · Pack every item in this order')}</p>}
      {order.isAddition && <p className="rounded-lg bg-orange-50 p-3 text-sm font-bold text-orange-800">{uiText('Additional order · prepare these items only')}</p>}
      {order.revisionNote && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">{uiText('⚠ Order changed:')} {order.revisionNote}</p>}
      {Array.isArray(order.items) && order.items.length > 0 ? <div className="divide-y divide-slate-100">{order.items.map((item, index) => {
        const note = typeof item?.notes === 'string' ? item.notes.trim() : ''
        const quantity = Number.isInteger(Number(item?.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1
        return <div className="flex items-start gap-3 py-3 first:pt-1 last:pb-1" key={item?.id ?? `${item?.menuItemId ?? item?.name ?? 'item'}-${index}`}>
          <span className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 px-2 text-lg font-extrabold text-white">{quantity}×</span>
          <div className="min-w-0"><p className="break-words text-lg font-bold leading-snug text-slate-900">{String(item?.kitchenName || item?.name || '').trim() || uiText('Menu item')}</p><OptionSummary item={item} className="text-sm font-semibold" />{note && <p className="mt-2 break-words rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-950">{uiText('⚠ Customer note:')} {note}</p>}</div>
        </div>
      })}</div> : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{uiText('Order item details are unavailable.')}</p>}
      <p className="border-t border-slate-100 pt-3 text-right text-xs font-medium text-slate-500">{uiText('Total amount')} · {formatCurrency(order.grandTotal)}</p>
    </div>
    <footer className="border-t border-slate-100 bg-slate-50 p-4"><Button className="min-h-12 w-full" disabled={isUpdating || !currentStatus.nextStatus} onClick={() => onUpdateStatus(order.id, currentStatus.nextStatus, normalizedStatus, order.version)} variant={currentStatus.variant}>{isUpdating ? uiText('Updating order...') : uiText(actionLabel)}</Button></footer>
  </article>
}
