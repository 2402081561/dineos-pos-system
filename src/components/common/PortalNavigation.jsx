import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { Link, NavLink } from 'react-router-dom'
import { useId, useState } from 'react'

const collapsedGroupsKey = 'dineos-admin-collapsed-navigation-v1'
function readCollapsedGroups() {
  try {
    const value = JSON.parse(localStorage.getItem(collapsedGroupsKey) || '[]')
    return Array.isArray(value) ? value.filter((group) => typeof group === 'string') : []
  } catch { return [] }
}

function linkClass(isActive, compact) {
  return `block whitespace-nowrap rounded-lg ${compact ? 'min-h-11 px-1 py-3 text-center text-xs lg:min-h-0 lg:px-3 lg:py-2 lg:text-left lg:text-sm' : 'px-3 py-2 text-sm'} font-medium transition ${isActive ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`
}

export default function PortalNavigation({ navigation, compact = false, collapsible = false }) {
  const { t: uiText } = useCustomerLanguage()
  const [collapsed, setCollapsed] = useState(readCollapsedGroups)
  const groupId = useId()
  const sections = navigation.reduce((result, item) => {
    const previous = result.at(-1)
    if (item.group && previous?.group === item.group) previous.items.push(item)
    else result.push({ group: item.group, items: [item] })
    return result
  }, [])

  function toggle(group) {
    setCollapsed((current) => {
      const next = current.includes(group) ? current.filter((entry) => entry !== group) : [...current, group]
      try { localStorage.setItem(collapsedGroupsKey, JSON.stringify(next)) } catch { /* Preference is optional. */ }
      return next
    })
  }
  function link({ active, end = false, label, to }) {
    return active === undefined ? <NavLink className={({ isActive }) => linkClass(isActive, compact)} end={end} to={to}>{uiText(label)}</NavLink> : <Link aria-current={active ? 'page' : undefined} className={linkClass(active, compact)} to={to}>{uiText(label)}</Link>
  }

  if (collapsible) return <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-x-visible">
    {sections.map(({ group, items }, index) => group ? <li className="shrink-0 lg:min-w-0" key={`${group}-${index}`}>
      <button aria-controls={`${groupId}-${index}`} aria-expanded={!collapsed.includes(group)} className={`hidden min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 lg:flex ${index ? 'mt-4' : ''}`} onClick={() => toggle(group)} type="button"><span>{uiText(group)}</span><span aria-hidden="true" className="text-base leading-none">{collapsed.includes(group) ? '›' : '⌄'}</span></button>
      <ul className={`flex gap-2 lg:flex-col lg:gap-1 ${collapsed.includes(group) ? 'lg:hidden' : ''}`} id={`${groupId}-${index}`}>{items.map((item) => <li className="min-w-0 shrink-0" key={item.to}>{link(item)}</li>)}</ul>
    </li> : <li className="min-w-0 shrink-0" key={items[0].to}>{link(items[0])}</li>)}
  </ul>

  return <ul className={compact ? 'grid grid-cols-4 gap-1 lg:flex lg:flex-col lg:gap-2' : 'flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-x-visible'}>
    {navigation.map(({ active, end = false, label, to, group }, index) => <li className="min-w-0 shrink-0" key={to}>
      {group && navigation[index - 1]?.group !== group && <p className={`hidden px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:block ${index ? 'mt-5' : ''}`}>{uiText(group)}</p>}
      {active === undefined ? <NavLink className={({ isActive }) => linkClass(isActive, compact)} end={end} to={to}>{uiText(label)}</NavLink> : <Link aria-current={active ? 'page' : undefined} className={linkClass(active, compact)} to={to}>{uiText(label)}</Link>}
    </li>)}
  </ul>
}
