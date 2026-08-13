import { useEffect, useMemo, useState } from 'react'
import { getPublicMenu } from '../services/customerApi'

function useMenu() {
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const items = await getPublicMenu()
        if (!active) return
        setMenuItems(items)
        setCategories([...new Map(items.filter((item) => item.categoryId && item.categoryName).map((item) => [item.categoryId, { id: item.categoryId, name: item.categoryName, sortOrder: item.categorySortOrder }])).values()].sort((first, second) => Number(first.sortOrder) - Number(second.sortOrder)))
        setError('')
      } catch (loadError) { if (active) setError(loadError.message || 'We could not load the menu right now.') } finally { if (active) setIsLoading(false) }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const popularItems = useMemo(
    () => menuItems.filter((menuItem) => menuItem.isPopular),
    [menuItems],
  )

  return { categories, menuItems, popularItems, isLoading, error }
}

export default useMenu
