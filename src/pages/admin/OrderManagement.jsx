import { useEffect, useMemo, useState } from 'react'
import ConfirmationDialog from '../../components/common/ConfirmationDialog'
import StatePanel from '../../components/common/StatePanel'
import OrderDetailsModal from '../../components/admin/OrderDetailsModal'
import useToast from '../../hooks/useToast'
import { cancelOrder, subscribeToAdminOrders } from '../../services/adminOrderService'
import { formatCurrency } from '../../utils/currency'
import { orderDate, orderNumber, orderPaymentLabel, orderStatusLabel, orderStatusStyle, orderTable, orderTypeLabel } from '../../utils/adminOrderPresentation'

const filters = [['all', 'All orders'], ['unpaid', 'Not paid'], ['partial', 'Partly paid'], ['paid', 'Paid'], ['cancelled', 'Cancelled']]

function matchesPaymentFilter(order, filter) {
  if (filter === 'all') return true
  if (filter === 'cancelled') return order.status === 'cancelled'
  if (order.status === 'cancelled') return false
  const label = orderPaymentLabel(order)
  return filter === 'paid' ? label === 'Paid' : filter === 'partial' ? label === 'Partly paid' : label === 'Not paid'
}

function OrderManagement() {
  const { showToast } = useToast()
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const [cancellingOrder, setCancellingOrder] = useState(null)
  const [isCancelling, setIsCancelling] = useState(false)

  useEffect(() => subscribeToAdminOrders((rows) => {
    setOrders(rows); setError(''); setIsLoading(false)
  }, (loadError) => {
    console.error('[Order Management] Failed to load orders:', loadError)
    setError('We could not load orders right now. Please try again shortly.'); setIsLoading(false)
  }), [])

  const filteredOrders = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    return orders.filter((order) => {
      const type = order.orderType ?? 'dine_in'
      const searchValue = `${orderNumber(order)} ${order.customerNickname ?? ''} ${orderTable(order)} ${(order.items ?? []).map((item) => item.name).join(' ')}`.toLowerCase()
      return (statusFilter === 'all' || order.status === statusFilter)
        && (typeFilter === 'all' || type === typeFilter || (type === 'mixed' && typeFilter !== 'mixed'))
        && matchesPaymentFilter(order, paymentFilter) && searchValue.includes(search)
    })
  }, [orders, searchTerm, statusFilter, typeFilter, paymentFilter])
  const selectedOrder = orders.find((order) => order.id === selectedOrderId)

  async function handleCancelOrder() {
    try {
      const reason = window.prompt('Reason for cancelling this order (required):')?.trim()
      if (!reason) return
      setIsCancelling(true); setActionError('')
      await cancelOrder(cancellingOrder.id, reason, cancellingOrder.version)
      showToast('Order cancelled.'); setCancellingOrder(null); setSelectedOrderId(null)
    } catch (cancelError) {
      console.error('[Order Management] Failed to cancel order:', cancelError)
      setActionError(cancelError.message || 'We could not cancel this order. Please try again.'); setCancellingOrder(null)
    } finally { setIsCancelling(false) }
  }

  if (isLoading) return <div className="space-y-4 animate-pulse"><div className="h-12 rounded-xl bg-slate-200" /><div className="h-96 rounded-xl bg-white" /></div>
  if (error && !orders.length) return <StatePanel description={error} title="Orders unavailable" tone="error" />

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h1><p className="mt-1 text-sm text-slate-500">View orders, payment and kitchen progress.</p></div><span className="inline-flex items-center gap-2 text-xs text-slate-500"><span className={`h-2 w-2 rounded-full ${error ? 'bg-amber-500' : 'bg-emerald-500'}`} />{error ? 'Updates unavailable' : 'Auto updates'}</span></header>
    {(actionError || error) && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{actionError || error}</p>}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
        <div className="relative min-w-[200px] flex-1"><svg aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg><input aria-label="Search orders" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search order, table, customer or dish" /></div>
        <select aria-label="Filter order type" className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All types</option><option value="dine_in">Dine in</option><option value="take_away">Take away</option><option value="mixed">Dine in / Take away</option></select>
        <select aria-label="Filter order status" className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="received">Received</option><option value="preparing">Preparing</option><option value="ready">Ready</option><option value="served">Served / collected</option><option value="cancelled">Cancelled</option></select>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200 px-3 py-2" aria-label="Payment filters">{filters.map(([value, label]) => <button key={value} type="button" aria-pressed={paymentFilter === value} onClick={() => setPaymentFilter(value)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${paymentFilter === value ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>{label}<span className="ml-2 text-xs opacity-60">{orders.filter((order) => matchesPaymentFilter(order, value)).length}</span></button>)}</div>
      {!filteredOrders.length ? <div className="p-8"><StatePanel title={orders.length ? 'No matching orders' : 'No orders yet'} description={orders.length ? 'Try another search or filter.' : 'New customer orders will appear here automatically.'} /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] table-fixed text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="w-[21%] px-4 py-3 font-semibold">Order</th><th className="w-[17%] px-4 py-3 font-semibold">Status</th><th className="w-[15%] px-4 py-3 font-semibold">Type / Table</th><th className="w-[26%] px-4 py-3 font-semibold">Items</th><th className="w-[15%] px-4 py-3 text-right font-semibold">Total</th><th className="w-[6%] px-3 py-3"><span className="sr-only">Details</span></th></tr></thead><tbody className="divide-y divide-slate-100">{filteredOrders.map((order) => <tr key={order.id} className={`cursor-pointer transition hover:bg-orange-50/40 ${selectedOrderId === order.id ? 'bg-orange-50/50' : ''}`} onClick={() => setSelectedOrderId(order.id)}>
        <td className="px-4 py-4 align-top"><button className="break-words text-left font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" onClick={(event) => { event.stopPropagation(); setSelectedOrderId(order.id) }} aria-label={`View order ${orderNumber(order)}`}>{orderNumber(order)}</button><p className="mt-1 text-xs text-slate-500">{orderDate(order.createdAt)}</p><p className="mt-1 truncate text-xs text-slate-400">{order.customerNickname || 'Guest'}</p></td>
        <td className="px-4 py-4 align-top"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${orderStatusStyle(order.status)}`}>{orderStatusLabel(order.status)}</span>{order.status !== 'cancelled' && <p className={`mt-2 text-xs ${order.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-700'}`}>{orderPaymentLabel(order)}</p>}</td>
        <td className="px-4 py-4 align-top"><p className="text-slate-700">{orderTypeLabel(order.orderType)}</p><p className="mt-1 text-xs text-slate-500">Table {orderTable(order)}</p></td>
        <td className="px-4 py-4 align-top"><p className="line-clamp-2 leading-5 text-slate-700">{(order.items ?? []).map((item) => `${item.quantity}× ${item.name}`).join(', ') || '—'}</p><p className="mt-1 text-xs text-slate-400">{(order.items ?? []).reduce((sum, item) => sum + Number(item.quantity), 0)} items</p></td>
        <td className="px-4 py-4 text-right align-top font-semibold tabular-nums text-slate-900">{formatCurrency(order.grandTotal)}</td><td className="px-3 py-4 text-center align-top text-xl text-slate-400" aria-hidden="true">›</td>
      </tr>)}</tbody></table></div>}
      <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400">{filteredOrders.length} of {orders.length} orders · Select an order to view details</div>
    </section>
    {selectedOrder && <OrderDetailsModal order={selectedOrder} isCancelling={isCancelling} onCancelOrder={setCancellingOrder} onClose={() => { if (!isCancelling) setSelectedOrderId(null) }} />}
    {cancellingOrder && <ConfirmationDialog confirmLabel="Cancel order" description={`Cancel ${orderNumber(cancellingOrder)}? This action cannot be undone.`} isLoading={isCancelling} onCancel={() => { if (!isCancelling) setCancellingOrder(null) }} onConfirm={handleCancelOrder} title="Cancel order" />}
  </div>
}

export default OrderManagement
