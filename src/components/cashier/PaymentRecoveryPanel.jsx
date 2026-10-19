import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { completeSupabaseTablePayment, getSupabasePaymentRequest } from '../../services/adminApiService'
import { formatCurrency } from '../../utils/currency'
import Button from '../common/Button'

export default function PaymentRecoveryPanel({ pending, onResolved, busy = false }) {
  const { t } = useCustomerLanguage()
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true), inFlight = useRef(false)
  const resolved = useRef(onResolved)
  resolved.current = onResolved
  async function check(retry = false) {
    if (inFlight.current || busy || pending.damaged) return
    inFlight.current = true; setChecking(true); setError('')
    try {
      // Checking never writes. Only an explicit retry can send the original body.
      const payment = retry ? await completeSupabaseTablePayment(pending.body) : await getSupabasePaymentRequest(pending.body.requestId)
      if (!active.current) return
      if (payment?.receiptNumber && payment.paidAt) resolved.current(payment)
      else setError('Payment is not confirmed yet. Check again or retry the original payment. Do not collect the money again.')
    } catch (error) { if (active.current) setError(error.message || 'Could not confirm payment. Keep this page and try again.') }
    finally { inFlight.current = false; if (active.current) setChecking(false) }
  }
  useEffect(() => { active.current = true; void check(); return () => { active.current = false } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="mx-auto max-w-xl space-y-4 rounded-2xl border border-amber-200 bg-white p-5" aria-live="polite">
    <h1 className="text-xl font-bold">{t('Payment confirmation pending')}</h1>
    <p className="text-sm text-slate-600">{t('Check the previous payment before starting another one. Refreshing does not create a new payment.')}</p>
    {pending.damaged ? <p role="alert">{t('Saved payment data is damaged. Ask an administrator to check receipt history before continuing in this tab.')}</p> : <><p>{t('Table')} {pending.tableNumber} · {formatCurrency(pending.body.expectedAmount)} · {t(pending.body.paymentMethod)}</p><p className="break-all text-xs text-slate-500">{pending.body.requestId}</p>
      <div className="flex flex-wrap gap-2"><Button disabled={checking || busy} onClick={() => void check()}>{t('Check payment status')}</Button><Button disabled={checking || busy} onClick={() => void check(true)} variant="outline">{t('Retry same payment')}</Button></div></>}
    {(checking || busy) && <p>{t('Checking payment…')}</p>}{error && <p role="alert" className="text-sm text-red-700">{t(error)}</p>}
    <Link className="block text-sm font-bold text-orange-700 underline" to="/cashier/history">{t('Receipt history')}</Link>
  </section>
}
