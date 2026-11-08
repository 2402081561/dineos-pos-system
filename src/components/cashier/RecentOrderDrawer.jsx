import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import SideDrawer from '../common/SideDrawer'
import { OrderDetailsPanelContent } from '../common/RecentOrderDetailsPanel'
import KitchenTicketDialog from '../kitchen/KitchenTicketDialog'
import OptionSummary from '../common/OptionSummary'
import Button from '../common/Button'
import RecentOrderDiscount from './RecentOrderDiscount'
import AssignWalkInTable from './AssignWalkInTable'
import { readWalkInAssignment } from '../../utils/walkInAssignmentStorage'
import useOrderDetails from '../../hooks/useOrderDetails'
import useAdminAuth from '../../hooks/useAdminAuth'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { changeSupabaseOrder } from '../../services/adminApiService'
import { currentRecentOrderTable, recentOrderPayment, canEditRecentOrder } from '../../utils/cashierRecentOrder'
import { orderNumber } from '../../utils/adminOrderPresentation'
import { formatCurrency } from '../../utils/currency'

export default function RecentOrderDrawer({ orderId, floor, onClose, onPay, onAssigned = onClose }) {
  const { t } = useCustomerLanguage()
  const { authUser } = useAdminAuth()
  const [draft, setDraft] = useState(null)
  const [action, setAction] = useState(() => readWalkInAssignment(authUser?.id)?.orderId === orderId ? { kind: 'assign' } : null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [message, setMessage] = useState('')
  const [printing, setPrinting] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const actor = useRef(authUser?.id)
  const { order, isLoading, error, refresh } = useOrderDetails(orderId, Boolean(draft || action?.kind === 'void'))
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const actorChanged = actor.current !== authUser?.id
  const currentTable = !actorChanged && !error && !isLoading && currentRecentOrderTable(order, floor)
  const payment = currentTable && recentOrderPayment(order, floor)
  const editable = currentTable && canEditRecentOrder(order, floor, authUser?.role)
  const canPrintKitchen = Boolean(currentTable && ['received', 'preparing', 'ready'].includes(order.status) && order.items?.length)

  function edit() {
    if (!editable) return
    setDraft({ ...order, items: order.items.map((item) => ({ ...item, notes: item.notes ?? '' })) })
    setReason(''); setSaveError(''); setMessage('')
  }
  function cancelEdit() { if (!inFlight.current) { setDraft(null); setSaveError('') } }
  function cancelAction() { if (!inFlight.current) { setAction(null); setReason(''); setSaveError('') } }
  function beginVoid() {
    if (!editable) return
    setAction({ kind: 'void', order: { ...order, items: order.items.map((item) => ({ ...item })) } })
    setReason(''); setSaveError(''); setMessage('')
  }
  function changeItem(id, field, value) {
    setDraft((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, [field]: value } : item) }))
  }
  async function save(event) {
    event.preventDefault()
    if (inFlight.current || !draft || !reason.trim() || actorChanged) return
    if (!canEditRecentOrder(draft, floor, authUser?.role)) { setSaveError('Table visits changed. Reload and confirm again.'); return }
    inFlight.current = true; setBusy(true); setSaveError('')
    try {
      await changeSupabaseOrder(draft.id, { expectedVersion: draft.version, reason: reason.trim(), items: draft.items.map(({ id, quantity, notes }) => ({ id, quantity: Number(quantity), notes })) })
      if (mounted.current) { setDraft(null); setMessage('Order updated. The kitchen and bill will refresh automatically.') }
    } catch (failure) { if (mounted.current) setSaveError(failure.message || 'Order details unavailable') }
    finally { inFlight.current = false; if (mounted.current) setBusy(false) }
  }
  async function voidOrder(event) {
    event.preventDefault()
    const snapshot = action?.kind === 'void' ? action.order : null
    if (inFlight.current || !snapshot || !reason.trim() || actorChanged) return
    if (!canEditRecentOrder(snapshot, floor, authUser?.role)) { setSaveError('Table visits changed. Reload and confirm again.'); return }
    inFlight.current = true; setBusy(true); setSaveError('')
    try {
      await changeSupabaseOrder(snapshot.id, { expectedVersion: snapshot.version, reason: reason.trim(), items: snapshot.items.map((item) => ({ id: item.id, quantity: 0, notes: item.notes ?? '' })) })
      if (mounted.current) { setAction(null); setMessage('Order cancelled.') }
    } catch (failure) { if (mounted.current) setSaveError(failure.message || 'Order details unavailable') }
    finally { inFlight.current = false; if (mounted.current) setBusy(false) }
  }

  const actions = currentTable && <div className="space-y-2 border-t border-slate-100 pt-4">
    {order.isWalkIn && !order.pickupCode && order.status !== 'cancelled' && <Button variant="outline" className="w-full !rounded-lg !shadow-none" onClick={() => setAction({ kind: 'assign' })}>{t('Assign table')}</Button>}
    {payment && <Button className="w-full !rounded-lg !shadow-none" onClick={() => { const latest = recentOrderPayment(order, floor); if (latest) onPay(latest) }}>{t('Collect payment')}</Button>}
    {!order.isWalkIn && order.status !== 'cancelled' && <Link className="block rounded-lg border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-orange-50" to={`/cashier/new-order?tableId=${encodeURIComponent(currentTable.id)}`}>{t('Add order')}</Link>}
    {(editable || canPrintKitchen) && <div className="grid grid-cols-2 gap-2">
      {editable && <Button variant="outline" className="!rounded-lg !px-3 !text-sm !shadow-none" onClick={edit}>{t('Edit order')}</Button>}
      {canPrintKitchen && <Button variant="outline" className="!rounded-lg !px-3 !text-sm !shadow-none" onClick={() => setPrinting(true)}>{t('Kitchen ticket')}</Button>}
    </div>}
    {(payment || editable) && <details className="border-t border-slate-100 pt-2"><summary className="cursor-pointer rounded-lg py-2 text-sm font-semibold text-slate-500">{t('More actions')}</summary><div className="grid gap-2 pt-2">
      {payment && <Button variant="outline" className="w-full !rounded-lg !shadow-none" onClick={() => setAction({ kind: 'discount' })}>{t('Add discount')}</Button>}
      {editable && <Button variant="danger" className="w-full !rounded-lg !shadow-none" onClick={beginVoid}>{t('Void order')}</Button>}
    </div></details>}
  </div>
  return <>
    <SideDrawer title={draft ? t('Edit order') : action?.kind === 'void' ? t('Void order') : action?.kind === 'discount' ? t('Add discount') : order && !isLoading && !error ? orderNumber(order) : t('Order details')} onClose={onClose} busy={busy || printing} onBack={draft ? cancelEdit : action ? cancelAction : undefined}>
      {actorChanged ? <p className="p-5 text-sm text-slate-500">{t('Reopen this panel after switching accounts.')}</p> : action?.kind === 'assign' && order ? <AssignWalkInTable order={order} onCancel={cancelAction} onDone={onAssigned}/> : action?.kind === 'void' ? <form className="space-y-5 p-5" onSubmit={voidOrder}>
        <p className="font-semibold">{orderNumber(action.order)}</p>
        <p className="rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-800">{t('This removes the unpaid order from the bill. Its original contents and reason remain in the order history.')}</p>
        {action.order.status !== 'received' && <p className="text-sm text-amber-800">{t('Preparation has started. Notify the kitchen before voiding this order.')}</p>}
        <label className="block text-sm font-semibold">{t('Reason for change')}<textarea required maxLength={300} rows={3} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal"/></label>
        {saveError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{t(saveError)}</p>}
        <div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={busy} onClick={cancelAction}>{t('Cancel')}</Button><Button variant="danger" type="submit" isLoading={busy} disabled={!reason.trim() || actorChanged || !canEditRecentOrder(action.order, floor, authUser?.role)}>{t('Confirm void')}</Button></div>
      </form> : action?.kind === 'discount' ? <RecentOrderDiscount order={order} floor={{ ...floor, error: error || floor.error, isLoading: isLoading || floor.isLoading }} onContinue={(currentPayment, options) => { if (!actorChanged && !error && !isLoading) onPay(currentPayment, options) }} onCancel={cancelAction}/> : draft ? <form className="space-y-5 p-5" onSubmit={save}>
        <p className="text-xs text-slate-500">{orderNumber(draft)}</p>
        {draft.status !== 'received' && <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">{t('Preparation has started. Your change will be highlighted to the kitchen; ready orders return to Preparing. Confirm the change with staff before saving.')}</p>}
        <fieldset disabled={busy} className="divide-y divide-slate-100">{draft.items.map((item) => <section key={item.id} className="py-4 first:pt-0">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{item.name}</p><OptionSummary item={item}/><p className="mt-1 text-xs text-slate-500">{formatCurrency(item.price)} {t('each')}</p></div>
            <div className="flex shrink-0 items-center gap-1"><button type="button" disabled={Number(item.quantity) <= 0} onClick={() => changeItem(item.id, 'quantity', Number(item.quantity) - 1)} aria-label={t('Decrease quantity')} className="h-10 w-9 rounded-lg border text-lg disabled:opacity-30">−</button><input required type="number" min={0} max={50} step={1} aria-label={t('Quantity for {{v0}}', { v0: item.name })} value={item.quantity} onChange={(event) => changeItem(item.id, 'quantity', event.target.value)} className="h-10 w-14 rounded-lg border text-center text-sm"/><button type="button" disabled={Number(item.quantity) >= 50} onClick={() => changeItem(item.id, 'quantity', Number(item.quantity) + 1)} aria-label={t('Increase quantity')} className="h-10 w-9 rounded-lg border text-lg disabled:opacity-30">+</button></div>
          </div>
          <label className="mt-3 block text-xs text-slate-500">{t('Kitchen note')}<textarea maxLength={500} rows={1} value={item.notes} onChange={(event) => changeItem(item.id, 'notes', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-800"/></label>
          {Number(item.quantity) === 0 && <p className="mt-2 text-xs text-red-700">{t('This item will be removed when saved.')}</p>}
        </section>)}</fieldset>
        <label className="block text-sm font-semibold">{t('Reason for change')}<textarea required maxLength={300} disabled={busy} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal"/></label>
        {draft.items.every((item) => Number(item.quantity) === 0) && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-800">{t('All items removed: this will cancel the order. Its original contents remain in the change history.')}</p>}
        {saveError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{t(saveError)}</p>}
        <div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" disabled={busy} onClick={cancelEdit}>{t('Cancel editing')}</Button><Button type="submit" disabled={!reason.trim() || actorChanged || !canEditRecentOrder(draft, floor, authUser?.role)} isLoading={busy}>{t('Save changes')}</Button></div>
      </form> : <div aria-live="polite" aria-busy={isLoading}>
        {message && <p role="status" className="mx-4 mt-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{t(message)}</p>}
        {isLoading ? <p className="p-5 text-sm text-slate-500">{t('Loading order details…')}</p> : error ? <div className="space-y-3 p-5"><p className="text-sm font-semibold">{t('Order details unavailable')}</p><p className="text-sm text-slate-500">{t(error)}</p><Button variant="outline" onClick={refresh}>{t('Try again')}</Button></div> : order && <div className="pt-4"><OrderDetailsPanelContent compact order={order} returnTo="/cashier" actions={actions}/></div>}
      </div>}
    </SideDrawer>
    {printing && <KitchenTicketDialog order={canPrintKitchen ? order : null} onClose={() => setPrinting(false)}/>}
  </>
}
