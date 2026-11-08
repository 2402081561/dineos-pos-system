import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { groupMobileMenuItems, visibleMenuSection } from '../../utils/mobileMenuSections'
import MobileMenuItem from './MobileMenuItem'
import MenuSkeleton from './MenuSkeleton'
import StatePanel from '../common/StatePanel'

export default function MobileMenuSections({ categories, menuItems, popularItems, searchTerm, isLoading, error, initialPopularOnly = false, onPopularChange }) {
  const { t } = useCustomerLanguage()
  const [popularOnly, setPopularOnly] = useState(initialPopularOnly)
  const [active, setActive] = useState('all')
  const root = useRef(null)
  const rail = useRef(null)
  const sectionElements = useRef(new Map())
  const buttons = useRef(new Map())
  const pending = useRef(null)
  const locked = useRef(null)
  const query = searchTerm.trim().toLowerCase()
  const filtered = useMemo(() => (popularOnly ? popularItems : menuItems).filter((item) => `${item.name} ${item.description ?? ''}`.toLowerCase().includes(query)), [popularOnly, popularItems, menuItems, query])
  const otherName = t('Uncategorised')
  const groups = useMemo(() => popularOnly ? filtered.length ? [{ id: 'popular', name: t('Popular right now'), items: filtered }] : [] : groupMobileMenuItems(categories, filtered, otherName), [categories, filtered, otherName, popularOnly, t])
  const matchingCategories = categories.filter((category) => !query || menuItems.some((item) => item.categoryId === category.id && `${item.name} ${item.description ?? ''}`.toLowerCase().includes(query)))
  const filters = [{ id: 'all', name: t('All') }, { id: 'popular', name: t('Popular') }, ...matchingCategories, ...groups.filter((group) => group.id === 'uncategorised')]

  const anchor = useCallback(() => {
    const search = root.current?.closest('.customer-mobile-menu')?.querySelector('.customer-mobile-menu-search')
    const header = root.current?.closest('.customer-ui')?.querySelector('[data-portal-header]')
    // Before the first jump the search field is not sticky yet. Its current
    // bottom would produce a different landing position from later jumps.
    return (header?.getBoundingClientRect().bottom ?? 68) + (search?.getBoundingClientRect().height ?? 64) + 12
  }, [])
  const jump = useCallback((id) => {
    const target = id === 'all' ? root.current : sectionElements.current.get(id)
    if (!target) return
    locked.current = { id, until: Date.now() + 1400 }
    setActive(id)
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - anchor())
    window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }, [anchor])
  function select(id) {
    locked.current = null
    if (popularOnly !== (id === 'popular')) {
      pending.current = id
      setPopularOnly(id === 'popular')
      onPopularChange?.(id === 'popular')
    } else jump(id)
    setActive(id)
  }

  useEffect(() => {
    if (pending.current !== null) {
      const id = pending.current
      pending.current = null
      jump(id)
    }
    let frame = null
    const update = () => {
      frame = null
      if (!root.current || window.matchMedia('(min-width: 1024px)').matches) return
      const offset = anchor()
      const atBottom = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 3
      const positions = groups.flatMap((group) => {
        const element = sectionElements.current.get(group.id)
        return element ? [{ id: group.id, top: element.getBoundingClientRect().top }] : []
      })
      if (locked.current) {
        const target = locked.current.id === 'all' ? root.current : sectionElements.current.get(locked.current.id)
        if (Date.now() < locked.current.until && target && Math.abs(target.getBoundingClientRect().top - offset) > 3 && !atBottom) return
        locked.current = null
      }
      setActive(popularOnly ? 'popular' : visibleMenuSection(positions, offset, atBottom))
    }
    const schedule = () => { if (frame === null) frame = window.requestAnimationFrame(update) }
    const interrupt = () => { locked.current = null; schedule() }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('wheel', interrupt, { passive: true })
    window.addEventListener('touchstart', interrupt, { passive: true })
    window.addEventListener('keydown', interrupt)
    schedule()
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('wheel', interrupt)
      window.removeEventListener('touchstart', interrupt)
      window.removeEventListener('keydown', interrupt)
    }
  }, [groups, popularOnly, anchor, jump])

  useEffect(() => {
    const container = rail.current, button = buttons.current.get(active)
    if (!container || !button) return
    const bounds = container.getBoundingClientRect(), target = button.getBoundingClientRect()
    // Scroll only the category rail, never the whole document.
    if (target.top < bounds.top) container.scrollTop -= bounds.top - target.top + 8
    else if (target.bottom > bounds.bottom) container.scrollTop += target.bottom - bounds.bottom + 8
  }, [active])

  return <div className="customer-mobile-menu-columns">
    <aside aria-label={t('Menu categories')} className="customer-mobile-categories" ref={rail}>
      <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('Categories')}</p>
      <div className="space-y-1">{filters.map((category) => <button aria-controls="mobile-menu-items" aria-pressed={active === category.id} className={`mobile-menu-category ${active === category.id ? 'mobile-menu-category--active' : ''}`} key={category.id} ref={(element) => { if (element) buttons.current.set(category.id, element); else buttons.current.delete(category.id) }} onClick={() => select(category.id)} type="button">{category.icon && <span aria-hidden="true" className="mr-1">{category.icon}</span>}{category.name}</button>)}</div>
    </aside>
    <section aria-label={t('Our menu')} className="customer-mobile-menu-results" id="mobile-menu-items" ref={root}>
      <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold text-slate-900">{t(popularOnly ? 'Popular right now' : 'Our menu')}</h2><span aria-live="polite" className="text-[11px] text-slate-500">{isLoading ? t('Loading...') : t('{{count}} items', { count: filtered.length })}</span></div>
      {isLoading ? <MenuSkeleton compact /> : error ? <StatePanel description={t(error)} title={t('Menu unavailable')} tone="error" /> : !groups.length ? <StatePanel description={t(query ? 'Try a different search term or category.' : 'Please check back soon for available dishes.')} title={t('No menu items found')} /> : groups.map((group, index) => <section className="customer-mobile-menu-section" data-menu-section={group.id} key={group.id} ref={(element) => { if (element) sectionElements.current.set(group.id, element); else sectionElements.current.delete(group.id) }}>
        <div className={`flex min-h-9 items-start justify-between gap-2 ${index ? 'mt-5' : ''}`}><h3 className="min-w-0 break-words text-sm font-bold leading-6 text-slate-900">{group.name}</h3><span className="pt-1 text-[11px] text-slate-500">{group.items.length}</span></div>
        <div className="divide-y divide-slate-100">{group.items.map((food) => <MobileMenuItem food={food} key={food.id} />)}</div>
      </section>)}
    </section>
  </div>
}
