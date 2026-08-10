import { useEffect, useState } from 'react'
import { subscribeToCategories } from '../services/categoryService'
import { subscribeToAllMenuItems } from '../services/menuService'

function useAdminMenu() {
  const [menuItems, setMenuItems] = useState([])
  const [categories, setCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    const unsubscribeCategories = subscribeToCategories(
      (categoryData) => {
        if (isMounted) setCategories(categoryData)
      },
      (firebaseError) => {
        console.error('[useAdminMenu] Category query failed:', firebaseError)
        if (isMounted) setError('We could not load menu data right now. Please try again shortly.')
      },
    )

    const unsubscribe = subscribeToAllMenuItems(
      (items) => {
        if (isMounted) {
          setMenuItems(items)
          setIsLoading(false)
        }
      },
      (firebaseError) => {
        console.error('[useAdminMenu] Menu query failed:', firebaseError)
        if (isMounted) {
          setError('We could not load menu data right now. Please try again shortly.')
          setIsLoading(false)
        }
      },
    )

    return () => {
      isMounted = false
      unsubscribeCategories()
      unsubscribe()
    }
  }, [])

  return { menuItems, categories, isLoading, error }
}

export default useAdminMenu
