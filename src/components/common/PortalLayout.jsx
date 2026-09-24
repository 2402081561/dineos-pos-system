import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import useAdminAuth from '../../hooks/useAdminAuth'

function PortalLayout({ area, fixedMobileNavigation = false, mobileNavigationTop = false, floatingAction, headerAction, navigation }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { authError, authUser, signOut } = useAdminAuth()

  async function handleSignOut() {
    await signOut()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#fffaf7]">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <NavLink className="flex items-center gap-2 text-xl font-bold text-slate-900" to="/">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-600 text-base text-white">⌁</span>DineOS
          </NavLink>
          <div className="flex items-center gap-2"><span className="hidden max-w-44 truncate text-sm text-slate-500 sm:inline" title={authUser?.displayName || authUser?.email}>{authUser?.displayName || authUser?.email}</span><span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700">{area}</span>{headerAction}<button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-orange-300 hover:text-orange-700" onClick={handleSignOut} type="button">Log out</button></div>
        </div>
      </header>
      {authError && <div aria-live="polite" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-800">{authError}</div>}
      <div className={`mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:flex-row lg:px-8 ${fixedMobileNavigation ? 'pb-24 lg:pb-6' : ''}`}>
        <nav aria-label={`${area} navigation`} className={`w-full lg:w-56 ${fixedMobileNavigation ? 'fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/80 bg-white/95 px-3 py-2 shadow-[0_-8px_20px_rgb(15,23,42,0.08)] backdrop-blur lg:sticky lg:top-24 lg:self-start lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none' : ''} ${mobileNavigationTop ? 'sticky top-[73px] z-10 -mx-4 w-[calc(100%+2rem)] border-b border-slate-200/80 bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 lg:sticky lg:top-24 lg:mx-0 lg:w-56 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none' : ''}`}>
          <ul className="flex gap-2 overflow-x-auto lg:flex-col">
            {navigation.map(({ end = false, label, to }) => (
              <li key={to}>
                <NavLink
                  className={({ isActive }) =>
                    `block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-orange-600 text-white'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`
                  }
                  end={end}
                  to={to}
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="page-transition min-w-0 flex-1" key={location.pathname}>
          <Outlet />
        </main>
      </div>
      {floatingAction}
    </div>
  )
}

export default PortalLayout
