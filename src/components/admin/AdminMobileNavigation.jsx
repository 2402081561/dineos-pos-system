import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import navigation from '../../utils/adminNavigation'

const primary = [
  ['Dashboard', '/admin/dashboard', '⌂'], ['Cashier', '/cashier', '▣'],
  ['Kitchen', '/admin/kitchen', '♨'], ['Orders', '/admin/orders', '▤'],
]

export default function AdminMobileNavigation() {
  const { t, language } = useCustomerLanguage()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const remaining = navigation.filter((item) => !primary.some(([, path]) => path === item.to))
  return <>
    {open && <div className="fixed inset-0 z-30 lg:hidden" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-slate-900/40" />
      <div id="admin-more-menu" className="absolute inset-x-3 bottom-20 max-h-[65dvh] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">{language === 'zh' ? '更多功能' : 'More'}</h2><button type="button" onClick={() => setOpen(false)} aria-label={t('Close')} className="rounded-lg px-3 py-1 text-xl">×</button></div>
        <div className="grid grid-cols-2 gap-2">{remaining.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm font-semibold text-slate-700 hover:bg-orange-50">{t(item.label)}</NavLink>)}</div>
      </div>
    </div>}
    <div className="relative z-40 grid grid-cols-5 gap-1 pb-[env(safe-area-inset-bottom)]">
      {primary.map(([label, to, icon]) => <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold ${isActive ? 'bg-orange-50 text-orange-700' : 'text-slate-500'}`}><span aria-hidden="true" className="text-xl leading-5">{icon}</span>{t(label)}</NavLink>)}
      <button type="button" aria-expanded={open} aria-controls="admin-more-menu" onClick={() => setOpen(!open)} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold ${open ? 'bg-orange-50 text-orange-700' : 'text-slate-500'}`}><span aria-hidden="true" className="text-xl leading-5">⋯</span>{language === 'zh' ? '更多' : 'More'}</button>
    </div>
  </>
}
