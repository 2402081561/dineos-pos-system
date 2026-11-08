import { useEffect, useRef, useState } from 'react'
import useAdminAuth from '../../hooks/useAdminAuth'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { assignWalkInTable, getWalkInAssignmentTables } from '../../services/adminApiService'
import { assignmentKey, readWalkInAssignment } from '../../utils/walkInAssignmentStorage'
import { formatCurrency } from '../../utils/currency'
import Button from '../common/Button'

export default function AssignWalkInTable({ order, onDone, onCancel }) {
  const { t } = useCustomerLanguage(), { authUser } = useAdminAuth()
  const actor = authUser?.id
  const [pending, setPending] = useState(() => readWalkInAssignment(actor))
  const [setup, setSetup] = useState(null), [targetId, setTargetId] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const active = useRef(true), owner = useRef(actor), flight = useRef(false)
  owner.current = actor
  const target = setup?.tables.find((table) => table.id === targetId)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function load() {
    if (flight.current) return
    flight.current = true; setBusy(true); setError('')
    try { const result = await getWalkInAssignmentTables(order.tableSessionId); if (active.current && owner.current === actor) { setSetup(result); setTargetId('') } }
    catch (failure) { if (active.current && owner.current === actor) setError(failure.message) }
    finally { flight.current = false; if (active.current && owner.current === actor) setBusy(false) }
  }
  useEffect(() => { if (!pending) void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function submit() {
    if (flight.current || !actor || pending?.damaged || (pending && pending.orderId !== order.id)) return
    let record = pending
    try {
      if (!record) {
        if (!target || !setup || setup.source.hasPayments || target.hasPayments) return
        record = { actorId: actor, orderId: order.id, body: { requestId: crypto.randomUUID(), sourceSessionId: setup.source.tableSessionId, targetTableId: target.id, targetSessionId: target.tableSessionId, sourceOrders: setup.source.orders, targetOrders: target.orders } }
        sessionStorage.setItem(assignmentKey(actor), JSON.stringify(record))
        setPending(record)
      }
    } catch { setError('Your browser could not save this operation safely. Do not continue.'); return }
    flight.current = true; setBusy(true); setError('')
    try {
      const result = await assignWalkInTable(record.body)
      if (active.current && owner.current === actor) { sessionStorage.removeItem(assignmentKey(actor)); setPending(null); onDone(result) }
    } catch (failure) {
      if (active.current && owner.current === actor) {
        if (!pending && [400, 409].includes(failure.status)) { sessionStorage.removeItem(assignmentKey(actor)); setPending(null); setSetup(null) }
        setError(failure.message)
      }
    } finally { flight.current = false; if (active.current && owner.current === actor) setBusy(false) }
  }
  const actorChanged = pending && !pending.damaged && pending.actorId !== actor
  return <section className="space-y-4 p-5">
    <h2 className="text-lg font-bold">{t('Assign table')}</h2>
    <p className="text-sm leading-6 text-slate-600">{t('Add a table number to this existing walk-in bill. Food and kitchen progress stay unchanged; no new order is sent.')}</p>
    {pending ? <><p className="text-sm text-amber-800">{t(pending.damaged ? 'Saved assignment is unreadable. Ask an administrator to check before assigning another bill.' : actorChanged || pending.orderId !== order.id ? 'Check the pending table assignment before starting another one.' : 'Previous table assignment needs confirmation. Retry uses the same request; no new order is created.')}</p><Button disabled={busy || pending.damaged || actorChanged || pending.orderId !== order.id} onClick={() => void submit()}>{t('Check / retry same assignment')}</Button></> : <>
      {setup && <label className="block text-sm font-semibold">{t('Table number')}<select className="mt-2 w-full rounded-lg border border-slate-200 p-3" value={targetId} disabled={busy || setup.source.hasPayments} onChange={(event) => setTargetId(event.target.value)}><option value="">{t('Select a table')}</option>{setup.tables.map((table) => <option key={table.id} value={table.id} disabled={table.hasPayments}>{t('Table {{number}}', { number: table.tableNumber })} · {t(table.hasPayments ? 'Has payments — unavailable' : table.tableSessionId ? 'Occupied — combine bills' : 'Vacant')}</option>)}</select></label>}
      {setup?.source.hasPayments && <p className="text-sm text-amber-800">{t('Bills with any payment cannot be assigned to another table.')}</p>}
      {target && <p className={`rounded-lg p-3 text-sm leading-6 ${target.tableSessionId ? 'bg-amber-50 text-amber-900' : 'bg-orange-50 text-orange-900'}`}>{target.tableSessionId ? t('This table already has a bill. Confirming combines this walk-in bill with it. Remaining table total: {{amount}}.', { amount: formatCurrency(Number(target.unpaidTotal) + Number(order.grandTotal) - Number(order.paidAmount ?? 0)) }) : t('This bill will be assigned to Table {{number}}.', { number: target.tableNumber })}</p>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void load()}>{t('Refresh tables')}</Button><Button disabled={busy || !target || setup?.source.hasPayments || target?.hasPayments} onClick={() => void submit()}>{t(target?.tableSessionId ? 'Confirm combine bills' : 'Confirm table number')}</Button></div>
    </>}
    {busy && <p role="status" className="text-sm text-slate-500">{t('Please wait...')}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{t(error)}</p>}
    <Button variant="outline" disabled={busy} onClick={onCancel}>{t('Back')}</Button>
  </section>
}
