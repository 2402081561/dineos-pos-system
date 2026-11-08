import { Link } from 'react-router-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'

const paths = {
  '/menu': <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  '/orders': <><path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-4 2-4-2-3 2V4a1 1 0 0 1 1-1Z"/><path d="M9 8h7M9 12h7"/></>,
  '/table-summary': <><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 10h18M7 15h3"/></>,
  '/more': <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  '/takeaway': <><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></>,
}

export default function CustomerMobileNavigation({ navigation }) {
  const { t } = useCustomerLanguage()
  return <ul className={`customer-mobile-navigation grid ${navigation.length===3?'grid-cols-3':'grid-cols-4'} gap-1`}>
    {navigation.map(({ to, label, active }) => <li className="min-w-0" key={to}>
      <Link aria-current={active ? 'page' : undefined} className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[11px] font-semibold leading-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${active ? 'bg-orange-50 text-orange-700' : 'text-slate-500'}`} to={to}>
        <svg aria-hidden="true" className="h-[22px] w-[22px] shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">{paths[to]}</svg>
        <span className="text-center">{t(label)}</span>
      </Link>
    </li>)}
  </ul>
}
