import { useEffect, useState } from 'react'
import { authenticatedApiRequest } from '../../services/supabaseAuthService'
import Button from '../common/Button'
import OrderTypeBadge from '../common/OrderTypeBadge'

export default function HandoffQueue({ tableId }) {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [quantities, setQuantities] = useState({})
  useEffect(() => {
    let active = true
    async function refresh() {
      try { const data = await authenticatedApiRequest('/api/v1/staff/handoffs'); if (active) setOrders(data.orders) }
      catch (e) { if (active) setError(e.message) }
    }
    void refresh(); const timer = setInterval(refresh, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  async function handoff(order, item) {
    if (busy) return
    setBusy(true); setError('')
    try {
      await authenticatedApiRequest(`/api/v1/staff/orders/${order.id}/handoff`, { method: 'PATCH', body: { itemId: item.id, quantity: quantities[item.id] ?? item.quantity - item.fulfilledQuantity, expectedVersion: order.version } })
      setOrders((await authenticatedApiRequest('/api/v1/staff/handoffs')).orders)
      setQuantities({})
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <section className="surface-card space-y-4 p-5"><div><h2 className="text-lg font-extrabold">Serve / hand over food</h2><p className="text-sm text-slate-500">Confirm only when the food reaches the customer. Payment is separate.</p></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {orders.filter((order) => !tableId || order.tableId === tableId).map((order) => <article key={order.id} className="space-y-3 rounded-xl border p-3"><p className="font-bold">Table {order.tableNumber} · {order.orderNumber} <span className="text-xs font-normal">({order.paymentStatus})</span></p>
      {order.items.map((item) => <div key={item.id} className="space-y-2 border-t pt-3"><p className="font-semibold">{item.name}</p><OrderTypeBadge orderType={item.orderType} /><p className="text-xs text-slate-500">{item.fulfilledQuantity} / {item.quantity} handed over{item.notes ? ` · ${item.notes}` : ''}</p><div className="flex flex-wrap items-center gap-2"><label className="text-sm">Quantity <input aria-label={`Handoff quantity: ${item.name}`} className="w-16 rounded border p-2" type="number" min="1" max={item.quantity - item.fulfilledQuantity} value={quantities[item.id] ?? item.quantity - item.fulfilledQuantity} disabled={busy} onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: Number(e.target.value) }))} /></label><Button disabled={busy} onClick={() => void handoff(order, item)}>{item.orderType === 'take_away' ? 'Mark collected' : 'Mark served'}</Button></div></div>)}
    </article>)}
    {!orders.some((order) => !tableId || order.tableId === tableId) && <p className="text-sm text-slate-500">No ready items waiting for handoff.</p>}
  </section>
}
