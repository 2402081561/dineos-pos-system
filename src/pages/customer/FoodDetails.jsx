import { useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../../components/common/Button'
import AllergyNotice from '../../components/customer/AllergyNotice'
import FoodDetailsSkeleton from '../../components/customer/FoodDetailsSkeleton'
import QuantitySelector from '../../components/customer/QuantitySelector'
import StatePanel from '../../components/common/StatePanel'
import useAddToCartFeedback from '../../hooks/useAddToCartFeedback'
import useMenuItem from '../../hooks/useMenuItem'
import { formatCurrency } from '../../utils/currency'
import { getImageSource, useImageFallback } from '../../utils/image'
import { estimatePreparationTime } from '../../utils/preparationEstimate'
import { isMenuItemOrderable } from '../../services/orderService'

function FoodDetails() {
  const { itemId } = useParams()
  const { menuItem: food, category, isLoading, error } = useMenuItem(itemId)
  const { addItem, isAdded, isAdding, isBusy } = useAddToCartFeedback()
  const [quantity, setQuantity] = useState(1)
  const [specialInstructions, setSpecialInstructions] = useState('')

  if (isLoading) return <div className="mx-auto max-w-5xl"><FoodDetailsSkeleton /></div>
  if (error) return <div className="mx-auto max-w-5xl"><StatePanel description={error} title="Item unavailable" tone="error" /></div>
  if (!food) return <div className="mx-auto max-w-5xl"><StatePanel description="This menu item may no longer be available." title="Item not found" /></div>

  const price = Number.isFinite(Number(food.price)) ? Number(food.price) : 0
  const totalPrice = price * quantity
  const allergyInfo = food.allergyInformation ?? food.allergyInfo ?? food.allergies ?? food.allergens
  const ingredients = Array.isArray(food.ingredients) ? food.ingredients.filter(Boolean) : []
  const isUnavailable = !isMenuItemOrderable(food)
  const preparationEstimate = estimatePreparationTime(quantity)

  return <div className="mx-auto max-w-5xl pb-28"><div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_16px_45px_rgb(15,23,42,0.08)]"><div className="grid lg:grid-cols-[1.04fr_0.96fr]"><div className="relative min-h-80 overflow-hidden bg-slate-100 lg:min-h-[620px]"><img alt={food.name || 'Menu item'} className="absolute inset-0 h-full w-full object-cover" decoding="async" fetchPriority="high" onError={useImageFallback} src={getImageSource(food.imageUrl)} /><div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-slate-950/45 to-transparent" /><div className="absolute bottom-6 left-6 right-6 flex flex-wrap gap-2"><span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm backdrop-blur">{category?.icon ? `${category.icon} ` : ''}{category?.name ?? 'Uncategorised'}</span>{food.isPopular && <span className="rounded-full bg-orange-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm">Popular choice</span>}</div></div><div className="p-6 sm:p-9"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Chef&apos;s selection</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{food.name || 'Menu item'}</h1></div><span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${isUnavailable ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{isUnavailable ? 'Sold out' : 'Available'}</span></div><p className="mt-5 text-base leading-7 text-slate-500">{food.description || 'No description is available for this item.'}</p><div className="mt-6 flex items-end justify-between rounded-2xl bg-orange-50 p-4"><div><p className="text-xs font-bold uppercase tracking-wide text-orange-700">Price per serving</p><p className="mt-1 text-3xl font-extrabold tracking-tight text-orange-600">RM {price.toFixed(2)}</p></div><span className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-500 shadow-sm">{preparationEstimate.label}</span></div>{isUnavailable && <p className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm font-semibold text-amber-800">This item is currently unavailable and cannot be added to your cart.</p>}{ingredients.length > 0 && <section className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-5"><h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm">⌁</span>Ingredients</h2><p className="mt-3 text-sm leading-6 text-slate-600">{ingredients.join(', ')}</p></section>}<AllergyNotice allergyInfo={allergyInfo} /><div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-6"><div><p className="text-sm font-bold text-slate-900">Quantity</p><p className="mt-1 text-xs text-slate-500">Adjust your serving</p></div><QuantitySelector disabled={isUnavailable} onDecrease={() => setQuantity((currentQuantity) => Math.max(1, currentQuantity - 1))} onIncrease={() => setQuantity((currentQuantity) => currentQuantity + 1)} quantity={quantity} /></div><label className="mt-7 block text-sm font-bold text-slate-900" htmlFor="instruction">Special instructions <span className="font-normal text-slate-400">(optional)</span></label><textarea className="mt-2 min-h-24 w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-sm" disabled={isUnavailable} id="instruction" maxLength="300" onChange={(event) => setSpecialInstructions(event.target.value)} placeholder="No onion, less spicy..." value={specialInstructions} /><div className="mt-5 flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 p-3 text-sm text-orange-900"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm">◷</span><span>Estimated preparation time: <strong>{preparationEstimate.label}</strong><small className="mt-0.5 block text-xs text-orange-700">May vary when the kitchen is busy.</small></span></div></div></div></div><div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgb(15,23,42,0.06)] backdrop-blur sm:px-6"><div className="mx-auto flex max-w-5xl items-center justify-between gap-4"><div><p className="text-xs font-semibold text-slate-500">Total price · {quantity} serving{quantity > 1 ? 's' : ''}</p><p className="text-2xl font-extrabold tracking-tight text-slate-900">{formatCurrency(totalPrice)}</p></div><Button className="min-w-40 py-3.5" disabled={isUnavailable || isBusy} onClick={() => addItem(food, quantity, specialInstructions)}>{isUnavailable ? 'Sold out' : isAdding ? 'Adding...' : isAdded ? '✔ Added' : 'Add to Cart'}</Button></div></div></div>
}

export default FoodDetails
