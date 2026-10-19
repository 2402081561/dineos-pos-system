import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { formatCurrency } from '../../utils/currency'

export default function RefundTotals({ summary }) {
  const { t } = useCustomerLanguage()
  return <section className="my-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
    <h2 className="font-bold">{t('Gross receipts and refunds')}</h2>
    {summary.refundsAvailable ? <><div className="mt-3 flex flex-wrap gap-4"><span>{t('Gross receipts')}: {formatCurrency(summary.grandTotal)}</span><span>{t('Refunded amount')}: {formatCurrency(summary.refundTotal)}</span><strong>{t('Net receipts')}: {formatCurrency(summary.netReceipts)}</strong></div>
      {Object.entries(summary.refundBreakdown ?? {}).map(([method, amount]) => <p className="mt-2 text-xs text-slate-500" key={method}>{t('Refunded amount')} · {t(method)}: {formatCurrency(amount)}</p>)}</> : <p className="mt-2 text-slate-500">{t('Refund totals are unavailable until the database upgrade is applied. Gross receipts are still shown.')}</p>}
    <p className="mt-2 text-xs text-slate-500">{t('Refunds use their recorded date, including refunds of older receipts. Finalized closing snapshots are not rewritten.')}</p>
  </section>
}
