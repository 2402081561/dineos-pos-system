import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import useAdminAuth from '../../hooks/useAdminAuth'
import useShopSettings from '../../hooks/useShopSettings'
import PortalNavigation from './PortalNavigation'
import LanguageSwitch from '../customer/LanguageSwitch'
import ConnectionStatus from './ConnectionStatus'

function PortalLayout({ area, badgeLabel = area, showAccountControls = true, fixedMobileNavigation = false, mobileNavigationTop = false, compactMobileNavigation = false, wideWorkspace = false, subdued = false, floatingAction, headerAction, contentHeader, navigationLabel = `${area} navigation`, navigation }) {
  const { t: uiText } = useCustomerLanguage()

  const location = useLocation()
  const navigate = useNavigate()
  const { authError, authUser, signOut } = useAdminAuth()
  const { name } = useShopSettings()

  async function handleSignOut() {
    await signOut()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className={`min-h-screen ${subdued ? 'bg-slate-50' : 'bg-[#fffaf7]'}`}>
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:h-[72px] lg:px-4 lg:py-0">
          <NavLink className="flex min-w-0 flex-1 items-center gap-2 pr-2 text-base font-bold text-slate-900 sm:text-xl" title={name} to="/">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-base text-white">⌁</span><span className="truncate">{name}</span>
          </NavLink>
          <div className="flex items-center gap-2">{showAccountControls && <span className="hidden max-w-44 truncate text-sm text-slate-500 sm:inline" title={authUser?.displayName || authUser?.email}>{authUser?.displayName || authUser?.email}</span>}<span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700">{uiText(badgeLabel)}</span>{headerAction || <LanguageSwitch />}{showAccountControls && <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-orange-300 hover:text-orange-700" onClick={handleSignOut} type="button">{uiText("Log out")}</button>}</div>
        </div>
      </header>
      {authError && <div aria-live="polite" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-800 lg:ml-56">{uiText(authError)}</div>}
      <div className={`flex flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:flex-row lg:pl-60 lg:pr-6 ${fixedMobileNavigation ? 'pb-24 lg:pb-6' : ''}`}>
        <nav aria-label={navigationLabel} className={`${mobileNavigationTop ? '' : 'w-full'} ${fixedMobileNavigation ? 'fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/80 bg-white/95 px-3 py-2 shadow-[0_-8px_20px_rgb(15,23,42,0.08)] backdrop-blur lg:inset-x-auto' : ''} ${mobileNavigationTop ? 'sticky top-[73px] z-10 -mx-4 w-[calc(100%+2rem)] border-b border-slate-200/80 bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6' : ''} lg:fixed lg:inset-y-0 lg:left-0 lg:top-[73px] lg:z-10 lg:m-0 lg:w-56 lg:overflow-y-auto lg:overscroll-contain lg:border-b-0 lg:border-t-0 lg:border-r lg:border-slate-200/70 lg:bg-white lg:px-3 lg:py-5 lg:shadow-none lg:backdrop-blur-none`}>
          <PortalNavigation navigation={navigation} compact={compactMobileNavigation} />
        </nav>
        <main className={`page-transition mx-auto w-full min-w-0 flex-1 ${wideWorkspace ? 'max-w-[1920px]' : 'max-w-7xl'}`} key={location.pathname}>
          {contentHeader && <div className="mb-5">{contentHeader}</div>}
          <ConnectionStatus />
          <Outlet />
        </main>
      </div>
      {floatingAction}
    </div>
  )
}

export default PortalLayout
