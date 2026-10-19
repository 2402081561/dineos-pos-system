import OrderTypeBadge from '../../components/common/OrderTypeBadge'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useState } from 'react'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useCustomerSession from '../../hooks/useCustomerSession'
import useTableSummary from '../../hooks/useTableSummary'
import useToast from '../../hooks/useCustomerToast'
import { createCustomerServiceRequest } from '../../services/customerApi'
import { formatCurrency } from '../../utils/currency'

function Bill() {
  const { t } = useCustomerLanguage()
  const { session } = useCustomerSession()
  const { currentSessionId, error, grandTotal, hasTableSession, isLoading, participants, tableNumber } = useTableSummary()
  const { showToast } = useToast()
  const [isRequesting, setIsRequesting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [billMode, setBillMode] = useState('table')
  const ownParticipant = participants.find((participant) => participant.sessionId === currentSessionId)
  const selectedAmount = billMode === 'table' ? grandTotal : null

  async function handleRequestBill() {
    if (!session || isRequesting) return
    try {
      setIsRequesting(true)
      setRequestError('')
      const result = await createCustomerServiceRequest(session.sessionId, 'requestBill', {
        billMode,
        requestedAmount: selectedAmount,
        tableSessionId: session.tableSessionId,
      })
      showToast(result.duplicate ? 'You already have a pending bill request.' : billMode === 'table' ? 'Table bill request sent.' : 'Split bill request sent.')
    } catch (firebaseError) {
      console.error('[Bill] Failed to request bill:', firebaseError)
      setRequestError(firebaseError.message || 'We could not send your bill request. Please try again.')
      showToast('Your bill request could not be sent. Please try again.', 'error')
    } finally {
      setIsRequesting(false)
    }
  }

  if (isLoading) return <div className="mx-auto max-w-4xl space-y-5 animate-pulse"><div className="h-20 rounded-3xl bg-slate-200" /><div className="h-56 rounded-3xl bg-white" /></div>
  if (error) return <div className="mx-auto max-w-4xl"><StatePanel description={t(error)} title={t("Bill unavailable")} tone="error" /></div>
  if (!hasTableSession) return <div className="mx-auto max-w-4xl"><StatePanel description={t("Join your table session to view its live bill.")} title={t("No active table session")} /></div>

  return <div className="mx-auto max-w-4xl space-y-7"><SectionHeading description={t("Choose how you would like the staff team to prepare your bill. Payment is not required yet.")} eyebrow={t('Table {{number}}', { number: tableNumber })} title={t("Bill summary")} /><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"><section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-bold">{t("Table totals")}</h2><p className="mt-1 text-sm text-slate-500">{t("Unpaid items are updated in real time. Shared table orders may belong to more than one diner.")}</p></div><div className="divide-y divide-slate-100">{participants.map((participant) => <div className="flex items-center justify-between gap-4 p-5" key={participant.sessionId}><div className="min-w-0"><p className="truncate font-semibold text-slate-800">{participant.customerNickname}{participant.isCounterOrder && <span className="ml-2 text-xs font-bold text-slate-500">{t("Counter order")}</span>}{participant.sessionId === currentSessionId && <span className="ml-2 text-xs font-bold text-orange-600">{t("You")}</span>}</p><p className="mt-1 text-xs text-slate-400">{t("Payment pending")}</p><div className="mt-1 flex flex-wrap gap-1">{Number(participant.takeAwayOrderCount) > 0 && <OrderTypeBadge orderType="take_away" />}{Number(participant.dineInOrderCount) > 0 && <OrderTypeBadge orderType="dine_in" />}</div></div><p className="whitespace-nowrap text-lg font-extrabold text-orange-600">{formatCurrency(participant.grandTotal)}</p></div>)}</div>{ownParticipant && <div className="border-t border-orange-100 bg-orange-50/50 p-5"><p className="text-sm font-bold text-slate-900">{t("Shared session total")}</p><div className="mt-4 space-y-2 text-sm"><p className="flex justify-between text-slate-600"><span>{t("Subtotal")}</span><span>{formatCurrency(ownParticipant.subtotal)}</span></p>{Number(ownParticipant.serviceCharge) > 0 && <p className="flex justify-between text-slate-600"><span>{t("Service charge")}</span><span>{formatCurrency(ownParticipant.serviceCharge)}</span></p>}{Number(ownParticipant.sst) > 0 && <p className="flex justify-between text-slate-600"><span>{t("SST")}</span><span>{formatCurrency(ownParticipant.sst)}</span></p>}<p className="flex justify-between border-t border-orange-100 pt-3 font-bold text-slate-900"><span>{t("Grand total")}</span><span className="text-orange-600">{formatCurrency(ownParticipant.grandTotal)}</span></p></div></div>}</section><aside className="h-fit rounded-3xl border border-orange-100 bg-white p-6 shadow-[0_14px_34px_rgb(15,23,42,0.07)]"><p className="eyebrow">{t("Payment preference")}</p><h2 className="mt-1 text-xl font-bold">{t("How would you like the bill?")}</h2><div className="mt-5 space-y-3"><button aria-pressed={billMode === 'table'} className={`w-full rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-orange-300 ${billMode === 'table' ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-200' : 'border-slate-200 hover:border-orange-200 hover:bg-orange-50/50'}`} onClick={() => setBillMode('table')} type="button"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-900">{t("One table bill")}</p><p className="mt-1 text-xs leading-5 text-slate-500">{t("One person pays the full table amount.")}</p></div><span className="text-lg">{billMode === 'table' ? '✓' : '○'}</span></div><p className="mt-3 text-lg font-extrabold text-orange-600">{formatCurrency(grandTotal)}</p></button><button aria-pressed={billMode === 'split'} className={`w-full rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-orange-300 ${billMode === 'split' ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-200' : 'border-slate-200 hover:border-orange-200 hover:bg-orange-50/50'}`} onClick={() => setBillMode('split')} type="button"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-900">{t("Split bill")}</p><p className="mt-1 text-xs leading-5 text-slate-500">{t("Select dishes and quantities with the cashier.")}</p></div><span className="text-lg">{billMode === 'split' ? '✓' : '○'}</span></div><p className="mt-3 text-lg font-extrabold text-orange-600">{t('Choose items at the cashier')}</p></button></div><div className="mt-5 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("Selected amount")}</p><p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">{billMode === 'table' ? formatCurrency(selectedAmount) : t('Choose items at the cashier')}</p><p className="mt-2 text-xs leading-5 text-slate-500">{billMode === 'table' ? t("Staff will prepare one bill for the full table.") : t("Staff will help you choose which items to pay for.")}</p></div>{requestError && <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{t(requestError)}</p>}<Button className="mt-5 w-full py-3" disabled={isRequesting || !participants.some((participant) => participant.paymentStatus === 'pending')} onClick={handleRequestBill}>{isRequesting ? t("Requesting bill...") : billMode === 'table' ? t("Request table bill") : t("Request split bill")}</Button><p className="mt-3 text-center text-xs text-slate-400">{t("A staff member will be notified of your selection.")}</p></aside></div></div>
}

export default Bill
