import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../common/Button'
import SoldOutButton from './SoldOutButton'
import useAddToCartFeedback from '../../hooks/useAddToCartFeedback'
import { formatCurrency } from '../../utils/currency'
import { getImageSource, useImageFallback } from '../../utils/image'
import { isMenuItemOrderable } from '../../services/orderService'
import { menuDescription } from '../../utils/menuDescription'

function FoodCard({ categoryName = '', food, compact = false }) {
  const { t } = useCustomerLanguage()
  const navigate = useNavigate()
  const hasOptions = (food.optionGroups?.length ?? 0) > 0
  const { addItem, isAdded, isAdding, isBusy } = useAddToCartFeedback()
  const isUnavailable = !isMenuItemOrderable(food)
  const description = menuDescription(food.description)

  return <article data-menu-item={food.id} className={`interactive-card group flex flex-col overflow-hidden ${compact ? '' : 'h-full'}`}>
    <Link aria-label={t('View {{name}}', { name: food.name })} className="relative block overflow-hidden bg-slate-100" to={`/menu/${food.id}`}>
      <img alt={food.name || t("Menu item")} className={`w-full object-cover transition duration-500 ease-out ${isUnavailable ? 'grayscale' : 'group-hover:scale-105'} ${compact ? 'h-28' : 'aspect-[4/3]'}`} decoding="async" loading="lazy" onError={useImageFallback} src={getImageSource(food.imageUrl)} />
      <div className="absolute inset-x-0 top-0 flex flex-wrap gap-2 p-3">
        {food.isPopular && <span className="rounded-full bg-orange-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">{t("Popular")}</span>}
        {isUnavailable && <span className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-extrabold text-white shadow-sm">{t("Sold out")}</span>}
      </div>
    </Link>
    <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-5">
      <div className="min-w-0">
        <Link className="block break-words text-sm font-bold leading-5 text-slate-900 transition hover:text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400 sm:text-base" to={`/menu/${food.id}`}>{food.name}</Link>
        <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500">{categoryName || t('Menu item')}</p>
        <p className="mt-2 text-base font-extrabold text-orange-600">{formatCurrency(food.price)}</p>
      </div>
      {description && <p className="mb-3 mt-2 line-clamp-2 text-xs leading-5 text-slate-500 sm:mb-5 sm:mt-3 sm:text-sm">{description}</p>}
      <div className="mt-auto border-t border-slate-100 pt-3 sm:pt-4">
        {isUnavailable ? <SoldOutButton className="w-full" /> : <Button className="min-h-11 w-full px-2 text-sm" disabled={isBusy} onClick={() => hasOptions ? navigate(`/menu/${food.id}`) : addItem(food)}>{isAdding ? t("Adding...") : isAdded ? t("✔ Added") : hasOptions ? t("Choose options") : t("Add to Cart")}</Button>}
      </div>
    </div>
  </article>
}

export default FoodCard
