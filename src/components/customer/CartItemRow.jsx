import OrderTypeSelector from '../common/OrderTypeSelector'
import OptionSummary from '../common/OptionSummary'
import QuantitySelector from './QuantitySelector'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { formatCurrency } from '../../utils/currency'
import { getImageSource, useImageFallback } from '../../utils/image'

export default function CartItemRow({ item, disabled, onRemove, onQuantity, onOrderType, onEdit, takeawayOnly = false }) {
  const { t } = useCustomerLanguage()
  return <article className="customer-cart-row">
    <img alt={item.name || t('Cart item')} className="customer-cart-row-image" decoding="async" loading="lazy" onError={useImageFallback} src={getImageSource(item.imageUrl)} />
    <div className="min-w-0">
      <div className="customer-cart-row-heading">
        <h2 className="min-w-0 break-words text-sm font-bold leading-6 text-slate-900 sm:text-base">{item.name || t('Menu item')}</h2>
        <p className="whitespace-nowrap text-sm font-bold tabular-nums text-slate-900">{item.displayPrice === null ? '—' : formatCurrency(item.displayPrice * item.displayQuantity)}</p>
      </div>
      {item.displayPrice !== null && <p className="mt-1 text-xs text-slate-500">{t('{{price}} each', { price: formatCurrency(item.displayPrice) })}</p>}
      {item.issue && <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">{t(item.issue)}</p>}
      <OptionSummary item={{ ...item, orderType: undefined }} />
      {item.specialInstructions && <p className="mt-2 break-words text-xs leading-5 text-slate-500">{t('Note:')}{' '}{item.specialInstructions}</p>}
      {!takeawayOnly && <div className="customer-cart-dining"><OrderTypeSelector compact value={item.orderType ?? 'dine_in'} onChange={(type) => onOrderType(type)} disabled={disabled} /></div>}
      {!takeawayOnly && item.displayQuantity > 1 && <button className="mt-1 min-h-11 rounded-lg px-1 text-xs font-semibold text-orange-700 underline underline-offset-4 disabled:opacity-50" type="button" disabled={disabled} onClick={() => onOrderType(item.orderType === 'take_away' ? 'dine_in' : 'take_away', 1)}>{t(item.orderType === 'take_away' ? 'Dine in 1 separately' : 'Pack 1 separately')}</button>}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3"><button aria-label={t('Edit {{name}}', { name: item.name || t('Menu item') })} className="min-h-11 rounded-lg px-1 py-2 text-xs font-semibold text-orange-700 focus-visible:outline-orange-500 disabled:opacity-50" disabled={disabled || !onEdit} onClick={onEdit} type="button">{t('Edit')}</button><button aria-label={t('Remove {{name}} from cart', { name: item.name || t('Menu item') })} className="min-h-11 rounded-lg px-1 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 focus-visible:outline-orange-500 disabled:opacity-50" disabled={disabled} onClick={onRemove} type="button">{t('Remove')}</button></div>
        <QuantitySelector disabled={disabled || Boolean(item.issue)} onDecrease={() => onQuantity(Math.max(1, item.displayQuantity - 1))} onIncrease={() => onQuantity(item.displayQuantity + 1)} quantity={item.displayQuantity} />
      </div>
    </div>
  </article>
}
