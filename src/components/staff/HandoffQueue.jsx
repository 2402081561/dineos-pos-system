import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect, useRef, useState } from 'react'
import { authenticatedApiRequest } from '../../services/supabaseAuthService'
import Button from '../common/Button'
import OrderTypeBadge from '../common/OrderTypeBadge'
import { watchPoll } from '../../utils/pollSubscription'

export default function HandoffQueue({ tableId }) {
  const { t: uiText } = useCustomerLanguage()

  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [quantities, setQuantities] = useState({})
  const subscription = useRef(null)
  const busyRef = useRef(false)
  useEffect(() => {
    const watcher = watchPoll((signal) => authenticatedApiRequest('/api/v1/staff/handoffs', { signal }), (data) => { setOrders(data.orders); setError('') }, (error) => setError(error.message), { interval: 5000 })
    subscription.current = watcher
    return () => { watcher.stop(); subscription.current = null }
  }, [])
  async function handoff(order, item) {
    if (busyRef.current || !subscription.current) return
    busyRef.current = true
    const watcher = subscription.current
    watcher.invalidate()
    setBusy(true); setError('')
    try {
      await authenticatedApiRequest(`/api/v1/staff/orders/${order.id}/handoff`, { method: 'PATCH', body: { itemId: item.id, quantity: quantities[item.id] ?? item.quantity - item.fulfilledQuantity, expectedVersion: order.version } })
      await watcher.refreshLatest()
      if (subscription.current === watcher) setQuantities({})
    } catch (e) {
      if (subscription.current === watcher) setError(e.message)
    } finally {
      busyRef.current = false
      if (subscription.current === watcher) setBusy(false)
    }
  }
  return <section className="surface-card space-y-4 p-5"><div><h2 className="text-lg font-extrabold">{uiText("Serve / hand over food")}</h2><p className="text-sm text-slate-500">{uiText("Confirm only when the food reaches the customer. Payment is separate.")}</p></div>
    {error && <p role="alert" className="text-sm text-red-700">{uiText(error)}</p>}
    {orders.filter((order) => !tableId || order.tableId === tableId).map((order) => <article key={order.id} className="space-y-3 rounded-xl border p-3"><p className="font-bold">{uiText("Table")}{' '}{order.tableNumber} · {order.orderNumber} <span className="text-xs font-normal">({order.paymentStatus})</span></p>
      {order.items.map((item) => <div key={item.id} className="space-y-2 border-t pt-3"><p className="font-semibold">{item.name}</p><OrderTypeBadge orderType={item.orderType} /><p className="text-xs text-slate-500">{item.fulfilledQuantity} / {item.quantity}{' '}{uiText("handed over")}{item.notes ? ` · ${item.notes}` : ''}</p><div className="flex flex-wrap items-center gap-2"><label className="text-sm">{uiText("Quantity")}<input aria-label={uiText("Handoff quantity: {{v0}}", { v0: item.name })} className="w-16 rounded border p-2" type="number" min="1" max={item.quantity - item.fulfilledQuantity} value={quantities[item.id] ?? item.quantity - item.fulfilledQuantity} disabled={busy} onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: Number(e.target.value) }))} /></label><Button disabled={busy} onClick={() => void handoff(order, item)}>{item.orderType === 'take_away' ? uiText("Mark collected") : uiText("Mark served")}</Button></div></div>)}
    </article>)}
    {!orders.some((order) => !tableId || order.tableId === tableId) && <p className="text-sm text-slate-500">{uiText("No ready items waiting for handoff.")}</p>}
  </section>
}
