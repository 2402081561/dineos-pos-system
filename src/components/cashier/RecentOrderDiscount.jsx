import { useState } from 'react'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import DiscountControl from './DiscountControl'
import Button from '../common/Button'
import { recentOrderDiscountPreview } from '../../utils/recentOrderDiscount'
import { formatCurrency } from '../../utils/currency'

export default function RecentOrderDiscount({ order, floor, onContinue, onCancel }) {
  const { t } = useCustomerLanguage()
  const [discount, setDiscount] = useState({ type: 'percentage', value: '0' })
  let result, error = ''
  try { result = recentOrderDiscountPreview(order, floor, discount) }
  catch (failure) { error = failure.message || 'Enter a valid discount.' }
  return <form className="space-y-5 p-5" onSubmit={(event) => {
    event.preventDefault()
    // Revalidate against the latest floor props when continuing, not an old preview.
    try { const current = recentOrderDiscountPreview(order, floor, discount); onContinue(current.payment, { discount: { ...discount } }) }
    catch { /* The current render displays the validation error. */ }
  }}>
    <p className="text-sm font-semibold">{order?.isWalkIn ? t('Walk-in') : t('Table {{number}}', { number: order?.tableNumber ?? '—' })} · {t(order?.isWalkIn ? 'Whole bill' : 'Whole table')}</p>
    <p className="text-xs leading-5 text-slate-500">{t('This discount applies to the remaining table bill and takes effect when payment is confirmed.')}</p>
    <DiscountControl discount={discount} onChange={setDiscount} preview={result?.preview} error={error}/>
    {result && <dl className="space-y-3 border-t border-slate-100 pt-4 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">{t('Remaining bill')}</dt><dd className="tabular-nums">{formatCurrency(result.original.grandTotal)}</dd></div><div className="flex justify-between gap-3 text-lg font-bold"><dt>{t('Amount to collect')}</dt><dd className="tabular-nums">{formatCurrency(result.discounted.grandTotal)}</dd></div></dl>}
    <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={onCancel}>{t('Cancel')}</Button><Button type="submit" disabled={Boolean(error) || !result}>{t('Continue to payment')}</Button></div>
  </form>
}
