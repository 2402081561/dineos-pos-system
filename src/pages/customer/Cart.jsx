import OrderTypeBadge from '../../components/common/OrderTypeBadge'
import { summarizeOrderType } from '../../../server/src/orderType'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../../components/common/Button'
import CartItemRow from '../../components/customer/CartItemRow'
import CartCheckoutBar from '../../components/customer/CartCheckoutBar'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useCart from '../../hooks/useCart'
import useCustomerSession from '../../hooks/useCustomerSession'
import useToast from '../../hooks/useCustomerToast'
import { createOrder, getCartValidationIssues } from '../../services/orderService'
import { getPublicMenu } from '../../services/customerApi'
import { formatCurrency } from '../../utils/currency'
import useShopSettings from '../../hooks/useShopSettings'
import { orderAmounts, resolveOptions } from '../../../server/src/posRules'
import { subscribePoll } from '../../utils/pollSubscription'
import { isDefinitiveOrderRejection } from '../../utils/orderSubmission'
import CartItemEditor from '../../components/customer/CartItemEditor'
import ConfirmationDialog from '../../components/common/ConfirmationDialog'
import { cartItemFingerprint } from '../../utils/cartItemEdit'
import { customerOrderFingerprint, sameCustomerVisit } from '../../utils/customerVisitStorage'

