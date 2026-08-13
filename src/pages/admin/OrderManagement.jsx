import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/common/Button'
import ConfirmationDialog from '../../components/common/ConfirmationDialog'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import OrderDetailsModal from '../../components/admin/OrderDetailsModal'
import useToast from '../../hooks/useToast'
import { cancelOrder, subscribeToAdminOrders } from '../../services/adminOrderService'
import { formatCurrency } from '../../utils/currency'

function getOrderNumber(order) {
  return order.orderNumber ?? `#${order.id.slice(-6).toUpperCase()}`
}

function getTableNumber(order) {
  return order.tableNumber ?? order.tableId?.replace('temporary-table-', '') ?? '—'
}

function formatStatus(status) {
  return String(status ?? 'received').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDateTime(value) {
  const date = value?.toDate?.() ?? new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function OrderManagement() {
  const { showToast } = useToast()
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [cancellingOrder, setCancellingOrder] = useState(null)
  const [isCancelling, setIsCancelling] = useState(false)

  useEffect(() => subscribeToAdminOrders(
    (orderData) => {
      setOrders(orderData)
      setIsLoading(false)
    },
    (firebaseError) => {
      console.error('[Order Management] Failed to load orders:', firebaseError)
      setError('We could not load orders right now. Please try again shortly.')
      setIsLoading(false)
    },
  ), [])

  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return orders.filter((order) => {
      const matchesStatus = statusFilter === 'all' || String(order.status).toLowerCase() === statusFilter
      const searchableValue = `${getOrderNumber(order)} ${order.customerNickname ?? ''} ${getTableNumber(order)}`.toLowerCase()
      return matchesStatus && searchableValue.includes(normalizedSearch)
    })
  }, [orders, searchTerm, statusFilter])

  async function handleCancelOrder() {
    try {
      setIsCancelling(true)
      setActionError('')
      await cancelOrder(cancellingOrder.id)
      showToast('Order cancelled.')
      setCancellingOrder(null)
      setSelectedOrder(null)
    } catch (firebaseError) {
      console.error('[Order Management] Failed to cancel order:', firebaseError)
      setActionError('We could not cancel this order. Please try again.')
      setCancellingOrder(null)
    } finally {
      setIsCancelling(false)
    }
  }

  if (isLoading) return <div className="space-y-6 animate-pulse"><div className="h-20 rounded-2xl bg-slate-200" /><div className="surface-card h-96 bg-white" /></div>
  if (error) return <StatePanel description={error} title="Order management unavailable" tone="error" />

  return <div className="space-y-6"><SectionHeading description="Review live orders and their progress across your restaurant." eyebrow="Administration" title="Manage orders" />{actionError && <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">{actionError}</p>}<section className="surface-card overflow-hidden"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-xs"><span className="absolute left-3 top-2.5 text-slate-400">⌕</span><input className="w-full rounded-xl bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-orange-400" onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search order, customer or table" value={searchTerm} /></div><select className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 outline-none focus:border-orange-400" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}><option value="all">All statuses</option><option value="received">Received</option><option value="preparing">Preparing</option><option value="ready">Ready</option><option value="served">Served</option></select></div>{filteredOrders.length === 0 ? <div className="p-8"><StatePanel description={orders.length === 0 ? 'New customer orders will appear here automatically.' : 'Try another order, customer, table or status.'} title={orders.length === 0 ? 'No orders yet.' : 'No matching orders.'} /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3 font-bold">Order</th><th className="px-5 py-3 font-bold">Table</th><th className="px-5 py-3 font-bold">Customer</th><th className="px-5 py-3 font-bold">Total amount</th><th className="px-5 py-3 font-bold">Status</th><th className="px-5 py-3 font-bold">Created time</th><th className="px-5 py-3 text-right font-bold">Details</th></tr></thead><tbody>{filteredOrders.map((order) => <tr className="border-b last:border-0" key={order.id}><td className="px-5 py-4 font-semibold text-slate-900">{getOrderNumber(order)}</td><td className="px-5 py-4 text-slate-600">Table {getTableNumber(order)}</td><td className="px-5 py-4 text-slate-600">{order.customerNickname || 'Guest'}</td><td className="px-5 py-4 font-semibold text-orange-600">{formatCurrency(order.grandTotal)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${order.status === 'served' ? 'bg-emerald-50 text-emerald-700' : order.status === 'cancelled' ? 'bg-red-50 text-red-700' : order.status === 'ready' ? 'bg-blue-50 text-blue-700' : order.status === 'preparing' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{formatStatus(order.status)}</span></td><td className="px-5 py-4 text-slate-500">{formatDateTime(order.createdAt)}</td><td className="px-5 py-4 text-right"><Button className="px-3 py-1.5 text-xs" onClick={() => setSelectedOrder(order)} variant="outline">View</Button></td></tr>)}</tbody></table></div>}</section>{selectedOrder && <OrderDetailsModal isCancelling={isCancelling} onCancelOrder={(order) => setCancellingOrder(order)} onClose={() => { if (!isCancelling) setSelectedOrder(null) }} order={selectedOrder} />}{cancellingOrder && <ConfirmationDialog confirmLabel="Cancel order" description={`Cancel ${getOrderNumber(cancellingOrder)}? This action cannot be undone.`} isLoading={isCancelling} onCancel={() => { if (!isCancelling) setCancellingOrder(null) }} onConfirm={handleCancelOrder} title="Cancel order" />}</div>
}

export default OrderManagement
