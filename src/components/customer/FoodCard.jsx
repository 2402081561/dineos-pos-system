import { Link } from 'react-router-dom'
import Button from '../common/Button'
import useAddToCartFeedback from '../../hooks/useAddToCartFeedback'
import { formatCurrency } from '../../utils/currency'
import { getImageSource, useImageFallback } from '../../utils/image'
import { isMenuItemOrderable } from '../../services/orderService'

function FoodCard({ categoryName = 'Menu item', food, compact = false }) {
  const { addItem, isAdded, isAdding, isBusy } = useAddToCartFeedback()
  const isUnavailable = !isMenuItemOrderable(food)

  return <article className={`interactive-card group overflow-hidden ${compact ? '' : 'h-full'}`}>
    <Link aria-label={`View ${food.name}`} className="relative block overflow-hidden bg-slate-100" to={`/menu/${food.id}`}>
      <img alt={food.name || 'Menu item'} className={`w-full object-cover transition duration-500 ease-out group-hover:scale-105 ${compact ? 'h-28' : 'aspect-[4/3]'}`} decoding="async" loading="lazy" onError={useImageFallback} src={getImageSource(food.imageUrl)} />
      <div className="absolute inset-x-0 top-0 flex flex-wrap gap-2 p-3">
        {food.isPopular && <span className="rounded-full bg-orange-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">Popular</span>}
        {isUnavailable && <span className="rounded-full bg-slate-900/85 px-2.5 py-1 text-[11px] font-bold text-white">Sold out</span>}
      </div>
    </Link>
    <div className="flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><Link className="line-clamp-1 text-base font-bold text-slate-900 transition hover:text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400" to={`/menu/${food.id}`}>{food.name}</Link><p className="mt-1 text-xs font-semibold text-orange-600">{categoryName}</p></div>
        <span className="whitespace-nowrap text-base font-extrabold text-orange-600">{formatCurrency(food.price)}</span>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-5 text-slate-500">{food.description || 'No description is available for this item.'}</p>
      <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
        {isUnavailable && <span className="mr-auto text-xs font-medium text-slate-400">Currently unavailable</span>}
        <Button className="shrink-0 px-3 py-2 text-xs" disabled={isUnavailable || isBusy} onClick={() => addItem(food)}>{isAdding ? 'Adding...' : isAdded ? '✔ Added' : 'Add to Cart'}</Button>
      </div>
    </div>
  </article>
}

export default FoodCard