function Cart() {
  const { t } = useCustomerLanguage()
  const { config, settings, isLoading: settingsLoading, error: settingsError } = useShopSettings()
  const { cartItems, isCartLocked, removeWithUndo, undoRemoval, editCartItem, getLastCartError, updateQuantity, clearCart, changeItemOrderType, prepareOrderRequest, getOrderRequest, completeOrderRequest, rejectOrderRequest } = useCart()
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
  const [editing, setEditing] = useState(null)
  const [clearPrompt, setClearPrompt] = useState(null)
  const [customerNickname, setCustomerNickname] = useState(() => session?.customerNickname === 'Guest' ? '' : session?.customerNickname ?? '')
  const isSubmittingRef = useRef(false)
  useEffect(() => {
    return subscribePoll(getPublicMenu, (items) => { setMenuItems(items); setMenuError(''); setIsMenuLoading(false) }, () => { setMenuError('We could not verify current menu availability. Please try again shortly.'); setIsMenuLoading(false) }, 30000)
  }, [])

  const cartIssues = useMemo(() => isMenuLoading || menuError ? [] : getCartValidationIssues(cartItems, menuItems), [cartItems, menuItems, isMenuLoading, menuError])
  const currentMenuById = useMemo(() => new Map(menuItems.map((menuItem) => [menuItem.id, menuItem])), [menuItems])
  const displayCartItems = useMemo(() => cartItems.map((item) => {
    const currentMenuItem = currentMenuById.get(item.menuItemId)
    let options
    try { options = resolveOptions(currentMenuItem?.optionGroups ?? [], item.selections ?? []) } catch { /* issue displayed below */ }
    const currentPrice = currentMenuItem && options ? Number(currentMenuItem.price) + options.extraPrice : NaN
    const displayPrice = Number.isFinite(currentPrice) && currentPrice >= 0 ? currentPrice : null
    const displayQuantity = Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 0
    return { ...item, optionSnapshot: options?.optionSnapshot ?? item.optionSnapshot, displayPrice, displayQuantity, issue: cartIssues.find((issue) => issue.cartItemId === item.cartItemId)?.message }
  }), [cartIssues, cartItems, currentMenuById])
  const pricesAvailable = !isMenuLoading && !menuError && displayCartItems.every((item) => item.displayPrice !== null)
  const subtotal = displayCartItems.reduce((total, item) => total + (item.displayPrice ?? 0) * item.displayQuantity, 0)
  let amounts, priceError = ''
  try { amounts = orderAmounts(subtotal, config) } catch (error) { priceError = error.message }
  const { serviceCharge = 0, sst = 0, grandTotal = 0 } = amounts ?? {}
  const tableLabel = session?.isTakeawayQr ? t('Take-away ordering') : session ? t('Table {{number}}', { number: session.tableNumber }) : t('No table joined')
  const orderingBlocked = settingsLoading || settingsError || !settings.isAcceptingOrders
  const isCheckoutBlocked = isMenuLoading || Boolean(menuError) || cartIssues.length > 0 || Boolean(orderingBlocked) || Boolean(priceError) || Boolean(session?.isTakeawayQr && session.visitStatus === 'completed')

  function removeItem(item) {
    if (isSubmittingRef.current || isCartLocked) return
    const token = removeWithUndo(item.cartItemId)
    if (!token) { showToast(getLastCartError() || 'Your cart changed. Review your cart again.', 'error'); return }
    showToast('Item removed from cart.', 'success', { action: { label: 'Undo', onClick: () => {
      if (!undoRemoval(token)) showToast(getLastCartError(), 'error')
    } } })
  }
  function saveEdit(values) {
    if (!editing || isSubmittingRef.current || isCartLocked || !sameCustomerVisit(editing.session, session)) return 'Your table visit changed. Review your cart again.'
    if (!editCartItem(editing.item.cartRowId, cartItemFingerprint(editing.item), currentMenuById.get(editing.item.menuItemId), values)) return getLastCartError()
    setEditing(null)
    showToast('Cart item updated.')
    return ''
  }
  function confirmClear() {
    if (!clearPrompt || isSubmittingRef.current || isCartLocked || !sameCustomerVisit(clearPrompt.session, session)) return
    if (clearCart(clearPrompt.signature) === false) showToast(getLastCartError(), 'error')
    setClearPrompt(null)
  }

  async function handlePlaceOrder() {
    if (isSubmittingRef.current || cartItems.length === 0 || !session) return
    if (session.isTakeawayQr && !isCartLocked && (!customerNickname.trim() || customerNickname.trim().length>40)) {setSubmitError('Enter a name, phone suffix or car plate (1–40 characters).');return}
    if (isCheckoutBlocked && !isCartLocked) {
      setSubmitError(cartIssues[0]?.message ?? menuError ?? 'Please wait while we check current menu availability.')
      return
    }
    let requestId
    try {
      isSubmittingRef.current = true
      setIsSubmitting(true)
      setSubmitError('')
      const orderSession = !isCartLocked && customerNickname.trim() && !session.isSharedTable ? await updateSessionNickname(customerNickname) : session
      requestId = prepareOrderRequest(settings.revision)
      const orderReference = await createOrder({ cartItems, session: orderSession, requestId, settingsRevision: getOrderRequest()?.settingsRevision ?? settings.revision })
      completeOrderRequest(requestId)
      showToast('Your order has been received.')
      navigate('/tracking', { state: { orderId: orderReference.id } })
    } catch (firebaseError) {
      if (requestId && isDefinitiveOrderRejection(firebaseError)) rejectOrderRequest(requestId)
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

  const submitLabel = isSubmitting ? t('Placing order...') : isCartLocked ? t('Retry previous order') : isMenuLoading ? t('Checking menu...') : t('Place order')
  const submitDisabled = isSubmitting || !session || (!isCartLocked && isCheckoutBlocked)
  const itemCount = displayCartItems.reduce((count, item) => count + item.displayQuantity, 0)

  return <div className="customer-cart-page mx-auto max-w-5xl space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-700" to="/menu">← {t('Back to Menu')}</Link><h1 className="text-2xl font-extrabold text-slate-900">{t('Your order')} <span className="ml-1 text-base font-semibold text-slate-400">({itemCount})</span></h1></div>
      <button className="min-h-11 rounded-lg px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50" disabled={isSubmitting || isCartLocked} onClick={() => setClearPrompt({ session, signature: customerOrderFingerprint(cartItems, session) })} type="button">{t('Clear cart')}</button>
    </div>
    <p className="text-sm text-slate-500">{t('Review your items before sending them to the kitchen.')}</p>
    {cartIssues.length > 0 && <section aria-live="polite" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">{t('Some items need attention before checkout.')}</p><ul className="mt-2 list-disc space-y-1 pl-5">{cartIssues.map((issue) => <li key={issue.cartItemId}>{t(issue.message)}</li>)}</ul></section>}
    {menuError && <p aria-live="polite" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{t(menuError)}</p>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label={t('Your items')} className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3"><span className="text-sm font-bold text-slate-800">{tableLabel}</span><OrderTypeBadge orderType={orderType} /></div>
        <div className="divide-y divide-slate-100">{displayCartItems.map((item) => <CartItemRow key={item.cartRowId ?? item.cartItemId} item={item} takeawayOnly={session?.isTakeawayQr} disabled={isSubmitting || isCartLocked} onRemove={() => removeItem(item)} onEdit={!isMenuLoading && !menuError ? () => setEditing({ item: cartItems.find((line) => line.cartItemId === item.cartItemId), session }) : undefined} onQuantity={(quantity) => updateQuantity(item.cartItemId, quantity)} onOrderType={(type, quantity) => changeType(item, type, quantity)} />)}</div>
      </section>
      <aside className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5 lg:sticky lg:top-24">
        <h2 className="font-bold text-slate-900">{t('Order summary')}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{t(session?.isTakeawayQr?'This QR code accepts take-away items only.':'Dining options are set separately for each item.')}</p>
        <label className="mt-4 block text-sm font-semibold text-slate-800" htmlFor="customer-nickname">{t(session?.isTakeawayQr?'Name / phone suffix / car plate':'Name')} {!session?.isTakeawayQr && <span className="font-normal text-slate-400">{t('(optional)')}</span>}<input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-orange-400" disabled={isSubmitting || isCartLocked} id="customer-nickname" maxLength={session?.isTakeawayQr?40:80} onChange={(event) => setCustomerNickname(event.target.value)} placeholder={t(session?.isTakeawayQr?'e.g. 阿明 / 8821 / JJS1234':'e.g. Jason')} value={customerNickname} /></label>
        {!session?.isTakeawayQr && <p className="mt-1 text-xs leading-5 text-slate-400">{t('Leave blank to order as Guest.')}</p>}
        <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
          <div className="flex justify-between gap-3 text-slate-600"><dt>{t('Subtotal')}</dt><dd className="font-semibold tabular-nums text-slate-800">{pricesAvailable ? formatCurrency(subtotal) : '—'}</dd></div>
          {Number(config?.serviceChargeRate) > 0 && <div className="flex justify-between gap-3 text-slate-600"><dt>{t('Service charge')} ({config.serviceChargeRate}%)</dt><dd className="font-semibold tabular-nums text-slate-800">{pricesAvailable ? formatCurrency(serviceCharge) : '—'}</dd></div>}
          {Number(config?.sstRate) > 0 && <div className="flex justify-between gap-3 text-slate-600"><dt>{t('SST')} ({config.sstRate}%)</dt><dd className="font-semibold tabular-nums text-slate-800">{pricesAvailable ? formatCurrency(sst) : '—'}</dd></div>}
          <div className="flex items-baseline justify-between gap-3 border-t border-slate-100 pt-4"><dt className="font-bold">{t('Grand total')}</dt><dd className="text-xl font-extrabold tabular-nums text-orange-600">{pricesAvailable && !settingsLoading && !settingsError && !priceError ? formatCurrency(grandTotal) : '—'}</dd></div>
        </dl>
        {(orderingBlocked || priceError) && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t(priceError || settings.orderingMessage || settingsError || 'Checking ordering availability...')}</p>}
        {submitError && <p aria-live="polite" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{t(submitError)}</p>}
        <Button className="mt-5 hidden w-full lg:inline-flex" disabled={submitDisabled} onClick={handlePlaceOrder}>{submitLabel}</Button>
        <p className="mt-3 text-xs leading-5 text-slate-500">{isSubmitting ? t('Please wait while we send your order.') : isCheckoutBlocked ? t('Resolve item availability before placing your order.') : t('Your order will be sent directly to the kitchen.')}</p>
      </aside>
    </div>
    <CartCheckoutBar total={pricesAvailable && !settingsLoading && !settingsError && !priceError ? grandTotal : null} label={submitLabel} disabled={submitDisabled} onSubmit={handlePlaceOrder} />
    {editing && sameCustomerVisit(editing.session, session) && <CartItemEditor item={editing.item} currentItem={cartItems.find((item) => item.cartRowId === editing.item.cartRowId)} food={currentMenuById.get(editing.item.menuItemId)} locked={isSubmitting || isCartLocked || Boolean(menuError) || isMenuLoading} onSave={saveEdit} onClose={() => setEditing(null)} />}
    {clearPrompt && sameCustomerVisit(clearPrompt.session, session) && <ConfirmationDialog title="Clear your cart?" description="All unsubmitted items will be removed. Orders already sent to the kitchen will not change." confirmLabel="Clear cart" isLoading={isSubmitting || isCartLocked} onCancel={() => setClearPrompt(null)} onConfirm={confirmClear} />}
  </div>
}

export default Cart
