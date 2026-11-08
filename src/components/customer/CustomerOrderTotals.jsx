import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { formatCurrency } from '../../utils/currency'

// Use this order's stored charges, never today's shop settings for old orders.
export default function CustomerOrderTotals({ order }) {
  const { t } = useCustomerLanguage()
  const discount = Number(order.discountAmount ?? order.discount ?? 0)
  return <dl className="space-y-3 border-t border-slate-100 p-4 text-sm sm:p-5">
    <div className="flex justify-between gap-3 text-slate-500"><dt>{t('Subtotal')}</dt><dd className="tabular-nums">{formatCurrency(order.subtotal)}</dd></div>
    {Number(order.serviceCharge) > 0 && <div className="flex justify-between gap-3 text-slate-500"><dt>{t('Service charge')}</dt><dd className="tabular-nums">{formatCurrency(order.serviceCharge)}</dd></div>}
    {Number(order.sst) > 0 && <div className="flex justify-between gap-3 text-slate-500"><dt>{t('SST')}</dt><dd className="tabular-nums">{formatCurrency(order.sst)}</dd></div>}
    {discount > 0 && <div className="flex justify-between gap-3 text-slate-500"><dt>{t('Discount')}</dt><dd className="tabular-nums">−{formatCurrency(discount)}</dd></div>}
    <div className="flex items-baseline justify-between gap-3 border-t border-slate-100 pt-4 font-bold"><dt>{t('Grand total')}</dt><dd className="text-xl font-extrabold tabular-nums text-orange-600">{formatCurrency(order.grandTotal)}</dd></div>
  </dl>
}
