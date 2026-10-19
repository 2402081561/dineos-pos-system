import { useEffect, useMemo, useState } from 'react'
import { getPublicMenu } from '../services/customerApi'
import { subscribePoll } from '../utils/pollSubscription'

function useMenu() {
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    return subscribePoll(getPublicMenu, (items) => {
      setMenuItems(items)
      setCategories([...new Map(items.filter((item) => item.categoryId && item.categoryName).map((item) => [item.categoryId, { id: item.categoryId, name: item.categoryName, sortOrder: item.categorySortOrder }])).values()].sort((first, second) => Number(first.sortOrder) - Number(second.sortOrder)))
      setError('')
      setIsLoading(false)
    }, (loadError) => { setError(loadError.message || 'We could not load the menu right now.'); setIsLoading(false) }, 30000)
  }, [])

  const popularItems = useMemo(
    () => menuItems.filter((menuItem) => menuItem.isPopular),
    [menuItems],
  )

  return { categories, menuItems, popularItems, isLoading, error }
}

export default useMenu
