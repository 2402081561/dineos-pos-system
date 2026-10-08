import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect, useMemo, useState } from 'react'
import FoodCard from '../../components/customer/FoodCard'
import MenuSkeleton from '../../components/customer/MenuSkeleton'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useCustomerSession from '../../hooks/useCustomerSession'
import useMenu from '../../hooks/useMenu'

function Menu() {
  const { t } = useCustomerLanguage()
  const { categories, menuItems, popularItems, isLoading, error } = useMenu()
  const { session } = useCustomerSession()
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const filters = [{ id: 'all', name: t('All') }, { id: 'popular', name: t('Popular') }, ...categories]

  useEffect(() => {
    if (activeCategory !== 'all' && activeCategory !== 'popular' && !categories.some((category) => category.id === activeCategory)) {
      setActiveCategory('all')
    }
  }, [activeCategory, categories])
  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])
  const filteredItems = useMemo(() => { const normalizedSearch = searchTerm.trim().toLowerCase(); const categoryItems = activeCategory === 'popular' ? popularItems : activeCategory === 'all' ? menuItems : menuItems.filter((menuItem) => menuItem.categoryId === activeCategory); return categoryItems.filter((menuItem) => `${menuItem.name} ${menuItem.description}`.toLowerCase().includes(normalizedSearch)) }, [activeCategory, menuItems, popularItems, searchTerm])
  const heading = activeCategory === 'popular' ? t('Popular right now') : activeCategory === 'all' ? t('Our menu') : categories.find((category) => category.id === activeCategory)?.name ?? t('Our menu')

  return <div className="space-y-7 sm:space-y-9"><SectionHeading description={t("Browse our dishes and drinks.")} eyebrow={t('Table {{number}}', { number: session.tableNumber })} title={t("Menu")} /><p className="text-sm text-slate-500">{t("Choose dine in or take away for each item in your cart.")}</p><section className="surface-card p-3 sm:p-4"><label className="relative block" htmlFor="menu-search"><span aria-hidden="true" className="absolute left-3.5 top-3 text-lg text-slate-400 sm:left-4 sm:top-3.5">⌕</span><input className="w-full rounded-2xl border border-slate-100 bg-slate-50 py-3 pl-10 pr-3 text-sm font-medium shadow-inner shadow-slate-100/50 sm:py-3.5 sm:pl-11 sm:pr-4" id="menu-search" onChange={(event) => setSearchTerm(event.target.value)} placeholder={t("Search dishes, drinks and more")} type="search" value={searchTerm} /></label><div aria-label={t("Menu categories")} className="mt-3 -mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-1 scroll-smooth sm:mt-4 sm:-mx-0 sm:px-0" role="tablist">{filters.map((category) => <button aria-selected={activeCategory === category.id} className={`snap-start whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition duration-200 focus:outline-none focus:ring-4 focus:ring-orange-100 sm:px-4 sm:py-2.5 sm:text-sm ${activeCategory === category.id ? 'scale-[1.03] bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-orange-50 hover:text-orange-700'}`} key={category.id} onClick={() => setActiveCategory(category.id)} role="tab" type="button">{category.icon ? `${category.icon} ` : ''}{category.name}</button>)}</div></section><section><div className="mb-4 flex items-end justify-between gap-3 sm:mb-5 sm:gap-4"><div><p className="eyebrow">{t("Explore")}</p><h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{heading}</h2></div><span aria-live="polite" className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700 sm:px-3 sm:py-1.5 sm:text-sm">{isLoading ? t("Loading...") : t('{{count}} items', { count: filteredItems.length })}</span></div>{isLoading ? <MenuSkeleton /> : error ? <StatePanel description={t(error)} title={t("Menu unavailable")} tone="error" /> : filteredItems.length === 0 ? <StatePanel description={searchTerm ? t("Try a different search term or category.") : t("Please check back soon for available dishes.")} title={t("No menu items found")} /> : <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">{filteredItems.map((food) => <FoodCard categoryName={categoryNames.get(food.categoryId) ?? t('Menu item')} food={food} key={food.id} />)}</div>}</section></div>
}

export default Menu
