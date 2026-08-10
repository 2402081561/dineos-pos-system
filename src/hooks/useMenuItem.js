import { useEffect, useState } from 'react'
import { subscribeToCategoryById } from '../services/categoryService'
import { getMenuItemById } from '../services/menuService'

function useMenuItem(menuItemId) {
  const [menuItem, setMenuItem] = useState(null)
  const [category, setCategory] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    let unsubscribeCategory = () => {}

    async function loadMenuItem() {
      try {
        setIsLoading(true)
        setError('')
        const menuItemData = await getMenuItemById(menuItemId)
        if (isMounted) {
          setMenuItem(menuItemData)
          if (menuItemData) {
            unsubscribeCategory = subscribeToCategoryById(
              menuItemData.categoryId,
              (categoryData) => {
                if (isMounted) setCategory(categoryData)
              },
              (firebaseError) => {
                console.error('[useMenuItem] Failed to subscribe to category:', firebaseError)
                if (isMounted) setError('We could not load this menu item right now. Please try again shortly.')
              },
            )
          } else {
            setCategory(null)
          }
        }
      } catch (error) {
        console.error('[useMenuItem] Failed to load Firestore menu item:', error)
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
      unsubscribeCategory()
    }
  }, [menuItemId])

  return { menuItem, category, isLoading, error }
}

export default useMenuItem
