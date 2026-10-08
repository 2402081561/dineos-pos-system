import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { formatCurrency } from '../../utils/currency'

export default function OrderSettlementSummary({ order }) {
  const { t } = useCustomerLanguage()
  if (order.status === 'cancelled') return null
  const paid = Number(order.paidAmount ?? (order.paymentStatus === 'paid' ? order.grandTotal : 0))
  return <section className="my-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
    <p className="flex justify-between gap-3"><span>{t('Paid amount')}</span><strong>{formatCurrency(paid)}</strong></p>
    <p className="flex justify-between gap-3"><span>{t('Remaining amount')}</span><strong>{formatCurrency(Math.max(0, Number(order.grandTotal) - paid))}</strong></p>
    <p className="text-xs text-slate-500">{t('Payment and food handoff are tracked separately.')}</p>
    {(order.items ?? []).map((item, index) => <div className="border-t pt-2" key={item.id ?? index}><p className="font-semibold">{item.name}</p><p className="text-xs text-slate-500">{t(item.orderType === 'take_away' ? 'Collected: {{done}} / {{total}}' : 'Served: {{done}} / {{total}}', { done: item.fulfilledQuantity ?? (order.status === 'served' ? item.quantity : 0), total: item.quantity })}</p></div>)}
  </section>
}
