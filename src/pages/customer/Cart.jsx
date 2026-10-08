import OrderTypeBadge from '../../components/common/OrderTypeBadge'
import { summarizeOrderType } from '../../../server/src/orderType'
import OrderTypeSelector from '../../components/common/OrderTypeSelector'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../../components/common/Button'
import QuantitySelector from '../../components/customer/QuantitySelector'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useCart from '../../hooks/useCart'
import useCustomerSession from '../../hooks/useCustomerSession'
import useToast from '../../hooks/useCustomerToast'
import { createOrder, getCartValidationIssues } from '../../services/orderService'
import { getPublicMenu } from '../../services/customerApi'
import { formatCurrency } from '../../utils/currency'
import { getImageSource, useImageFallback } from '../../utils/image'
import OptionSummary from '../../components/common/OptionSummary'
import useShopSettings from '../../hooks/useShopSettings'
import { orderAmounts, resolveOptions } from '../../../server/src/posRules'

function Cart() {
  const { t } = useCustomerLanguage()
  const { config, settings, isLoading: settingsLoading, error: settingsError } = useShopSettings()
  const { cartItems, removeFromCart, updateQuantity, clearCart, changeItemOrderType } = useCart()
  const { session, updateSessionNickname } = useCustomerSession()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const orderType = summarizeOrderType(cartItems.map((item) => ({ ...item, orderType: item.orderType ?? 'dine_in' })))
  function changeType(item, type, quantity) {
    const error = changeItemOrderType(item.cartItemId, type, quantity)
    if (error) showToast(error, 'error')
  }
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [menuItems, setMenuItems] = useState([])
  const [isMenuLoading, setIsMenuLoading] = useState(true)
  const [menuError, setMenuError] = useState('')
  const [customerNickname, setCustomerNickname] = useState(() => session?.customerNickname === 'Guest' ? '' : session?.customerNickname ?? '')
  const isSubmittingRef = useRef(false)
  const orderRequest = useRef({ signature: '', id: null })
  useEffect(() => {
    let active = true
    const load = async () => {
      try { const items = await getPublicMenu(); if (active) { setMenuItems(items); setMenuError('') } } catch { if (active) setMenuError('We could not verify current menu availability. Please try again shortly.') } finally { if (active) setIsMenuLoading(false) }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const cartIssues = useMemo(() => getCartValidationIssues(cartItems, menuItems), [cartItems, menuItems])
  const currentMenuById = useMemo(() => new Map(menuItems.map((menuItem) => [menuItem.id, menuItem])), [menuItems])
  const displayCartItems = useMemo(() => cartItems.map((item) => {
    const currentMenuItem = currentMenuById.get(item.menuItemId)
    let options
    try { options = resolveOptions(currentMenuItem?.optionGroups ?? [], item.selections ?? []) } catch { /* issue displayed below */ }
    const currentPrice = Number(currentMenuItem?.price) + (options?.extraPrice ?? 0)
    const displayPrice = Number.isFinite(currentPrice) && currentPrice >= 0 ? currentPrice : 0
    const displayQuantity = Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 0
    return { ...item, optionSnapshot: options?.optionSnapshot ?? item.optionSnapshot, displayPrice, displayQuantity, issue: cartIssues.find((issue) => issue.cartItemId === item.cartItemId)?.message }
  }), [cartIssues, cartItems, currentMenuById])
  const subtotal = displayCartItems.reduce((total, item) => total + item.displayPrice * item.displayQuantity, 0)
  let amounts, priceError = ''
  try { amounts = orderAmounts(subtotal, config) } catch (error) { priceError = error.message }
  const { serviceCharge = 0, sst = 0, grandTotal = 0 } = amounts ?? {}
  const tableLabel = session ? t('Table {{number}}', { number: session.tableNumber }) : t('No table joined')
  const orderingBlocked = settingsLoading || settingsError || !settings.isAcceptingOrders
  const isCheckoutBlocked = isMenuLoading || Boolean(menuError) || cartIssues.length > 0 || Boolean(orderingBlocked) || Boolean(priceError)

  async function handlePlaceOrder() {
    if (isSubmittingRef.current || cartItems.length === 0 || !session) return
    if (isCheckoutBlocked) {
      setSubmitError(cartIssues[0]?.message ?? menuError ?? 'Please wait while we check current menu availability.')
      return
    }
    try {
      isSubmittingRef.current = true
      setIsSubmitting(true)
      setSubmitError('')
      const orderSession = customerNickname.trim() && !session.isSharedTable ? await updateSessionNickname(customerNickname) : session
      const signature = JSON.stringify([cartItems, orderSession.sessionId, customerNickname, settings.revision, orderType])
      if (orderRequest.current.signature !== signature) orderRequest.current = { signature, id: crypto.randomUUID() }
      const orderReference = await createOrder({ cartItems, session: orderSession, requestId: orderRequest.current.id, settingsRevision: settings.revision })
      clearCart()
      showToast('Your order has been received.')
      navigate('/tracking', { state: { orderId: orderReference.id } })
    } catch (firebaseError) {
      console.error('[Cart] Failed to place order:', firebaseError)
      const message = firebaseError instanceof Error ? firebaseError.message : 'We could not place your order. Please try again.'
      setSubmitError(message)
      showToast(message, 'error')
    } finally {
      isSubmittingRef.current = false
      setIsSubmitting(false)
    }
  }

  if (cartItems.length === 0) return <div className="mx-auto max-w-4xl space-y-6"><SectionHeading description={t("Review your items before sending them to the kitchen.")} eyebrow={tableLabel} title={t("Your order")} /><div className="space-y-5"><StatePanel description={t("Discover something delicious and add it to your order.")} title={t("Your cart is empty")} /><div className="text-center"><Link to="/menu"><Button>{t("Browse menu")}</Button></Link></div></div></div>

  return <div className="mx-auto max-w-5xl space-y-7"><SectionHeading action={<button className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-50" disabled={isSubmitting} onClick={clearCart} type="button">{t("Clear cart")}</button>} description={t("Review your items before sending them to the kitchen.")} eyebrow={tableLabel} title={t("Your order")} />{cartIssues.length > 0 && <section aria-live="polite" className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">{t("Some items need attention before checkout.")}</p><ul className="mt-2 list-disc space-y-1 pl-5">{cartIssues.map((issue) => <li key={issue.cartItemId}>{t(issue.message)}</li>)}</ul></section>}{menuError && <p aria-live="polite" className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">{t(menuError)}</p>}<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"><section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_12px_35px_rgb(15,23,42,0.06)]"><div className="border-b border-slate-100 px-5 py-4"><p className="font-bold text-slate-900">{t("Your items")}</p><p className="mt-1 text-sm text-slate-500">{t('{{count}} items ready to order', { count: displayCartItems.length })}</p></div><div className="divide-y divide-slate-100">{displayCartItems.map((item) => <article className="flex gap-3 p-4 sm:gap-4 sm:p-5" key={item.cartRowId ?? item.cartItemId}><img alt={item.name || t("Cart item")} className="h-16 w-16 shrink-0 rounded-xl object-cover shadow-sm sm:h-24 sm:w-24 sm:rounded-2xl" decoding="async" loading="lazy" onError={useImageFallback} src={getImageSource(item.imageUrl)} /><div className="min-w-0 flex-1"><div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:justify-between sm:gap-3"><div className="min-w-0 flex-1"><h2 className="break-words text-sm font-bold leading-6 text-slate-900 sm:text-base">{item.name || t("Menu item")}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{t('{{price}} each', { price: formatCurrency(item.displayPrice) })}</p>{item.issue && <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">{t(item.issue)}</p>}<OptionSummary item={item} />{item.specialInstructions && <p className="mt-2 break-words rounded-lg bg-slate-50 px-2 py-1 text-sm leading-5 text-slate-500">{t("Note:")}{' '}{item.specialInstructions}</p>}</div><div className="flex flex-wrap items-baseline gap-2 sm:block sm:text-right"><p className="text-xs font-semibold text-slate-500">{t("Subtotal")}</p><p className="font-bold text-orange-600 sm:mt-1">{formatCurrency(item.displayPrice * item.displayQuantity)}</p></div></div><OrderTypeSelector compact value={item.orderType ?? "dine_in"} onChange={(type) => changeType(item, type)} disabled={isSubmitting} />{item.displayQuantity > 1 && <button className="mt-2 min-h-11 rounded-lg border border-orange-200 px-3 py-2 text-sm font-bold text-orange-700" type="button" disabled={isSubmitting} onClick={() => changeType(item, item.orderType === "take_away" ? "dine_in" : "take_away", 1)}>{t(item.orderType === "take_away" ? "Dine in 1 separately" : "Pack 1 separately")}</button>}<div className="mt-4 flex flex-wrap items-center justify-between gap-2"><button aria-label={t('Remove {{name}} from cart', { name: item.name || t('Menu item') })} className="min-h-11 rounded-lg px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-50" disabled={isSubmitting} onClick={() => removeFromCart(item.cartItemId)} type="button">{t("Remove")}</button><QuantitySelector disabled={isSubmitting || Boolean(item.issue)} onDecrease={() => updateQuantity(item.cartItemId, Math.max(1, item.displayQuantity - 1))} onIncrease={() => updateQuantity(item.cartItemId, item.displayQuantity + 1)} quantity={item.displayQuantity} /></div></div></article>)}</div></section><aside className="rounded-3xl lg:sticky lg:top-24 border border-orange-100 bg-white p-5 shadow-[0_16px_38px_rgb(15,23,42,0.08)] sm:p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-900">{t("Order summary")}</h2><span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">{tableLabel}</span></div><div className="mt-4"><OrderTypeBadge orderType={orderType} /><p className="mt-2 text-xs text-slate-500">{t("Dining options are set separately for each item.")}</p></div><label className="mt-6 block text-sm font-bold text-slate-800" htmlFor="customer-nickname">{t("Name")}{' '}<span className="font-normal text-slate-400">{t("(optional)")}</span><input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-orange-400" disabled={isSubmitting} id="customer-nickname" maxLength="20" onChange={(event) => setCustomerNickname(event.target.value)} placeholder={t("e.g. Jason")} value={customerNickname} /></label><p className="mt-1 text-xs leading-5 text-slate-400">{t("Leave blank to order as Guest.")}</p><div className="mt-6 space-y-4 border-b border-slate-100 pb-5 text-sm"><div className="flex justify-between text-slate-600"><span>{t("Subtotal")}</span><span className="font-semibold text-slate-800">{formatCurrency(subtotal)}</span></div><div className="flex justify-between text-slate-600"><span>{t("Service charge")}{' '}<span className="text-xs">({config?.serviceChargeRate ?? 10}%)</span></span><span className="font-semibold text-slate-800">{formatCurrency(serviceCharge)}</span></div><div className="flex justify-between text-slate-600"><span>{t("SST")}{' '}<span className="text-xs">({config?.sstRate ?? 6}%)</span></span><span className="font-semibold text-slate-800">{formatCurrency(sst)}</span></div></div><div className="mt-5 flex items-end justify-between"><span className="text-base font-bold">{t("Grand total")}</span><span className="text-2xl font-extrabold tracking-tight text-orange-600">{formatCurrency(grandTotal)}</span></div>{(orderingBlocked || priceError) && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t(priceError || settings.orderingMessage || settingsError || "Checking ordering availability...")}</p>}{submitError && <p aria-live="polite" className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{t(submitError)}</p>}<Button className="mt-6 w-full py-3.5" disabled={isSubmitting || !session || isCheckoutBlocked} onClick={handlePlaceOrder}>{isSubmitting ? t("Placing order...") : isMenuLoading ? t("Checking menu...") : t("Place order")}</Button><p className="mt-3 text-center text-xs leading-5 text-slate-400">{isSubmitting ? t("Please wait while we send your order.") : isCheckoutBlocked ? t("Resolve item availability before placing your order.") : t("Your order will be sent directly to the kitchen.")}</p></aside></div></div>
}

export default Cart
