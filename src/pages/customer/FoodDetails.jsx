import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import FoodDetailsOrderBar from '../../components/customer/FoodDetailsOrderBar'
import AllergyNotice from '../../components/customer/AllergyNotice'
import FoodDetailsSkeleton from '../../components/customer/FoodDetailsSkeleton'
import QuantitySelector from '../../components/customer/QuantitySelector'
import StatePanel from '../../components/common/StatePanel'
import useAddToCartFeedback from '../../hooks/useAddToCartFeedback'
import useMenuItem from '../../hooks/useMenuItem'
import { getImageSource, useImageFallback } from '../../utils/image'
import usePreparationEstimate from '../../hooks/usePreparationEstimate'
import { isMenuItemOrderable } from '../../services/orderService'
import OptionSelector from '../../components/common/OptionSelector'
import { resolveOptions, roundMoney } from '../../../server/src/posRules'
import useShopSettings from '../../hooks/useShopSettings'
import OrderTypeSelector from '../../components/customer/CustomerOrderTypeSelector'
import { menuDescription } from '../../utils/menuDescription'

function FoodDetailsContent() {
  const { t } = useCustomerLanguage()
  const { itemId } = useParams()
  const { menuItem: food, category, isLoading, error } = useMenuItem(itemId)
  const { addItem, isAdded, isAdding, isBusy } = useAddToCartFeedback()
  const { settings, isLoading: settingsLoading, error: settingsError } = useShopSettings()
  const [selections, setSelections] = useState([])
  const [orderType, setOrderType] = useState('dine_in')
  const [quantity, setQuantity] = useState(1)
  const liveEstimate = usePreparationEstimate(quantity)
  const [specialInstructions, setSpecialInstructions] = useState('')

  if (isLoading) return <div className="mx-auto max-w-5xl"><FoodDetailsSkeleton /></div>
  if (error) return <div className="mx-auto max-w-5xl"><StatePanel description={t(error)} title={t("Item unavailable")} tone="error" /></div>
  if (!food) return <div className="mx-auto max-w-5xl"><StatePanel description={t("This menu item may no longer be available.")} title={t("Item not found")} /></div>

  let optionResult, optionError = ''
  try { optionResult = resolveOptions(food.optionGroups ?? [], selections) } catch (error) { optionError = error.message }
  const price = roundMoney(Number(food.price) + (optionResult?.extraPrice ?? 0))
  const orderingBlocked = settingsLoading || settingsError || !settings.isAcceptingOrders
  const totalPrice = price * quantity
  const allergyInfo = food.allergyInformation ?? food.allergyInfo ?? food.allergies ?? food.allergens
  const ingredients = Array.isArray(food.ingredients) ? food.ingredients.filter(Boolean) : []
  const isUnavailable = !isMenuItemOrderable(food)
  const description = menuDescription(food.description)
  const preparationEstimate = liveEstimate ?? { label: 'Estimate unavailable' }

  return <div className="mx-auto max-w-5xl pb-[calc(7rem+env(safe-area-inset-bottom))]"><div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_16px_45px_rgb(15,23,42,0.08)]"><div className="grid lg:grid-cols-[1.04fr_0.96fr]"><div className="relative min-h-80 overflow-hidden bg-slate-100 lg:min-h-[620px]"><img alt={food.name || t("Menu item")} className="absolute inset-0 h-full w-full object-cover" decoding="async" fetchPriority="high" onError={useImageFallback} src={getImageSource(food.imageUrl)} /><div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-slate-950/45 to-transparent" /><div className="absolute bottom-6 left-6 right-6 flex flex-wrap gap-2"><span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm backdrop-blur">{category?.icon ? `${category.icon} ` : ''}{category?.name ?? t("Uncategorised")}</span>{food.isPopular && <span className="rounded-full bg-orange-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm">{t("Popular choice")}</span>}</div></div><div className="p-6 sm:p-9"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h1 className="min-w-0 break-words text-2xl font-extrabold leading-8 tracking-tight text-slate-900 sm:text-4xl">{food.name || t("Menu item")}</h1></div>{isUnavailable && <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500">{t("Sold out")}</span>}</div>{description && <p className="mt-5 text-base leading-7 text-slate-500">{description}</p>}<div className="mt-6 flex items-end justify-between rounded-2xl bg-orange-50 p-4"><div><p className="text-xs font-bold uppercase tracking-wide text-orange-700">{t("Price")}</p><p className="mt-1 text-3xl font-extrabold tracking-tight text-orange-600">RM {price.toFixed(2)}</p></div><span className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-500 shadow-sm">{t(preparationEstimate.label)}</span></div>{isUnavailable && <p className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm font-semibold text-amber-800">{t("This item is currently unavailable and cannot be added to your cart.")}</p>}{ingredients.length > 0 && <section className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-5"><h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm">⌁</span>{t("Ingredients")}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{ingredients.join(', ')}</p></section>}<AllergyNotice allergyInfo={allergyInfo} /><div className="mt-5"><OptionSelector groups={food.optionGroups} selections={selections} onChange={setSelections} disabled={isUnavailable || isBusy} /></div>{optionError && <p className="mt-2 text-xs text-orange-700">{t(optionError)}</p>}{orderingBlocked && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t(settings.orderingMessage || settingsError || "Checking ordering availability...")}</p>}<div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-6"><div><p className="text-sm font-bold text-slate-900">{t("Quantity")}</p></div><QuantitySelector disabled={isUnavailable} onDecrease={() => setQuantity((currentQuantity) => Math.max(1, currentQuantity - 1))} onIncrease={() => setQuantity((currentQuantity) => Math.min(50, currentQuantity + 1))} quantity={quantity} /></div><OrderTypeSelector value={orderType} onChange={setOrderType} disabled={isUnavailable || isBusy} /><label className="mt-7 block text-sm font-bold text-slate-900" htmlFor="instruction">{t("Special instructions")}{' '}<span className="font-normal text-slate-400">{t("(optional)")}</span></label><textarea className="mt-2 min-h-24 w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-sm" disabled={isUnavailable} id="instruction" maxLength="300" onChange={(event) => setSpecialInstructions(event.target.value)} placeholder={t("No onion, less spicy...")} value={specialInstructions} /><div className="mt-5 flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 p-3 text-sm text-orange-900"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm">◷</span><span>{t("Estimated preparation time:")}{' '}<strong>{t(preparationEstimate.label)}</strong><small className="mt-0.5 block text-xs text-orange-700">{t("May vary when the kitchen is busy.")}</small></span></div></div></div></div><FoodDetailsOrderBar quantity={quantity} totalPrice={totalPrice} disabled={isUnavailable || isBusy || Boolean(optionError) || Boolean(orderingBlocked)} isUnavailable={isUnavailable} isAdding={isAdding} isAdded={isAdded} onAdd={() => addItem(food, quantity, specialInstructions, selections, orderType)} /></div>
}

function FoodDetails() {
  const { itemId } = useParams()
  return <FoodDetailsContent key={itemId} />
}

export default FoodDetails
