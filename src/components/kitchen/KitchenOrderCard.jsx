import Button from '../common/Button'
import { formatCurrency } from '../../utils/currency'

const statusDetails = {
  received: { label: 'Received', actionLabel: 'Start preparing', nextStatus: 'preparing', variant: 'primary' },
  preparing: { label: 'Preparing', actionLabel: 'Mark ready', nextStatus: 'ready', variant: 'primary' },
  ready: { label: 'Ready', actionLabel: 'Mark served', nextStatus: 'served', variant: 'secondary' },
}

function KitchenOrderCard({ order, isUpdating, now, onUpdateStatus }) {
  const normalizedStatus = String(order.status ?? '').toLowerCase()
  const currentStatus = statusDetails[normalizedStatus] ?? statusDetails.received
  const orderNumber = order.orderNumber ?? `#${order.id.slice(-6).toUpperCase()}`
  const tableNumber = String(order.tableNumber ?? order.tableId ?? '—').replace('temporary-table-', '')
  const createdDate = order.createdAt?.toDate?.()
  const orderTime = createdDate ? createdDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Just now'
  const waitingMinutes = createdDate ? Math.max(0, Math.floor((now - createdDate.getTime()) / 60000)) : 0
  const isNew = normalizedStatus === 'received' && waitingMinutes < 3
  const isWaitingLong = waitingMinutes >= 15 && normalizedStatus !== 'ready'

  return <article className={`overflow-hidden rounded-3xl border bg-white shadow-[0_12px_30px_rgb(15,23,42,0.07)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgb(15,23,42,0.11)] ${isNew ? 'border-orange-300 ring-2 ring-orange-100' : isWaitingLong ? 'border-amber-200' : 'border-slate-100'}`}><div className={`flex items-start justify-between border-b p-5 ${isNew ? 'border-orange-100 bg-orange-50/70' : 'border-slate-100'}`}><div><div className="flex flex-wrap items-center gap-2"><p className="text-xl font-extrabold tracking-tight">Table {tableNumber}</p>{isNew && <span className="animate-pulse rounded-full bg-orange-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">New</span>}{isWaitingLong && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">Waiting {waitingMinutes}m</span>}</div><p className="mt-1 text-xs font-medium text-slate-400">{orderNumber} · {orderTime}</p><p className="mt-2 text-sm font-semibold text-slate-600">{order.customerNickname || 'Guest'}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${normalizedStatus === 'ready' ? 'bg-emerald-50 text-emerald-700' : normalizedStatus === 'preparing' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{currentStatus.label}</span></div><div className="space-y-4 p-5">{Array.isArray(order.items) && order.items.length > 0 ? order.items.map((item, index) => <div className="flex gap-3" key={`${item.menuItemId ?? item.name ?? 'item'}-${index}`}><span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">{Number(item.quantity) || 1}</span><div><p className="text-sm font-semibold text-slate-800">{item.name || 'Menu item'}</p>{item.notes && <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">Note: {String(item.notes)}</p>}</div></div>) : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Order item details are unavailable.</p>}<div className="flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-sm font-semibold text-slate-500">Total amount</span><span className="text-lg font-extrabold text-orange-600">{formatCurrency(order.grandTotal)}</span></div></div><div className="border-t border-slate-100 bg-slate-50/70 p-4"><Button className="w-full" disabled={isUpdating} onClick={() => onUpdateStatus(order.id, currentStatus.nextStatus, normalizedStatus)} variant={currentStatus.variant}>{isUpdating ? 'Updating order...' : currentStatus.actionLabel}</Button></div></article>
}

export default KitchenOrderCard
