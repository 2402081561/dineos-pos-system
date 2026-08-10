import { useEffect, useMemo, useState } from 'react'
import FoodCard from '../../components/customer/FoodCard'
import MenuSkeleton from '../../components/customer/MenuSkeleton'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useCustomerSession from '../../hooks/useCustomerSession'
import useMenu from '../../hooks/useMenu'

function Menu() {
  const { categories, menuItems, popularItems, isLoading, error } = useMenu()
  const { session } = useCustomerSession()
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const filters = [{ id: 'all', name: 'All' }, { id: 'popular', name: 'Popular' }, ...categories]

  useEffect(() => {
    if (activeCategory !== 'all' && activeCategory !== 'popular' && !categories.some((category) => category.id === activeCategory)) {
      setActiveCategory('all')
    }
  }, [activeCategory, categories])
  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])
  const filteredItems = useMemo(() => { const normalizedSearch = searchTerm.trim().toLowerCase(); const categoryItems = activeCategory === 'popular' ? popularItems : activeCategory === 'all' ? menuItems : menuItems.filter((menuItem) => menuItem.categoryId === activeCategory); return categoryItems.filter((menuItem) => `${menuItem.name} ${menuItem.description}`.toLowerCase().includes(normalizedSearch)) }, [activeCategory, menuItems, popularItems, searchTerm])
  const heading = activeCategory === 'popular' ? 'Popular right now' : activeCategory === 'all' ? 'Our menu' : categories.find((category) => category.id === activeCategory)?.name ?? 'Our menu'

  return <div className="space-y-9"><SectionHeading description={`Freshly made favourites for ${session.customerNickname}.`} eyebrow={`Table ${session.tableNumber}`} title="What are you craving?" /><section className="surface-card p-3 sm:p-4"><label className="relative block" htmlFor="menu-search"><span aria-hidden="true" className="absolute left-4 top-3.5 text-lg text-slate-400">⌕</span><input className="w-full rounded-2xl border border-slate-100 bg-slate-50 py-3.5 pl-11 pr-4 text-sm font-medium shadow-inner shadow-slate-100/50" id="menu-search" onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search dishes, drinks and more" type="search" value={searchTerm} /></label><div aria-label="Menu categories" className="mt-4 -mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-1 scroll-smooth sm:-mx-0 sm:px-0" role="tablist">{filters.map((category) => <button aria-selected={activeCategory === category.id} className={`snap-start whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition duration-200 focus:outline-none focus:ring-4 focus:ring-orange-100 ${activeCategory === category.id ? 'scale-[1.03] bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-orange-50 hover:text-orange-700'}`} key={category.id} onClick={() => setActiveCategory(category.id)} role="tab" type="button">{category.icon ? `${category.icon} ` : ''}{category.name}</button>)}</div></section><section><div className="mb-5 flex items-end justify-between gap-4"><div><p className="eyebrow">Explore</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{heading}</h2></div><span aria-live="polite" className="rounded-full bg-orange-50 px-3 py-1.5 text-sm font-bold text-orange-700">{isLoading ? 'Loading...' : `${filteredItems.length} items`}</span></div>{isLoading ? <MenuSkeleton /> : error ? <StatePanel description={error} title="Menu unavailable" tone="error" /> : filteredItems.length === 0 ? <StatePanel description={searchTerm ? 'Try a different search term or category.' : 'Please check back soon for available dishes.'} title="No menu items found" /> : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{filteredItems.map((food) => <FoodCard categoryName={categoryNames.get(food.categoryId) ?? 'Menu item'} food={food} key={food.id} />)}</div>}</section></div>
}

export default Menu
