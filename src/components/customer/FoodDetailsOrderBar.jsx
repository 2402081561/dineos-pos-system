import { createPortal } from 'react-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import Button from '../common/Button'
import SoldOutButton from './SoldOutButton'
import { formatCurrency } from '../../utils/currency'

export default function FoodDetailsOrderBar({ quantity, totalPrice, disabled, isUnavailable, isAdding, isAdded, onAdd }) {
  const { t } = useCustomerLanguage()
  // Keep outside the animated page: a transformed ancestor traps position:fixed.
  return createPortal(<div aria-label={t('Order actions')} className="customer-food-order-bar fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(15,23,42,0.06)] sm:px-6 lg:left-56">
    <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
      <div className="min-w-0"><p className="text-xs font-semibold text-slate-500">{t('Total · Qty {{count}}', { count: quantity })}</p><p className="break-words text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">{formatCurrency(totalPrice)}</p></div>
      {isUnavailable ? <SoldOutButton className="min-w-32 shrink-0 sm:min-w-40" /> : <Button className="min-h-11 min-w-32 shrink-0 py-3 sm:min-w-40" disabled={disabled} onClick={onAdd}>{isAdding ? t('Adding...') : isAdded ? t('✔ Added') : t('Add to Cart')}</Button>}
    </div>
  </div>, document.body)
}
