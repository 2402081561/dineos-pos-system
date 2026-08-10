import { Link, useNavigate } from 'react-router-dom'
import { useRef, useState } from 'react'
import Button from '../../components/common/Button'
import QuantitySelector from '../../components/customer/QuantitySelector'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useCart from '../../hooks/useCart'
import useCustomerSession from '../../hooks/useCustomerSession'
import useToast from '../../hooks/useToast'
import { createOrder } from '../../services/orderService'
import { formatCurrency } from '../../utils/currency'
import { getImageSource, useImageFallback } from '../../utils/image'

function Cart() {
  const { cartItems, removeFromCart, updateQuantity, clearCart } = useCart()
  const { session } = useCustomerSession()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const isSubmittingRef = useRef(false)
  const subtotal = cartItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0)
  const serviceCharge = subtotal * 0.1
  const sst = subtotal * 0.06
  const grandTotal = subtotal + serviceCharge + sst
  const tableLabel = session ? `Table ${session.tableNumber}` : 'No table joined'

  async function handlePlaceOrder() {
    if (isSubmittingRef.current || cartItems.length === 0 || !session) return
    try {
      isSubmittingRef.current = true
      setIsSubmitting(true)
      setSubmitError('')
      const orderReference = await createOrder({ cartItems, session, subtotal, serviceCharge, sst, grandTotal })
      clearCart()
      showToast('Your order has been received.')
      navigate('/tracking', { state: { orderId: orderReference.id } })
    } catch (firebaseError) {
      console.error('[Cart] Failed to place order:', firebaseError)
      setSubmitError('We could not place your order. Please try again.')
      showToast('Your order could not be placed. Please try again.', 'error')
    } finally {
      isSubmittingRef.current = false
      setIsSubmitting(false)
    }
  }

  if (cartItems.length === 0) return <div className="mx-auto max-w-4xl space-y-6"><SectionHeading description="Review your items before sending them to the kitchen." eyebrow={tableLabel} title="Your order" /><div className="space-y-5"><StatePanel description="Discover something delicious and add it to your order." title="Your cart is empty" /><div className="text-center"><Link to="/menu"><Button>Browse menu</Button></Link></div></div></div>

  return <div className="mx-auto max-w-5xl space-y-7"><SectionHeading action={<button className="rounded-lg px-2 py-1 text-sm font-semibold text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-50" disabled={isSubmitting} onClick={clearCart} type="button">Clear cart</button>} description={`Review ${session?.customerNickname ?? 'your'}&apos;s items before sending them to the kitchen.`} eyebrow={tableLabel} title="Your order" /><div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"><section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_12px_35px_rgb(15,23,42,0.06)]"><div className="border-b border-slate-100 px-5 py-4"><p className="font-bold text-slate-900">Your items</p><p className="mt-1 text-sm text-slate-500">{cartItems.length} item{cartItems.length > 1 ? 's' : ''} ready to order</p></div><div className="divide-y divide-slate-100">{cartItems.map((item) => <article className="flex gap-4 p-4 sm:p-5" key={item.cartItemId}><img alt={item.name || 'Cart item'} className="h-24 w-24 shrink-0 rounded-2xl object-cover shadow-sm" decoding="async" loading="lazy" onError={useImageFallback} src={getImageSource(item.imageUrl)} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-bold text-slate-900">{item.name}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{formatCurrency(item.unitPrice)} each</p>{item.specialInstructions && <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-500">Note: {item.specialInstructions}</p>}</div><div className="text-right"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Subtotal</p><p className="mt-1 whitespace-nowrap font-bold text-orange-600">{formatCurrency(item.unitPrice * item.quantity)}</p></div></div><div className="mt-4 flex items-center justify-between"><button aria-label={`Remove ${item.name} from cart`} className="rounded-lg px-2 py-1 text-xs font-bold text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-50" disabled={isSubmitting} onClick={() => removeFromCart(item.cartItemId)} type="button">Remove</button><QuantitySelector disabled={isSubmitting} onDecrease={() => updateQuantity(item.cartItemId, Math.max(1, item.quantity - 1))} onIncrease={() => updateQuantity(item.cartItemId, item.quantity + 1)} quantity={item.quantity} /></div></div></article>)}</div></section><aside className="sticky top-24 rounded-3xl border border-orange-100 bg-white p-5 shadow-[0_16px_38px_rgb(15,23,42,0.08)] sm:p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-900">Order summary</h2><span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">{tableLabel}</span></div><div className="mt-6 space-y-4 border-b border-slate-100 pb-5 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-semibold text-slate-800">{formatCurrency(subtotal)}</span></div><div className="flex justify-between text-slate-600"><span>Service charge <span className="text-xs">(10%)</span></span><span className="font-semibold text-slate-800">{formatCurrency(serviceCharge)}</span></div><div className="flex justify-between text-slate-600"><span>SST <span className="text-xs">(6%)</span></span><span className="font-semibold text-slate-800">{formatCurrency(sst)}</span></div></div><div className="mt-5 flex items-end justify-between"><span className="text-base font-bold">Grand total</span><span className="text-2xl font-extrabold tracking-tight text-orange-600">{formatCurrency(grandTotal)}</span></div>{submitError && <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{submitError}</p>}<Button className="mt-6 w-full py-3.5" disabled={isSubmitting || !session} onClick={handlePlaceOrder}>{isSubmitting ? 'Placing order...' : 'Place order'}</Button><p className="mt-3 text-center text-xs leading-5 text-slate-400">{isSubmitting ? 'Please wait while we send your order.' : 'Your order will be sent directly to the kitchen.'}</p></aside></div></div>
}

export default Cart
