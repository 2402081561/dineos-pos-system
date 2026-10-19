import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSupabaseReceiptRefunds } from '../../services/adminApiService'
import { subscribePoll } from '../../utils/pollSubscription'
import useAdminAuth from '../../hooks/useAdminAuth'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { formatCurrency } from '../../utils/currency'

export default function ReceiptRefundSummary({ receiptNumber }) {
  const { authUser } = useAdminAuth(), { t, formatDate } = useCustomerLanguage()
  const [state, setState] = useState(null)
  useEffect(() => subscribePoll(() => getSupabaseReceiptRefunds(receiptNumber),
    (data) => setState({ data, error: '' }), (error) => setState({ data: null, error: error.message }), 15000), [receiptNumber])
  if (!state) return null
  return <section className="no-print mx-auto mb-4 max-w-lg rounded-xl bg-white p-4 text-sm">
    {state.error ? <p className="text-slate-500">{t(state.error)}</p> : <><p>{t('Original payment')}: {formatCurrency(state.data.amount)}</p><p className="mt-1">{t('Refunded amount')}: {formatCurrency(state.data.refundedAmount)} · {t('Refundable amount')}: {formatCurrency(state.data.refundableAmount)}</p>
      {state.data.refunds.map((record) => <p key={record.refundNumber} className="mt-2 break-words text-xs">{formatDate(record.createdAt)} · {formatCurrency(record.amount)} · {record.reason}</p>)}
      {authUser?.role === 'admin' && Number(state.data.refundableAmount) > 0 && <Link className="mt-3 inline-block font-bold text-orange-700 underline" to={`/admin/refunds?receipt=${encodeURIComponent(receiptNumber)}`}>{t('Record refund')}</Link>}
      <p className="mt-2 text-xs text-slate-500">{t('The original receipt is preserved. Refunds have separate records.')}</p></>}
  </section>
}
