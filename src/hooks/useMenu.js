import { useEffect, useMemo, useState } from 'react'
import { subscribeToActiveCategories } from '../services/categoryService'
import { subscribeToAllMenuItems } from '../services/menuService'

function useMenu() {
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    setIsLoading(true)
    setError('')

    const unsubscribeMenuItems = subscribeToAllMenuItems(
      (menuItemData) => {
        if (!isMounted) return
        setMenuItems(menuItemData)
        setIsLoading(false)
      },
      (firebaseError) => {
        console.error('[useMenu] Failed to subscribe to menu items:', firebaseError)
        if (!isMounted) return
        setError('We could not load the menu right now. Please try again shortly.')
        setIsLoading(false)
      },
    )

    const unsubscribe = subscribeToActiveCategories(
      (categoryData) => {
        if (isMounted) setCategories(categoryData)
      },
      (firebaseError) => {
        console.error('[useMenu] Failed to subscribe to categories:', firebaseError)
        if (isMounted) setError('We could not load the menu right now. Please try again shortly.')
      },
    )

    return () => {
      isMounted = false
      unsubscribeMenuItems()
      unsubscribe()
    }
  }, [])

  const popularItems = useMemo(
    () => menuItems.filter((menuItem) => menuItem.isPopular),
    [menuItems],
  )

  return { categories, menuItems, popularItems, isLoading, error }
}

export default useMenu
