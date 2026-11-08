import { createPortal } from 'react-dom'
import Button from '../common/Button'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { formatCurrency } from '../../utils/currency'

// Keep fixed controls outside the animated portal main, which can establish
// a containing block and otherwise move viewport-fixed buttons on navigation.
export default function CartCheckoutBar({ total, label, disabled, onSubmit }) {
  const { t } = useCustomerLanguage()
  const content = <section aria-label={t('Submit your order')} className="customer-checkout-bar lg:hidden">
    <div className="flex items-baseline justify-between gap-3 pb-3"><span className="text-sm font-semibold text-slate-600">{t('Grand total')}</span><strong className="text-xl font-extrabold tabular-nums text-orange-600">{total === null ? '—' : formatCurrency(total)}</strong></div>
    <Button className="w-full" disabled={disabled} onClick={onSubmit}>{label}</Button>
  </section>
  return typeof document === 'undefined' ? content : createPortal(content, document.body)
}
