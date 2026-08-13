import { useEffect, useState } from 'react'
import { subscribeToSupabaseAdminMenu } from '../services/adminApiService'

function useAdminMenu() {
  const [menuItems, setMenuItems] = useState([])
  const [categories, setCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    const unsubscribe = subscribeToSupabaseAdminMenu(
      ({ categories: categoryData, menuItems: items }) => {
        if (isMounted) {
          setCategories(categoryData.map((category) => ({ ...category, isActive: category.isEnabled })))
          setMenuItems(items)
          setIsLoading(false)
        }
      },
      (apiError) => {
        console.error('[useAdminMenu] API query failed:', apiError)
        if (isMounted) {
          setError('We could not load menu data right now. Please try again shortly.')
          setIsLoading(false)
        }
      },
    )

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  return { menuItems, categories, isLoading, error }
}

export default useAdminMenu
