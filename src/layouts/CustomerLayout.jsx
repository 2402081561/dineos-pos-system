import useCustomerLanguage from '../hooks/useCustomerLanguage'
import CustomerLanguageProvider from '../context/CustomerLanguageProvider'
import LanguageSwitch from '../components/customer/LanguageSwitch'
import PortalLayout from '../components/common/PortalLayout'
import useCart from '../hooks/useCart'
import useShopSettings from '../hooks/useShopSettings'
import useCustomerSession from '../hooks/useCustomerSession'
import { Link, NavLink, useLocation } from 'react-router-dom'

function CustomerLayoutContent() {
  const { t } = useCustomerLanguage()
  const { cartItemCount } = useCart()
  const { session } = useCustomerSession()
  const { pathname } = useLocation()
  const { settings, isLoading: settingsLoading, error: settingsError } = useShopSettings()
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
  const sectionNavigation = session && sectionLinks.length > 0 && <nav aria-label={isOrdersPage ? t("Order views") : t("Table bill views")} className="mx-auto flex max-w-4xl gap-2 rounded-xl border border-slate-100 bg-white p-1.5">{sectionLinks.map(({ label, to }) => <NavLink className={({ isActive }) => `flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition sm:text-sm ${isActive ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`} end key={to} to={to}>{t(label)}</NavLink>)}</nav>

  const showCartShortcut = session && pathname !== '/cart' && !pathname.startsWith('/menu/')
  const orderingNotice = session && !settingsLoading && (settingsError || !settings.isAcceptingOrders)
  const cartShortcut = showCartShortcut && <div className="flex justify-end"><Link aria-label={cartItemCount ? t('View cart, {{count}} items', { count: cartItemCount }) : t('View cart')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-400" to="/cart"><span aria-hidden="true">🛒</span>{t('View cart')}{cartItemCount > 0 && <span className="rounded-full bg-orange-600 px-2 py-0.5 text-xs text-white">{cartItemCount}</span>}</Link></div>
  const contentHeader = (orderingNotice || sectionNavigation || showCartShortcut) ? <div className="space-y-2">{orderingNotice && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{t(settingsError || settings.orderingMessage || 'QR ordering is paused. Please ask our staff to order.')}</p>}{sectionNavigation}{cartShortcut}</div> : null

  return <div className="customer-ui"><PortalLayout area={t('Customer')} badgeLabel={session ? t('Table {{number}}', { number: session.tableNumber }) : t('Customer')} headerAction={<LanguageSwitch />} compactMobileNavigation={Boolean(session)} contentHeader={contentHeader} mobileNavigationTop navigationLabel={t('Customer navigation')} navigation={navigation.map((link) => ({ ...link, label: t(link.label) }))} showAccountControls={false} /></div>
}

function CustomerLayout() {
  return <CustomerLanguageProvider><CustomerLayoutContent /></CustomerLanguageProvider>
}

export default CustomerLayout
