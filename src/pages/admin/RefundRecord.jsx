import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSupabaseRefundEvents } from '../../services/adminApiService'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/common/Button'

export default function RefundRecord() {
  const { refundNumber } = useParams(), { t, formatDate } = useCustomerLanguage()
  const [record, setRecord] = useState(null), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    getSupabaseRefundEvents().then((data) => { if (active) { const found = data.refunds.find((row) => row.refundNumber === refundNumber); setRecord(found); if (!found) setError(data.refundsAvailable ? 'Refund record not found.' : 'Refund records are not available until the database upgrade is applied.') } }).catch((error) => { if (active) setError(error.message) })
    return () => { active = false }
  }, [refundNumber])
  if (error) return <p role="alert">{t(error)}</p>
  if (!record || record.refundNumber !== refundNumber) return <p>{t('Loading page…')}</p>
  return <div className="receipt-preview"><div className="receipt-toolbar no-print"><Button onClick={() => window.print()}>{t('Print / Save PDF')}</Button><Link to="/admin/refunds">{t('Close')}</Link></div>
    <article className="receipt-print thermal-receipt mx-auto max-w-sm space-y-4 bg-white p-5 text-sm text-black">
      <header className="text-center"><h1 className="font-bold">{record.restaurantName}</h1><h2 className="mt-3 text-lg font-bold">{t('Refund record')}</h2></header>
      <p className="break-all font-mono text-xs">{record.refundNumber}</p><p>{t('Original receipt')}: {record.receiptNumber}</p><p>{formatDate(record.createdAt)}</p><p>{t('Administrator')}: {record.actorName}</p>
      <div className="border-y border-dashed py-4"><p className="flex justify-between text-lg font-bold"><span>{t('Refund amount')}</span><span>{formatCurrency(record.amount)}</span></p><p className="mt-2">{t('Refund method')}: {t(record.method)}</p><p className="mt-2 break-words">{t('Refund reason')}: {record.reason}</p><p className="mt-2">{t('Points reversed')}: {record.pointsReversed ?? 0}</p></div>
      <p className="text-xs">{t('Manual record only. Money was returned outside DineOS. This document is not a bank transfer confirmation.')}</p>
    </article>
  </div>
}
