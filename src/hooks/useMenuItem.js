import { useEffect, useState } from 'react'
import { getPublicMenu } from '../services/customerApi'

function useMenuItem(menuItemId) {
  const [menuItem, setMenuItem] = useState(null)
  const [category, setCategory] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadMenuItem() {
      try {
        setIsLoading(true)
        setError('')
        const menuItemData = (await getPublicMenu()).find((item) => item.id === menuItemId) ?? null
        if (isMounted) {
          setMenuItem(menuItemData)
          if (menuItemData) {
            setCategory({ id: menuItemData.categoryId, name: menuItemData.categoryName })
          } else {
            setCategory(null)
          }
        }
      } catch (error) {
        console.error('[useMenuItem] Failed to load menu item:', error)
        if (isMounted) {
          setError('We could not load this menu item right now. Please try again shortly.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadMenuItem()

    return () => {
      isMounted = false
    }
  }, [menuItemId])

  return { menuItem, category, isLoading, error }
}

export default useMenuItem
