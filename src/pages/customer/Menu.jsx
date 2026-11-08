import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect, useMemo } from 'react'
import FoodCard from '../../components/customer/FoodCard'
import MobileMenuSections from '../../components/customer/MobileMenuSections'
import MenuSkeleton from '../../components/customer/MenuSkeleton'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useCustomerSession from '../../hooks/useCustomerSession'
import useMenu from '../../hooks/useMenu'
import useMenuBrowse from '../../hooks/useMenuBrowse'

function MenuContent({ session }) {
  const { t } = useCustomerLanguage()
  const { categories, menuItems, popularItems, isLoading, error } = useMenu()
  const { root, category: activeCategory, setCategory: setActiveCategory, searchTerm, setSearchTerm, popularOnly, setPopularOnly } = useMenuBrowse(session, !isLoading && !error)
  const filters = [{ id: 'all', name: t('All') }, { id: 'popular', name: t('Popular') }, ...categories]

  useEffect(() => {
    if (!isLoading && !error && activeCategory !== 'all' && activeCategory !== 'popular' && !categories.some((category) => category.id === activeCategory)) {
      setActiveCategory('all')
    }
  }, [activeCategory, categories, isLoading, error, setActiveCategory])
  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])
  const filteredItems = useMemo(() => { const normalizedSearch = searchTerm.trim().toLowerCase(); const categoryItems = activeCategory === 'popular' ? popularItems : activeCategory === 'all' ? menuItems : menuItems.filter((menuItem) => menuItem.categoryId === activeCategory); return categoryItems.filter((menuItem) => `${menuItem.name} ${menuItem.description}`.toLowerCase().includes(normalizedSearch)) }, [activeCategory, menuItems, popularItems, searchTerm])
  const heading = activeCategory === 'popular' ? t('Popular right now') : activeCategory === 'all' ? t('Our menu') : categories.find((category) => category.id === activeCategory)?.name ?? t('Our menu')

  const emptyState = <StatePanel description={searchTerm ? t('Try a different search term or category.') : t('Please check back soon for available dishes.')} title={t('No menu items found')}/>

  return <div ref={root}>
    <div className="customer-mobile-menu lg:hidden">
      <div className="mb-2 px-1"><h1 className="text-2xl font-extrabold tracking-tight">{t('Menu')}</h1><p className="mt-1 text-xs leading-5 text-slate-500">{t(session?.isTakeawayQr?'This QR code accepts take-away items only.':'Choose dine in or take away for each item in your cart.')}</p></div>
      <div className="customer-mobile-menu-search">
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3" htmlFor="mobile-menu-search">
          <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
          <input aria-label={t('Search dishes, drinks and more')} className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm outline-none focus:ring-0" id="mobile-menu-search" onChange={(event) => setSearchTerm(event.target.value)} placeholder={t('Search dishes, drinks and more')} type="search" value={searchTerm}/>
        </label>
      </div>
      <MobileMenuSections categories={categories} menuItems={menuItems} popularItems={popularItems} searchTerm={searchTerm} isLoading={isLoading} error={error} initialPopularOnly={popularOnly} onPopularChange={setPopularOnly} />
    </div>
    <div className="hidden space-y-7 sm:space-y-9 lg:block">
      <SectionHeading description={t('Browse our dishes and drinks.')} eyebrow={session?.isTakeawayQr?t('Take-away ordering'):t('Table {{number}}', { number: session.tableNumber })} title={t('Menu')}/>
      <p className="text-sm text-slate-500">{t(session?.isTakeawayQr?'This QR code accepts take-away items only.':'Choose dine in or take away for each item in your cart.')}</p>
      <section className="surface-card p-3 sm:p-4">
        <label className="relative block" htmlFor="menu-search"><span aria-hidden="true" className="absolute left-3.5 top-3 text-lg text-slate-400 sm:left-4 sm:top-3.5">⌕</span><input className="w-full rounded-2xl border border-slate-100 bg-slate-50 py-3 pl-10 pr-3 text-sm font-medium shadow-inner shadow-slate-100/50 sm:py-3.5 sm:pl-11 sm:pr-4" id="menu-search" onChange={(event) => setSearchTerm(event.target.value)} placeholder={t('Search dishes, drinks and more')} type="search" value={searchTerm}/></label>
        <div aria-label={t('Menu categories')} className="mt-3 -mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-1 scroll-smooth sm:mt-4 sm:-mx-0 sm:px-0" role="tablist">{filters.map((category) => <button aria-selected={activeCategory === category.id} className={`snap-start whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition duration-200 focus:outline-none focus:ring-4 focus:ring-orange-100 sm:px-4 sm:py-2.5 sm:text-sm ${activeCategory === category.id ? 'scale-[1.03] bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-orange-50 hover:text-orange-700'}`} key={category.id} onClick={() => setActiveCategory(category.id)} role="tab" type="button">{category.icon ? `${category.icon} ` : ''}{category.name}</button>)}</div>
      </section>
      <section><div className="mb-4 flex items-end justify-between gap-3 sm:mb-5 sm:gap-4"><div><p className="eyebrow">{t('Explore')}</p><h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{heading}</h2></div><span aria-live="polite" className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700 sm:px-3 sm:py-1.5 sm:text-sm">{isLoading ? t('Loading...') : t('{{count}} items', { count: filteredItems.length })}</span></div>{isLoading ? <MenuSkeleton/> : error ? <StatePanel description={t(error)} title={t('Menu unavailable')} tone="error"/> : filteredItems.length === 0 ? emptyState : <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">{filteredItems.map((food) => <FoodCard categoryName={categoryNames.get(food.categoryId) ?? t('Menu item')} food={food} key={food.id}/>)}</div>}</section>
    </div>
  </div>
}

export default function Menu() {
  const { session } = useCustomerSession()
  return <MenuContent key={`${session?.sessionId ?? ''}:${session?.tableSessionId ?? ''}`} session={session} />
}
