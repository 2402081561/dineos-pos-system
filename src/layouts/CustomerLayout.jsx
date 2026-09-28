import PortalLayout from '../components/common/PortalLayout'
import useCart from '../hooks/useCart'
import useCustomerSession from '../hooks/useCustomerSession'
import { Link, NavLink, useLocation } from 'react-router-dom'

function CustomerLayout() {
  const { cartItemCount } = useCart()
  const { session } = useCustomerSession()
  const { pathname } = useLocation()
  const isOrdersPage = ['/orders', '/tracking'].includes(pathname)
  const isTableBillPage = ['/table-summary', '/bill'].includes(pathname)
  const navigation = session ? [
    { active: pathname.startsWith('/menu') || pathname === '/cart', label: 'Menu', to: '/menu' },
    { active: isOrdersPage, label: 'My Orders', to: '/orders' },
    { active: isTableBillPage, label: 'Table Bill', to: '/table-summary' },
    { active: ['/more', '/service-requests', '/member', '/rewards'].includes(pathname), label: 'More', to: '/more' },
  ] : [
    { end: true, label: 'Home', to: '/' },
    { label: 'Welcome', to: '/join' },
  ]
  const sectionLinks = isOrdersPage ? [
    { label: 'My orders', to: '/orders' },
    { label: 'Track latest order', to: '/tracking' },
  ] : isTableBillPage ? [
    { label: 'Table orders', to: '/table-summary' },
    { label: 'Request bill', to: '/bill' },
  ] : []
  const contentHeader = session && sectionLinks.length > 0 && <nav aria-label={isOrdersPage ? 'Order views' : 'Table bill views'} className="mx-auto flex max-w-4xl gap-2 rounded-xl border border-slate-100 bg-white p-1.5">{sectionLinks.map(({ label, to }) => <NavLink className={({ isActive }) => `flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition sm:text-sm ${isActive ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`} end key={to} to={to}>{label}</NavLink>)}</nav>

  const floatingCart = session && <Link aria-label={`View cart${cartItemCount ? `, ${cartItemCount} items` : ''}`} className="fixed bottom-20 right-5 z-30 flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-orange-600 px-4 text-lg font-bold text-white shadow-xl shadow-orange-600/30 transition hover:-translate-y-0.5 hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-200 sm:bottom-7 sm:right-7" to="/cart"><span aria-hidden="true">🛒</span>{cartItemCount > 0 && <span className="text-sm">{cartItemCount}</span>}<span className="sr-only">View cart</span></Link>

  return <PortalLayout area="Customer" badgeLabel={session ? `Table ${session.tableNumber}` : 'Customer'} compactMobileNavigation={Boolean(session)} contentHeader={contentHeader} floatingAction={floatingCart} mobileNavigationTop navigation={navigation} showAccountControls={false} />
}

export default CustomerLayout
