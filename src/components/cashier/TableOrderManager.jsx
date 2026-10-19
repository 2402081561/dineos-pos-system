import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import OrderTypeBadge from '../common/OrderTypeBadge'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PosDialog from '../common/PosDialog'
import OptionSummary from '../common/OptionSummary'
import Button from '../common/Button'
import useAdminAuth from '../../hooks/useAdminAuth'
import { getSupabaseTableOrders, changeSupabaseOrder } from '../../services/adminApiService'
import { formatCurrency } from '../../utils/currency'

export default function TableOrderManager({ table, onClose, onPay }) {
  const { t: uiText, locale } = useCustomerLanguage()

  const { authUser: user } = useAdminAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const generation = useRef(0)
  const load = useCallback(async () => {
    const current = ++generation.current
    try { const rows = await getSupabaseTableOrders(table.id, table.tableSessionId); if (generation.current === current) { setOrders(rows); setError('') } }
    catch (loadError) { if (generation.current === current) setError(loadError.message) }
    finally { if (generation.current === current) setLoading(false) }
  }, [table.id, table.tableSessionId])
  useEffect(() => {
    if (draft) return
    const token = generation
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => { ++token.current; window.clearInterval(timer) }
  }, [draft, load])
  function edit(order) { ++generation.current; setDraft({ ...order, items: order.items.map((item) => ({ ...item, notes: item.notes ?? '' })) }); setReason(''); setError(''); setMessage('') }
  function itemChange(id, field, value) { setDraft((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, [field]: value } : item) })) }
  async function save(event) {
    event.preventDefault()
    if (busy || !reason.trim()) return
    setBusy(true); setError('')
    try {
      await changeSupabaseOrder(draft.id, { expectedVersion: draft.version, reason, items: draft.items.map(({ id, quantity, notes }) => ({ id, quantity: Number(quantity), notes })) })
      setDraft(null); setMessage('Order updated. The kitchen and bill will refresh automatically.'); await load()
    } catch (saveError) { setError(saveError.message) }
    finally { setBusy(false) }
  }
  return <PosDialog title={uiText("Table {{v0}} · Orders", { v0: table.tableNumber })} onClose={onClose} busy={busy}>
    {!draft && onPay && <Button className="mb-4" onClick={onPay}>{uiText("Pay selected items / table bill")}</Button>}
    {!draft && <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">{uiText("Orders in this table visit · refreshes every 5 seconds.")}</p>{orders.some((order) => order.tableSessionStatus === 'active') && <Link className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-bold text-white" to={`/cashier/new-order?tableId=${encodeURIComponent(table.id)}`} onClick={onClose}>{uiText("+ Add order")}</Link>}</div>}
    {loading && <p role="status">{uiText("Loading orders...")}</p>}
    {message && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{uiText(message)}</p>}
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{uiText(error)}<Button className="ml-2" variant="outline" disabled={busy} onClick={() => { setDraft(null); void load() }}>{uiText("Reload orders")}</Button></div>}
    {draft ? <form className="space-y-4" onSubmit={save}>
      <p className="font-bold">{draft.orderNumber} · <span className="capitalize">{uiText(draft.status)}</span></p>
      {draft.status !== 'received' && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{uiText("Preparation has started. Your change will be highlighted to the kitchen; ready orders return to Preparing. Confirm the change with staff before saving.")}</p>}
      <fieldset disabled={busy} className="space-y-3">{draft.items.map((item) => <section className="rounded-xl border p-3" key={item.id}>
        <div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{item.name}</strong><OptionSummary item={item} /><p className="mt-1 text-xs text-slate-500">{formatCurrency(item.price)}{' '}{uiText("each · original order price retained")}</p></div><label className="w-24 shrink-0 text-xs">{uiText("Quantity")}<input aria-label={uiText("Quantity for {{v0}}", { v0: item.name })} className="mt-1 w-full rounded-lg border p-2" type="number" min={0} max={50} required value={item.quantity} onChange={(e) => itemChange(item.id, 'quantity', e.target.value)} /></label></div>
        <label className="mt-3 block text-xs">{uiText("Kitchen note")}<textarea className="mt-1 w-full rounded-lg border p-2 text-sm" maxLength={500} rows={2} value={item.notes} onChange={(e) => itemChange(item.id, 'notes', e.target.value)} /></label>
        <Button variant="danger" className="mt-2 text-xs" onClick={() => itemChange(item.id, 'quantity', 0)}>{uiText("Remove item")}</Button>{Number(item.quantity) === 0 && <p className="mt-1 text-xs text-red-600">{uiText("This item will be removed when saved.")}</p>}
      </section>)}</fieldset>
      <label className="block text-sm font-bold">{uiText("Reason for change")}<textarea required maxLength={300} disabled={busy} className="mt-2 w-full rounded-xl border p-3 text-sm font-normal" placeholder={uiText("e.g. Customer requested less spicy / ordered wrong quantity")} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {draft.items.every((item) => Number(item.quantity) === 0) && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{uiText("All items removed: this will cancel the order. Its original contents remain in the change history.")}</p>}
      <div className="flex flex-wrap gap-3"><Button type="submit" isLoading={busy} disabled={!reason.trim()}>{uiText("Save changes")}</Button><Button disabled={busy} variant="outline" onClick={() => { setDraft(null); setError('') }}>{uiText("Cancel editing")}</Button></div>
    </form> : <div className="space-y-4">{orders.map((order) => {
      const editable = order.tableSessionStatus === 'active' && !order.items.some((item) => item.paidQuantity > 0 || item.fulfilledQuantity > 0) && order.paymentStatus !== 'paid' && ['received', 'preparing', 'ready'].includes(order.status) && (order.status === 'received' || user?.role === 'admin')
      return <article className="rounded-xl border border-slate-200 p-4" key={order.id}>
        <div className="flex flex-wrap justify-between gap-2"><div><strong>{order.orderNumber}</strong><OrderTypeBadge orderType={order.orderType} className="ml-2" /><p className="mt-1 text-xs capitalize text-slate-500">{uiText(order.customerNickname || 'Guest')} · {uiText(order.status)} · {uiText(order.paymentStatus)}</p></div><strong className="text-orange-600">{formatCurrency(order.grandTotal)}</strong></div>
        {order.isAddition && <p className="mt-2 text-xs font-bold text-orange-700">{uiText("Additional order")}</p>}
        {order.items.map((item) => <div className="mt-3 border-t pt-2 text-sm" key={item.id}><strong>{item.quantity} × {item.name}</strong><OptionSummary item={item} />{item.notes && <p className="mt-1 text-xs text-amber-800">{uiText("Note:")}{' '}{item.notes}</p>}</div>)}
        {order.revisionNote && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{uiText("Changed:")}{' '}{order.revisionNote}</p>}
        {editable ? <Button className="mt-3 text-xs" variant="outline" onClick={() => edit(order)}>{uiText("Edit quantities / notes")}</Button> : <p className="mt-3 text-xs text-slate-500">{order.items.some((item) => item.paidQuantity > 0 || item.fulfilledQuantity > 0) ? uiText("Read only · this order contains paid or handed-over items.") : order.tableSessionStatus === 'active' && ['preparing', 'ready'].includes(order.status) && order.paymentStatus !== 'paid' ? uiText("Ask an administrator to change an order after preparation starts.") : uiText("Read only · closed visits, paid, served and cancelled orders cannot be changed.")}</p>}
        {order.history.length > 0 && <details className="mt-3 rounded-lg bg-slate-50 p-3 text-xs"><summary className="cursor-pointer font-bold">{uiText("Change history (")}{order.history.length})</summary>{order.history.map((revision) => <div className="mt-3 border-t pt-2" key={revision.id}><p className="font-semibold">{revision.actorName} · {new Date(revision.createdAt).toLocaleString(locale, { timeZone: 'Asia/Kuching' })}</p><p className="mt-1">{revision.reason}</p><p className="mt-1 text-slate-500">{uiText("Before:")}{' '}{revision.before.items.map((item) => `${item.quantity}× ${item.name}${item.notes ? ' (' + item.notes + ')' : ''}`).join(' · ')}</p><p className="mt-1 text-slate-500">{uiText("After:")}{' '}{revision.after.items.length ? revision.after.items.map((item) => `${item.quantity}× ${item.name}${item.notes ? ' (' + item.notes + ')' : ''}`).join(' · ') : uiText("Cancelled")}</p></div>)}</details>}
      </article>
    })}{!loading && orders.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{uiText("No orders in this table visit.")}</p>}</div>}
  </PosDialog>
}
