import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useState } from 'react'
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
  const { t } = useCustomerLanguage()
  const { showToast } = useToast()
  const { session } = useCustomerSession()
  const [submittingType, setSubmittingType] = useState('')
  const [error, setError] = useState('')

  async function handleRequest(requestType, label) {
    if (!session) {
      setError('Please join your table before sending a request.')
      return
    }
    try {
      setSubmittingType(requestType)
      setError('')
      const result = await createCustomerServiceRequest(session.sessionId, requestType)
      showToast(result.duplicate ? t('You already have a pending {{request}} request.', { request: t(label) }) : t('{{request}} request sent.', { request: t(label) }))
    } catch (firebaseError) {
      console.error('[Service Requests] Failed to create request:', firebaseError)
      setError('We could not send your request. Please try again.')
      showToast('Your request could not be sent. Please try again.', 'error')
    } finally {
      setSubmittingType('')
    }
  }

  const tableLabel = session ? t('Table {{number}}', { number: session.tableNumber }) : t('No table joined')
  return <div className="mx-auto max-w-4xl space-y-7"><SectionHeading description={t("Send a quick request to the restaurant team.")} eyebrow={tableLabel} title={t("How can we help?")} />{error && <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">{t(error)}</p>}<div className="grid gap-4 sm:grid-cols-2">{requestOptions.map((option) => <article className="surface-card p-5" key={option.type}><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-xl text-orange-600">{option.icon}</span><h2 className="mt-5 text-lg font-bold">{t(option.label)}</h2><p className="mt-1 text-sm text-slate-500">{t(option.description)}</p><Button className="mt-5 w-full" disabled={Boolean(submittingType)} onClick={() => handleRequest(option.type, option.label)}>{submittingType === option.type ? t("Sending request...") : t(option.label)}</Button></article>)}</div></div>
}

export default ServiceRequests
