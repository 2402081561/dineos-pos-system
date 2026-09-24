import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/common/Button'
import ConfirmationDialog from '../../components/common/ConfirmationDialog'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import CustomerOrderDetailsModal from '../../components/customer/CustomerOrderDetailsModal'
import useCart from '../../hooks/useCart'
import useCustomerOrders from '../../hooks/useCustomerOrders'
import useCustomerSession from '../../hooks/useCustomerSession'
import useToast from '../../hooks/useToast'
import { cancelCustomerOrder, getPublicMenu } from '../../services/customerApi'
import { formatCurrency } from '../../utils/currency'

function formatDateTime(timestamp) {
  const date = timestamp?.toDate?.() ?? new Date(timestamp)
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function orderNumber(order) { return order.orderNumber ?? `#${String(order?.id ?? '').slice(-6).toUpperCase() || '—'}` }
function quantityOf(items) { return (Array.isArray(items) ? items : []).reduce((total, item) => total + Math.max(0, Math.floor(Number(item?.quantity) || 0)), 0) }
function isCancellable(order) { return String(order?.status ?? '').toLowerCase() === 'received' && String(order?.paymentStatus ?? 'pending').toLowerCase() !== 'paid' }
function isOrderableMenuItem(item) { return item?.id && String(item.name ?? '').trim() && item.isAvailable === true && Number.isFinite(Number(item.price)) && Number(item.price) >= 0 }

function OrderPreview({ items }) {
  const previewItems = (Array.isArray(items) ? items : []).filter((item) => item?.imageUrl).slice(0, 4)
  return <div className="flex items-center gap-1.5 sm:gap-2">{previewItems.length ? previewItems.map((item, index) => <img alt="" className="h-10 w-10 rounded-lg object-cover sm:h-12 sm:w-12 sm:rounded-xl" key={`${item.menuItemId ?? 'item'}-${index}`} onError={(event) => { event.currentTarget.style.display = 'none' }} src={item.imageUrl} />) : <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-lg sm:h-12 sm:w-12 sm:rounded-xl sm:text-xl">🍽️</span>}</div>
}

function OrderHistory() {
  const { orders, isLoading, error } = useCustomerOrders()
  const { session } = useCustomerSession()
  const { addToCart } = useCart()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [menuItems, setMenuItems] = useState([])
  const [isMenuLoading, setIsMenuLoading] = useState(true)
  const [menuError, setMenuError] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orderToCancel, setOrderToCancel] = useState(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let active = true
    setIsMenuLoading(true)
    getPublicMenu().then((items) => { if (active) { setMenuItems(items); setMenuError('') } }).catch((loadError) => { if (active) { console.error('[OrderHistory] Failed to load current menu:', loadError); setMenuError('Current menu availability could not be loaded. Re-order is temporarily unavailable.') } }).finally(() => { if (active) setIsMenuLoading(false) })
    return () => { active = false }
  }, [])

  const currentMenuById = useMemo(() => new Map(menuItems.map((item) => [item.id, item])), [menuItems])

  function handleReorder(order) {
    const skippedItems = []
    let addedQuantity = 0
    ;(Array.isArray(order.items) ? order.items : []).forEach((previousItem) => {
      const currentItem = currentMenuById.get(previousItem?.menuItemId)
      const quantity = Math.floor(Number(previousItem?.quantity))
      if (!isOrderableMenuItem(currentItem) || !Number.isFinite(quantity) || quantity < 1) { skippedItems.push(previousItem?.name || 'an item'); return }
      addToCart(currentItem, quantity, String(previousItem?.notes ?? ''))
      addedQuantity += quantity
    })
    if (addedQuantity === 0) { const message = 'None of the items from this order are currently available.'; setActionError(message); showToast(message, 'error'); return }
    const message = skippedItems.length ? `${addedQuantity} item${addedQuantity === 1 ? '' : 's'} added. ${skippedItems.length} unavailable item${skippedItems.length === 1 ? ' was' : 's were'} skipped.` : `${addedQuantity} item${addedQuantity === 1 ? '' : 's'} added to your cart.`
    setActionError(''); showToast(message); navigate('/cart')
  }

  async function handleCancelOrder() {
    if (!orderToCancel || !session?.sessionId || isCancelling) return
    try { setIsCancelling(true); setActionError(''); await cancelCustomerOrder(session.sessionId, orderToCancel.id); showToast('Your order has been cancelled.'); setOrderToCancel(null) }
    catch (apiError) { console.error('[OrderHistory] Failed to cancel order:', apiError); const message = apiError instanceof Error ? apiError.message : 'We could not cancel this order. Please try again.'; setActionError(message); showToast(message, 'error'); setOrderToCancel(null) }
    finally { setIsCancelling(false) }
  }

  if (isLoading) return <div className="mx-auto max-w-4xl"><StatePanel description="Orders placed in this customer session are loading." title="Loading your orders..." /></div>
  if (error) return <div className="mx-auto max-w-4xl"><StatePanel description={error} title="Order history unavailable" tone="error" /></div>

  return <div className="mx-auto max-w-4xl space-y-6"><SectionHeading description="Only orders placed from this customer session are shown here." eyebrow={session ? `Table ${session.tableNumber}` : 'Customer session'} title="My orders" />{actionError && <p aria-live="polite" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">{actionError}</p>}{menuError && <p aria-live="polite" className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm font-medium text-amber-800">{menuError}</p>}{orders.length === 0 ? <StatePanel description="Orders you place from this session will appear here." title="No orders yet" /> : <section aria-label="Order history" className="space-y-2.5 sm:space-y-3">{orders.map((order) => { const itemCount = quantityOf(order.items); const status = String(order.status ?? 'unknown').toLowerCase(); const paymentStatus = String(order.paymentStatus ?? 'pending').toLowerCase(); return <article className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:p-5" key={order.id}><div className="mb-2.5 flex items-center gap-2.5 sm:mb-3 sm:gap-3"><OrderPreview items={order.items} /><span className="text-xs text-slate-500">{itemCount} item{itemCount === 1 ? '' : 's'}</span></div><div className="flex flex-wrap items-start justify-between gap-2.5 sm:gap-3"><div><p className="text-sm font-bold text-slate-900 sm:text-base">{orderNumber(order)}</p><p className="mt-1 text-xs text-slate-500 sm:text-sm">{formatDateTime(order.createdAt)} · Table {order.tableNumber ?? order.tableId ?? '—'}</p></div><div className="text-right"><p className="text-base font-extrabold text-orange-600 sm:text-lg">{formatCurrency(order.grandTotal)}</p><p className="mt-1 text-[11px] font-semibold capitalize text-slate-500 sm:text-xs">{status} · {paymentStatus}</p></div></div><div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 sm:mt-3 sm:gap-3 sm:pt-3"><p className="text-xs text-slate-600 sm:text-sm">{itemCount} item{itemCount === 1 ? '' : 's'}</p><div className="flex flex-wrap justify-end gap-1.5 sm:gap-2"><Button className="px-2.5 py-1.5 text-[11px] sm:px-3 sm:py-2 sm:text-xs" onClick={() => setSelectedOrder(order)} variant="outline">View details</Button><Button className="px-2.5 py-1.5 text-[11px] sm:px-3 sm:py-2 sm:text-xs" disabled={isMenuLoading || Boolean(menuError)} onClick={() => handleReorder(order)} variant="secondary">{isMenuLoading ? 'Checking menu...' : 'Re-order'}</Button>{isCancellable(order) && <Button className="px-2.5 py-1.5 text-[11px] sm:px-3 sm:py-2 sm:text-xs" onClick={() => setOrderToCancel(order)} variant="danger">Cancel order</Button>}</div></div></article> })}</section>}{selectedOrder && <CustomerOrderDetailsModal onClose={() => setSelectedOrder(null)} order={selectedOrder} />}{orderToCancel && <ConfirmationDialog confirmLabel="Cancel order" description="This is only possible while the order has not reached the kitchen. This action cannot be undone." isLoading={isCancelling} onCancel={() => setOrderToCancel(null)} onConfirm={handleCancelOrder} title="Cancel this order?" />}</div>
}

export default OrderHistory
