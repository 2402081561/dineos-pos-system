import useCustomerLanguage from '../hooks/useCustomerLanguage'
import LanguageSwitch from '../components/customer/LanguageSwitch'
import CustomerCartShortcut from '../components/customer/CustomerCartShortcut'
import PortalLayout from '../components/common/PortalLayout'
import useCart from '../hooks/useCart'
import useShopSettings from '../hooks/useShopSettings'
import useCustomerSession from '../hooks/useCustomerSession'
import { Link, NavLink, useLocation } from 'react-router-dom'

function CustomerLayoutContent() {
  const { t } = useCustomerLanguage()
  const { cartItemCount, isCartLocked } = useCart()
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

  const showCartShortcut = session && pathname !== '/cart'
  const orderingNotice = session && !settingsLoading && (settingsError || !settings.isAcceptingOrders)
  // PortalLayout renders floatingAction outside the animated main element, so
  // its fixed position stays attached to the viewport while scrolling.
  const cartShortcut = showCartShortcut && <CustomerCartShortcut aboveOrderBar={pathname.startsWith('/menu/')} itemCount={cartItemCount} />
  const unconfirmedNotice = session && isCartLocked && <div role="status" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-bold">{t('Order confirmation pending')}</p><p>{t('Your previous order is not confirmed yet. Retry it before changing your cart.')}</p>{pathname !== '/cart' && <Link className="inline-block min-h-11 rounded-lg bg-white px-3 py-2.5 font-bold underline" to="/cart">{t('Retry previous order')}</Link>}</div>
  const contentHeader = (orderingNotice || sectionNavigation || unconfirmedNotice) ? <div className="space-y-2">{orderingNotice && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{t(settingsError || settings.orderingMessage || 'QR ordering is paused. Please ask our staff to order.')}</p>}{unconfirmedNotice}{sectionNavigation}</div> : null

  return <div className={`customer-ui ${showCartShortcut ? 'pb-24' : ''}`}><PortalLayout area={t('Customer')} badgeLabel={session ? t('Table {{number}}', { number: session.tableNumber }) : t('Customer')} headerAction={<LanguageSwitch />} compactMobileNavigation={Boolean(session)} contentHeader={contentHeader} floatingAction={cartShortcut} mobileNavigationTop navigationLabel={t('Customer navigation')} navigation={navigation.map((link) => ({ ...link, label: t(link.label) }))} showAccountControls={false} /></div>
}

function CustomerLayout() {
  return <CustomerLayoutContent />
}

export default CustomerLayout
