import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { Link, NavLink } from 'react-router-dom'

function linkClass(isActive, compact) {
  return `block whitespace-nowrap rounded-lg ${compact ? 'min-h-11 px-1 py-3 text-center text-xs lg:min-h-0 lg:px-3 lg:py-2 lg:text-left lg:text-sm' : 'px-3 py-2 text-sm'} font-medium transition ${isActive ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`
}

export default function PortalNavigation({ navigation, compact = false }) {
  const { t: uiText } = useCustomerLanguage()

  return <ul className={compact ? 'grid grid-cols-4 gap-1 lg:flex lg:flex-col lg:gap-2' : 'flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-x-visible'}>
    {navigation.map(({ active, end = false, label, to, group }, index) => <li className="min-w-0 shrink-0" key={to}>
      {group && navigation[index - 1]?.group !== group && <p className={`hidden px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:block ${index ? 'mt-5' : ''}`}>{uiText(group)}</p>}
      {active === undefined ? <NavLink className={({ isActive }) => linkClass(isActive, compact)} end={end} to={to}>{uiText(label)}</NavLink> : <Link aria-current={active ? 'page' : undefined} className={linkClass(active, compact)} to={to}>{uiText(label)}</Link>}
    </li>)}
  </ul>
}
