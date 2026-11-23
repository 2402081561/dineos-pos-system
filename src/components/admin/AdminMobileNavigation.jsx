import { useCallback, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import navigation from '../../utils/adminNavigation'
import AdminMoreMenu from './AdminMoreMenu'

const primary = [
  ['Dashboard', '/admin/dashboard', '⌂'], ['Cashier', '/cashier', '▣'],
  ['Kitchen', '/admin/kitchen', '♨'], ['Orders', '/admin/orders', '▤'],
]

export default function AdminMobileNavigation() {
  const { t, language } = useCustomerLanguage()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const close = useCallback(() => setOpen(false), [])
  useEffect(() => setOpen(false), [location.pathname])
  const remaining = navigation.filter((item) => !primary.some(([, path]) => path === item.to))
  const morePage = remaining.some(item => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))
  return <>
    {open && <AdminMoreMenu items={remaining} id="admin-more-menu" onClose={close} />}
    <div className="relative z-40 grid grid-cols-5 gap-1 pb-[env(safe-area-inset-bottom)]">
      {primary.map(([label, to, icon]) => <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold ${!open && !morePage && isActive ? 'bg-orange-50 text-orange-700' : 'text-slate-500'}`}><span aria-hidden="true" className="text-xl leading-5">{icon}</span>{t(label)}</NavLink>)}
      <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? 'admin-more-menu' : undefined} onClick={() => setOpen(!open)} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold ${open || morePage ? 'bg-orange-50 text-orange-700' : 'text-slate-500'}`}><span aria-hidden="true" className="text-xl leading-5">⋯</span>{language === 'zh' ? '更多' : 'More'}</button>
    </div>
  </>
}
