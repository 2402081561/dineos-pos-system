import { useState } from 'react'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import useCustomerSession from '../../hooks/useCustomerSession'
import useTableSummary from '../../hooks/useTableSummary'
import useToast from '../../hooks/useCustomerToast'
import { createCustomerServiceRequest } from '../../services/customerApi'
import { formatCurrency } from '../../utils/currency'

function Bill() {
  const { t } = useCustomerLanguage()
  const { session } = useCustomerSession()
  const { error, grandTotal, hasTableSession, isLoading, participants, tableNumber } = useTableSummary()
  const { showToast } = useToast()
  const [isRequesting, setIsRequesting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [billMode, setBillMode] = useState('table')
  const subtotal = participants.reduce((sum, participant) => sum + Number(participant.subtotal ?? 0), 0)
  const serviceCharge = participants.reduce((sum, participant) => sum + Number(participant.serviceCharge ?? 0), 0)
  const sst = participants.reduce((sum, participant) => sum + Number(participant.sst ?? 0), 0)

  async function handleRequestBill() {
    if (!session || isRequesting) return
    try {
      setIsRequesting(true)
      setRequestError('')
      const result = await createCustomerServiceRequest(session.sessionId, 'requestBill', {
        billMode,
        requestedAmount: billMode === 'table' ? grandTotal : null,
        tableSessionId: session.tableSessionId,
      })
      showToast(result.duplicate ? 'You already have a pending bill request.' : billMode === 'table' ? 'Table bill request sent.' : 'Split bill request sent.')
    } catch (error) {
      console.error('[Bill] Failed to request bill:', error)
      setRequestError(error.message || 'We could not send your bill request. Please try again.')
      showToast('Your bill request could not be sent. Please try again.', 'error')
    } finally {
      setIsRequesting(false)
    }
  }

  if (isLoading) return <div className="mx-auto max-w-4xl space-y-5 animate-pulse"><div className="h-20 rounded-3xl bg-slate-200" /><div className="h-56 rounded-3xl bg-white" /></div>
  if (error) return <div className="mx-auto max-w-4xl"><StatePanel description={t(error)} title={t('Bill unavailable')} tone="error" /></div>
  if (!hasTableSession) return <div className="mx-auto max-w-4xl"><StatePanel description={t('Join your table session to view its live bill.')} title={t('No active table session')} /></div>

  return <div className="mx-auto max-w-3xl space-y-5">
    <SectionHeading description={t('Choose how you would like the staff team to prepare your bill. Payment is not required yet.')} eyebrow={t('Table {{number}}', { number: tableNumber })} title={t('Bill summary')} />
    <section className="rounded-2xl border border-slate-100 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-600">{t('Current unpaid table total')}</h2>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-orange-600">{formatCurrency(grandTotal)}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{t('This is the whole table’s unpaid amount, not one person’s bill.')}</p>
      <details className="mt-4 border-t border-slate-100 pt-3">
        <summary className="cursor-pointer text-sm font-semibold">{t('Unpaid order breakdown')}</summary>
        {participants.length > 1 && <ul className="mt-2 divide-y divide-slate-100">{participants.map((participant) => <li className="flex justify-between gap-3 py-3 text-sm" key={participant.sessionId}><span>{participant.isCounterOrder ? t('Counter order') : session?.isSharedTable ? t('Shared table orders') : participant.customerNickname}</span><span className="shrink-0 font-bold tabular-nums">{formatCurrency(participant.grandTotal)}</span></li>)}</ul>}
        <dl className="mt-3 space-y-2 text-sm text-slate-600">
          <div className="flex justify-between"><dt>{t('Subtotal')}</dt><dd>{formatCurrency(subtotal)}</dd></div>
          {serviceCharge > 0 && <div className="flex justify-between"><dt>{t('Service charge')}</dt><dd>{formatCurrency(serviceCharge)}</dd></div>}
          {sst > 0 && <div className="flex justify-between"><dt>{t('SST')}</dt><dd>{formatCurrency(sst)}</dd></div>}
          <div className="flex justify-between border-t border-slate-100 pt-2 font-bold"><dt>{t('Grand total')}</dt><dd>{formatCurrency(grandTotal)}</dd></div>
        </dl>
      </details>
    </section>
    <section className="rounded-2xl border border-slate-100 bg-white p-5">
      <h2 className="font-bold">{t('How would you like the bill?')}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          ['table', 'One table bill', 'One person pays the full table amount.'],
          ['split', 'Split bill', 'Select dishes and quantities with the cashier.'],
        ].map(([value, label, description]) => <button aria-pressed={billMode === value} className={`rounded-xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 ${billMode === value ? 'border-orange-500 bg-orange-50' : 'border-slate-200'}`} disabled={isRequesting} key={value} onClick={() => setBillMode(value)} type="button"><span className="flex justify-between gap-3 font-bold"><span>{t(label)}</span><span aria-hidden="true">{billMode === value ? '✓' : '○'}</span></span><span className="mt-2 block text-sm leading-5 text-slate-600">{t(description)}</span></button>)}
      </div>
      <p className="mt-4 text-sm text-slate-600">{billMode === 'split' ? t('Please choose your dishes with the cashier. This request does not make a payment.') : t('Staff will prepare one bill for the full table.')}</p>
      {requestError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(requestError)}</p>}
      <Button className="mt-4 w-full py-3" disabled={isRequesting || !participants.some((participant) => participant.paymentStatus === 'pending')} onClick={handleRequestBill}>{isRequesting ? t('Requesting bill...') : billMode === 'table' ? t('Request table bill') : t('Request split bill')}</Button>
    </section>
  </div>
}

export default Bill
