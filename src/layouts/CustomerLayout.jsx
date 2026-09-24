import PortalLayout from '../components/common/PortalLayout'
import useCart from '../hooks/useCart'
import useCustomerSession from '../hooks/useCustomerSession'
import { Link, useNavigate } from 'react-router-dom'

function CustomerLayout() {
  const { cartItemCount } = useCart()
  const { clearSession, session } = useCustomerSession()
  const navigate = useNavigate()
  const navigation = [
    { end: true, label: 'Home', to: '/' },
    { label: 'Join session', to: '/join' },
    { label: 'Menu', to: '/menu' },
    { label: <span className="inline-flex items-center gap-2">Cart {cartItemCount > 0 && <span aria-label={`${cartItemCount} items in cart`} className="animate-[page-enter_180ms_ease-out] rounded-full bg-orange-100 px-1.5 py-0.5 text-[11px] font-bold text-orange-700">🛒 {cartItemCount}</span>}</span>, to: '/cart' },
    { label: 'Service requests', to: '/service-requests' },
    { label: 'Order tracking', to: '/tracking' },
    { label: 'My orders', to: '/orders' },
    ...(session?.memberId ? [{ label: 'Membership', to: '/member' }, { label: 'Rewards', to: '/rewards' }] : []),
    { label: 'Table summary', to: '/table-summary' },
    { label: 'Bill', to: '/bill' },
  ]

  async function handleLeaveSession() {
    await clearSession()
    navigate('/join')
  }

  const floatingCart = session && <Link aria-label={`View cart${cartItemCount ? `, ${cartItemCount} items` : ''}`} className="fixed bottom-20 right-5 z-30 flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-orange-600 px-4 text-lg font-bold text-white shadow-xl shadow-orange-600/30 transition hover:-translate-y-0.5 hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-200 sm:bottom-7 sm:right-7" to="/cart"><span aria-hidden="true">🛒</span>{cartItemCount > 0 && <span className="text-sm">{cartItemCount}</span>}<span className="sr-only">View cart</span></Link>

  return <PortalLayout area="Customer" floatingAction={floatingCart} headerAction={session && <button aria-label="Leave customer session" className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-200" onClick={handleLeaveSession} type="button">Leave</button>} mobileNavigationTop navigation={navigation} />
}

export default CustomerLayout
