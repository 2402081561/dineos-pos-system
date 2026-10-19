import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import useAdminAuth from '../../hooks/useAdminAuth'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { getSupabasePaidReceipts, getSupabaseReceiptRefunds, getSupabaseRefundEvents, recordSupabaseRefund } from '../../services/adminApiService'
import { refundRecoveryStorage } from '../../utils/refundRecoveryStorage'
import { watchPoll } from '../../utils/pollSubscription'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/common/Button'

export default function Refunds() {
  const { t, formatDate } = useCustomerLanguage()
  const { authUser } = useAdminAuth()
  const actorId = authUser?.id
  const [params] = useSearchParams()
  const [saved, setSaved] = useState(() => ({ actorId, value: refundRecoveryStorage.read(actorId) }))
  const pending = saved.actorId === actorId ? saved.value : refundRecoveryStorage.read(actorId)
  const [receiptNumber, setReceiptNumber] = useState(params.get('receipt') || '')
  const selected = pending?.receiptNumber || receiptNumber
  const [source, setSource] = useState({ receipts: [], refunds: [], refundsAvailable: false, loading: true })
  const [detail, setDetail] = useState(null)
  const [amount, setAmount] = useState(''), [reason, setReason] = useState(''), [method, setMethod] = useState('Cash')
  const [returned, setReturned] = useState(false), [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [success, setSuccess] = useState(null)
  const active = useRef({ actorId, mounted: true }), inFlight = useRef(false), poller = useRef(null)
  active.current.actorId = actorId
  useEffect(() => { const lifetime = active.current; lifetime.mounted = true; return () => { lifetime.mounted = false } }, [])
  useEffect(() => {
    const watcher = watchPoll(async () => { const [receipts, data] = await Promise.all([getSupabasePaidReceipts(), getSupabaseRefundEvents()]); return { ...data, receipts, loading: false } },
      setSource, () => setSource((current) => ({ ...current, loadError: 'Could not load refund records. Please try again.', loading: false })), { interval: 15000 })
    poller.current = watcher
    return () => { watcher.stop(); poller.current = null }
  }, [actorId])
  useEffect(() => {
    let current = true
    setDetail(null); setConfirmed(false); setAmount(''); setReason(''); setReturned(false)
    if (selected) getSupabaseReceiptRefunds(selected).then((data) => { if (current) { setDetail(data); setError('') } }).catch((error) => { if (current) setError(error.message) })
    return () => { current = false }
  }, [selected, actorId])
  useEffect(() => {
    let current = true
    if (selected && source.refundsAvailable) getSupabaseReceiptRefunds(selected).then((data) => { if (current) setDetail(data) }).catch(() => { /* The live-feed warning already reports an outage; never clear the saved request. */ })
    return () => { current = false }
  }, [selected, source.refunds, source.refundsAvailable])
  const stillHere = (owner) => active.current.mounted && active.current.actorId === owner
  function finish(record, owner) {
    if (!stillHere(owner)) return
    refundRecoveryStorage.clear(owner)
    setSaved({ actorId: owner, value: null }); setConfirmed(false); setSuccess(record); setDetail(null); setReceiptNumber(''); setError('')
    void poller.current?.refreshLatest()
  }
  async function checkPending() {
    if (inFlight.current || !pending || pending.damaged) return
    const owner = actorId
    inFlight.current = true; setBusy(true); setError('')
    try {
      const data = await getSupabaseReceiptRefunds(pending.receiptNumber)
      if (!stillHere(owner)) return
      const found = data.refunds.find((record) => record.requestId === pending.body.requestId)
      if (found) finish(found, owner)
      else { setDetail(data); setError('Refund is not confirmed yet. Check again or retry the same record. Do not return the money again.') }
    } catch (error) { if (stillHere(owner)) setError(error.message) }
    finally { inFlight.current = false; if (stillHere(owner)) setBusy(false) }
  }
  useEffect(() => { if (pending && !pending.damaged) void checkPending() }, [actorId, pending?.body?.requestId]) // eslint-disable-line react-hooks/exhaustive-deps
  async function submit() {
    if (inFlight.current || !actorId || pending?.damaged || (!pending && (!confirmed || !valid))) return
    const owner = actorId, wasPending = Boolean(pending)
    const record = pending || { actorId, receiptNumber: selected, body: { amount, reason, method, fundsReturned: true, requestId: crypto.randomUUID() } }
    inFlight.current = true; setBusy(true); setError('')
    try {
      refundRecoveryStorage.save(record)
      setSaved({ actorId, value: record })
      const result = await recordSupabaseRefund(record.receiptNumber, record.body)
      if (!result?.refundNumber) throw new Error('Could not confirm refund. Retry the same record.')
      finish(result, owner)
    } catch (error) {
      if (!stillHere(owner)) return
      if (!wasPending && [400, 404, 409, 422].includes(error.status)) { refundRecoveryStorage.clear(owner); setSaved({ actorId: owner, value: null }); setConfirmed(false) }
      setError(error.message || 'Could not confirm refund. Retry the same record.')
    } finally { inFlight.current = false; if (stillHere(owner)) setBusy(false) }
  }
  const valid = detail && !source.loadError && Number(amount) > 0 && Number(amount) <= Number(detail.refundableAmount) && /^\d+(\.\d{1,2})?$/.test(amount) && reason.trim().length >= 3 && returned
  return <div className="space-y-5">
    <h1 className="text-xl font-bold">{t('Refund records')}</h1>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">{t('Manual record only. DineOS does not transfer money to a bank or e-wallet. Record this only after returning the money outside DineOS.')}</p>
    <p className="text-xs text-slate-500">{t('Refunds do not reopen orders, restore stock or change serving status. Loyalty points are reversed proportionally; a negative balance is offset by future earnings.')}</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{t(error)}</p>}
    {source.loadError && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t(source.loadError)}</p>}
    {success && <div role="status" className="rounded-xl bg-emerald-50 p-4"><p>{t('Refund recorded')} · {formatCurrency(success.amount)}</p><Link className="mt-2 inline-block font-bold underline" to={`/admin/refunds/${encodeURIComponent(success.refundNumber)}`}>{t('Print refund record')}</Link></div>}
    {pending ? <section className="surface-card space-y-3 p-5"><h2 className="font-bold">{t('Refund confirmation pending')}</h2>{pending.damaged ? <p>{t('Saved refund data is damaged. Check refund history before continuing in this tab.')}</p> : <><p>{pending.receiptNumber} · {formatCurrency(pending.body.amount)}</p><p className="text-sm">{t('Do not return the money again. Confirm the previous record first.')}</p><div className="flex gap-2"><Button disabled={busy} onClick={() => void checkPending()}>{t('Check refund status')}</Button><Button disabled={busy} variant="outline" onClick={() => void submit()}>{t('Retry same refund record')}</Button></div></>}</section> : <section className="surface-card space-y-4 p-5">
      {!source.loading && !source.refundsAvailable && <p role="status">{t('Refund records are not available until the database upgrade is applied.')}</p>}
      <label className="block text-sm font-bold">{t('Receipt number')}<input list="refund-receipts" value={receiptNumber} disabled={busy || confirmed || !source.refundsAvailable} onChange={(event) => setReceiptNumber(event.target.value)} className="mt-2 block w-full rounded-lg border p-3" placeholder="R-20261016-0001" /></label>
      <datalist id="refund-receipts">{source.receipts.map((receipt) => <option key={receipt.receiptNumber} value={receipt.receiptNumber} />)}</datalist>
      {detail && <><p className="text-sm">{t('Original payment')}: {formatCurrency(detail.amount)} · {t('Refunded amount')}: {formatCurrency(detail.refundedAmount)} · {t('Refundable amount')}: {formatCurrency(detail.refundableAmount)}</p>
        <label className="block text-sm font-bold">{t('Refund amount')}<input type="number" min="0.01" max={detail.refundableAmount} step="0.01" value={amount} disabled={busy || confirmed} onChange={(event) => setAmount(event.target.value)} className="mt-2 block w-full rounded-lg border p-3" /></label>
        <label className="block text-sm font-bold">{t('Refund reason')}<textarea value={reason} maxLength={500} disabled={busy || confirmed} onChange={(event) => setReason(event.target.value)} className="mt-2 block w-full rounded-lg border p-3" /></label>
        <label className="block text-sm font-bold">{t('Refund method')}<select value={method} disabled={busy || confirmed} onChange={(event) => setMethod(event.target.value)} className="mt-2 block w-full rounded-lg border p-3">{['Cash', 'Original payment method', 'Other'].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={returned} disabled={busy || confirmed} onChange={(event) => setReturned(event.target.checked)} />{t('I confirm the money has already been returned outside DineOS.')}</label>
        {confirmed ? <div className="rounded-lg border border-amber-200 p-4"><p className="font-bold">{t('Confirm manual refund record?')} {formatCurrency(amount)}</p><div className="mt-3 flex gap-2"><Button disabled={busy} variant="outline" onClick={() => setConfirmed(false)}>{t('Cancel')}</Button><Button disabled={busy || !valid} onClick={() => void submit()}>{t('Record refund')}</Button></div></div> : <Button disabled={!valid || busy} onClick={() => setConfirmed(true)}>{t('Review refund')}</Button>}
      </>}
    </section>}
    <section className="surface-card p-5"><h2 className="font-bold">{t('Refund history')}</h2><div className="mt-3 divide-y">{source.refunds.map((record) => <article key={record.refundNumber} className="space-y-1 py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{record.receiptNumber}</strong><strong>{formatCurrency(record.amount)}</strong></div><p className="break-words">{record.reason}</p><p className="text-xs text-slate-500">{formatDate(record.createdAt)} · {record.actorName} · {t(record.method)}</p><Link className="inline-block py-2 font-bold text-orange-700 underline" to={`/admin/refunds/${encodeURIComponent(record.refundNumber)}`}>{t('Print refund record')}</Link></article>)}</div></section>
  </div>
}
