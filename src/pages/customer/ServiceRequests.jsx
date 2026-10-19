import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useRef, useState } from 'react'
import useCustomerServiceRequests from '../../hooks/useCustomerServiceRequests'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import useCustomerSession from '../../hooks/useCustomerSession'
import useToast from '../../hooks/useCustomerToast'
import { createCustomerServiceRequest } from '../../services/customerApi'

const requestOptions = [
  { type: 'callWaiter', label: 'Call Waiter', description: 'Request help from a staff member.', icon: '♧' },
  { type: 'requestBill', label: 'Request Bill', description: 'Ask for your table bill.', icon: '▣' },
  { type: 'water', label: 'Water', description: 'Request a water refill.', icon: '◌' },
  { type: 'extraSpoon', label: 'Extra Spoon', description: 'Request an extra spoon.', icon: '⌄' },
]

function ServiceRequests() {
  const { t, formatDate } = useCustomerLanguage()
  const { showToast } = useToast()
  const { session } = useCustomerSession()
  const [submittingType, setSubmittingType] = useState('')
  const [error, setError] = useState('')
  const { requests, error: historyError, loading, refresh } = useCustomerServiceRequests(session?.sessionId)
  const busy = useRef(false)
  const actor = useRef(session?.sessionId)
  actor.current = session?.sessionId

  async function handleRequest(requestType, label) {
    if (busy.current || requests.some((request) => request.requestType === requestType && request.status === 'pending')) return
    if (!session) {
      setError('Please join your table before sending a request.')
      return
    }
    const owner = session.sessionId
    busy.current = true
    try {
      setSubmittingType(requestType)
      setError('')
      const result = await createCustomerServiceRequest(session.sessionId, requestType)
      if (actor.current !== owner) return
      showToast(result.duplicate ? t('You already have a pending {{request}} request.', { request: t(label) }) : t('{{request}} request sent.', { request: t(label) }))
      await refresh()
    } catch (firebaseError) {
      console.error('[Service Requests] Failed to create request:', firebaseError)
      if (actor.current !== owner) return
      setError('We could not send your request. Please try again.')
      showToast('Your request could not be sent. Please try again.', 'error')
    } finally {
      setSubmittingType('')
      busy.current = false
    }
  }

  const tableLabel = session ? t('Table {{number}}', { number: session.tableNumber }) : t('No table joined')
  return <div className="mx-auto max-w-4xl space-y-7">
    <SectionHeading description={t("Send a quick request to the restaurant team.")} eyebrow={tableLabel} title={t("How can we help?")} />
    {(error || historyError) && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{t(error || historyError)}</p>}
    <div className="grid gap-4 sm:grid-cols-2">{requestOptions.map((option) => {
      const pending = requests.some((request) => request.requestType === option.type && request.status === 'pending')
      return <article className="surface-card p-5" key={option.type}>
        <h2 className="text-lg font-bold">{t(option.label)}</h2><p className="mt-1 text-sm text-slate-500">{t(option.description)}</p>
        <Button className="mt-5 w-full" disabled={Boolean(submittingType) || pending || loading || Boolean(historyError)} onClick={() => handleRequest(option.type, option.label)}>{submittingType === option.type ? t("Sending request...") : pending ? t('Staff already notified') : t(option.label)}</Button>
      </article>
    })}</div>
    <section className="surface-card p-5" aria-live="polite">
      <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{t('Table service requests')}</h2><Button variant="outline" onClick={() => void refresh()}>{t('Refresh')}</Button></div>
      <p className="mt-2 text-xs text-slate-500">{t('Requests are shared with this table, not other tables.')}</p>
      {loading ? <p className="mt-4">{t('Loading requests…')}</p> : requests.length === 0 ? <p className="mt-4 text-sm text-slate-500">{t('No service requests yet.')}</p> :
        <ul className="mt-3 divide-y divide-slate-100">{requests.map((request) => <li key={request.id} className="flex items-center justify-between gap-3 py-3 text-sm">
          <div><p className="font-semibold">{t(requestOptions.find((option) => option.type === request.requestType)?.label ?? request.requestType)}</p><p className="mt-1 text-xs text-slate-500">{formatDate(request.createdAt)}{request.status === 'completed' && <> · {t('Completed')}: {formatDate(request.updatedAt)}</>}</p></div>
          <span className={request.status === 'pending' ? 'text-amber-700' : 'text-emerald-700'}>{request.status === 'pending' ? t('Request received') : t('Completed')}</span>
        </li>)}</ul>}
    </section>
  </div>
}

export default ServiceRequests
