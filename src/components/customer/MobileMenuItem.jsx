import { Link, useNavigate } from 'react-router-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import useCart from '../../hooks/useCart'
import useAddToCartFeedback from '../../hooks/useAddToCartFeedback'
import { isMenuItemOrderable } from '../../services/orderService'
import { formatCurrency } from '../../utils/currency'
import { getImageSource, useImageFallback } from '../../utils/image'
import { menuDescription } from '../../utils/menuDescription'

export default function MobileMenuItem({ food }) {
  const { t } = useCustomerLanguage()
  const navigate = useNavigate()
  const { cartItems = [], updateQuantity, isCartLocked } = useCart()
  const { addItem, isBusy, isAdding } = useAddToCartFeedback()
  const unavailable = !isMenuItemOrderable(food)
  const hasOptions = (food.optionGroups?.length ?? 0) > 0
  const lines = cartItems.filter((item) => item.menuItemId === food.id)
  const quantity = lines.reduce((sum, item) => sum + item.quantity, 0)
  const description = menuDescription(food.description)

  function decrease() {
    if (isCartLocked || isBusy || !quantity) return
    const line = lines[0]
    // Never silently remove a takeaway portion, custom note or configured item.
    if (lines.length !== 1 || hasOptions || line.specialInstructions || line.selections?.length || (line.orderType ?? 'dine_in') !== 'dine_in') {
      navigate('/cart')
      return
    }
    updateQuantity(line.cartItemId, line.quantity - 1)
  }

  return <article className="mobile-menu-item" data-menu-item={food.id}>
    <Link aria-label={t('View {{name}}', { name: food.name })} className="relative block self-start overflow-hidden rounded-xl bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" to={`/menu/${food.id}`}>
      <img alt={food.name} className={`aspect-square w-full object-cover ${unavailable ? 'grayscale' : ''}`} decoding="async" loading="lazy" onError={useImageFallback} src={getImageSource(food.imageUrl)}/>
      {food.isPopular && !unavailable && <span className="absolute inset-x-0 bottom-0 bg-orange-600/95 py-0.5 text-center text-[10px] font-bold text-white">{t('Popular')}</span>}
    </Link>
    <div className="min-w-0 self-start">
      <Link className="block break-words text-[14px] font-bold leading-[1.45] text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" to={`/menu/${food.id}`}>{food.name}</Link>
      {description && <p className="mt-1 line-clamp-2 break-words text-xs leading-[1.45] text-slate-500">{description}</p>}
    </div>
    <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-2" aria-live="polite" aria-atomic="true">
      <span className="whitespace-nowrap text-[15px] font-extrabold tabular-nums text-slate-900">{formatCurrency(food.price)}</span>
      {unavailable ? <span className="rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-bold text-slate-500">{t('Sold out')}</span> : hasOptions ? <button aria-label={t('Choose options for {{name}}', { name: food.name })} className="min-h-11 rounded-full border border-orange-200 px-3 text-xs font-bold text-orange-700 disabled:opacity-40" disabled={isBusy} onClick={() => navigate(`/menu/${food.id}`)} type="button">{t('Choose options')}</button> : <div className="flex shrink-0 items-center gap-0.5">
        {quantity > 0 && <><button aria-label={t('Decrease {{name}}', { name: food.name })} className="mobile-menu-quantity-button border border-orange-200 bg-white text-orange-700 disabled:opacity-40" disabled={isCartLocked || isBusy} onClick={decrease} type="button">−</button><span aria-label={t('In cart: {{count}}', { count: quantity })} className="min-w-5 text-center text-sm font-bold tabular-nums">{quantity}</span></>}
        <button aria-label={t('Add one {{name}}', { name: food.name })} aria-busy={isAdding} className="mobile-menu-quantity-button bg-orange-600 text-white shadow-sm disabled:opacity-40" disabled={isBusy} onClick={() => addItem(food)} type="button">{isAdding ? <span className="text-base">…</span> : '+'}</button>
      </div>}
    </div>
  </article>
}
