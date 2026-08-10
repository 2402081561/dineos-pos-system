import { NavLink, Outlet, useLocation } from 'react-router-dom'

function PortalLayout({ area, headerAction, navigation }) {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-[#fffaf7]">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <NavLink className="flex items-center gap-2 text-xl font-bold text-slate-900" to="/">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-600 text-base text-white">⌁</span>DineOS
          </NavLink>
          <div className="flex items-center gap-2"><span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700">{area}</span>{headerAction}</div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:px-8">
        <nav aria-label={`${area} navigation`} className="w-full lg:w-56">
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
    </div>
  )
}

export default PortalLayout
