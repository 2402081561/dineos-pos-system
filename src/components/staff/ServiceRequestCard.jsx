import Button from '../common/Button'
import { formatCurrency } from '../../utils/currency'

const requestLabels = { callWaiter: 'Call waiter', requestBill: 'Request bill', water: 'Water refill', extraSpoon: 'Extra spoon' }
const requestIcons = { callWaiter: '♧', requestBill: '▣', water: '◒', extraSpoon: '⌁' }

function ServiceRequestCard({ request, isUpdating, onComplete }) {
  request = { ...request, ...request.details }
  const tableNumber = String(request.tableNumber ?? request.tableId ?? '—').replace('temporary-table-', '')
  const requestDate = request.createdAt?.toDate?.() ?? new Date(request.createdAt)
  const requestTime = Number.isNaN(requestDate.getTime()) ? 'Just now' : requestDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const requestType = request.requestType === 'requestBill' && request.billMode
    ? `${request.billMode === 'table' ? 'Table' : 'Split'} bill request`
    : requestLabels[request.requestType] ?? String(request.requestType ?? 'Service request')

  return <article className="interactive-card p-5"><div className="flex items-start justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-lg text-orange-600 shadow-sm">{requestIcons[request.requestType] ?? '♧'}</div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Pending</span></div><div className="mt-5"><p className="font-bold text-slate-900">Table {tableNumber} <span className="text-slate-300">·</span> {request.customerNickname || 'Guest'}</p><p className="mt-2 text-sm font-semibold text-slate-600">{requestType}</p>{request.requestType === 'requestBill' && request.requestedAmount != null && Number.isFinite(Number(request.requestedAmount)) && <p className="mt-1 text-sm font-extrabold text-orange-600">{formatCurrency(request.requestedAmount)}</p>}<p className="mt-2 text-xs font-medium text-slate-400">Received {requestTime}</p></div><Button className="mt-5 w-full" disabled={isUpdating} onClick={() => onComplete(request.id)} variant="outline">{isUpdating ? 'Completing request...' : 'Mark as completed'}</Button></article>
}

export default ServiceRequestCard
