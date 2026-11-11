import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribeToSupabaseAdminMenu } from '../services/adminApiService'

function useAdminMenu() {
  const [menuItems, setMenuItems] = useState([])
  const [categories, setCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const feed = useRef(null)

  useEffect(() => {
    let isMounted = true

    const unsubscribe = subscribeToSupabaseAdminMenu(
      ({ categories: categoryData, menuItems: items }) => {
        if (isMounted) {
          setCategories(categoryData.map((category) => ({ ...category, isActive: category.isEnabled })))
          setMenuItems(items)
          setError('')
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

    feed.current = unsubscribe
    return () => {
      feed.current = null
      isMounted = false
      unsubscribe()
    }
  }, [])

  const applySavedItem = useCallback((item) => {
    if (!item?.id) return
    feed.current?.invalidate?.()
    setMenuItems(current => current.some(entry => entry.id === item.id) ? current.map(entry => entry.id === item.id ? { ...entry, ...item } : entry) : [...current, item])
    void feed.current?.refreshLatest?.()
  }, [])

  return { menuItems, categories, isLoading, error, applySavedItem }
}

export default useAdminMenu
