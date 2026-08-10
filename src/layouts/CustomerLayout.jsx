import PortalLayout from '../components/common/PortalLayout'
import useCart from '../hooks/useCart'
import useCustomerSession from '../hooks/useCustomerSession'
import { useNavigate } from 'react-router-dom'

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
    { label: 'Table summary', to: '/table-summary' },
    { label: 'Bill', to: '/bill' },
  ]

  async function handleLeaveSession() {
    await clearSession()
    navigate('/join')
  }

  return <PortalLayout area="Customer" headerAction={session && <button aria-label="Leave customer session" className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-200" onClick={handleLeaveSession} type="button">Leave</button>} navigation={navigation} />
}

export default CustomerLayout
