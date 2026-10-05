import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShopSettingsContext } from './ShopSettingsContext'
import { getShopSettings, updateShopSettings } from '../services/shopSettingsService'

export default function ShopSettingsProvider({ children }) {
  const [name, setName] = useState('DineOS')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const revision = useRef(0)
  const pending = useRef(null)

  const invalidateRead = useCallback(() => {
    ++revision.current
    pending.current?.abort()
  }, [])

  const refresh = useCallback(async () => {
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    const currentRevision = ++revision.current
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    try {
      const settings = await getShopSettings(controller.signal)
      if (currentRevision !== revision.current) return
      setName(settings.name)
      setError('')
    } catch (loadError) {
      if (currentRevision !== revision.current) return
      setError(loadError.name === 'AbortError' ? 'Shop settings took too long to load. Please try again.' : loadError.message)
    } finally {
      window.clearTimeout(timeout)
      if (currentRevision === revision.current) {
        setIsLoading(false)
        pending.current = null
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(onVisible, 30000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      invalidateRead()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, invalidateRead])

  const saveName = useCallback(async (nextName, expectedName) => {
    // A delayed read must not undo the name returned by a successful save.
    ++revision.current
    pending.current?.abort()
    const settings = await updateShopSettings(nextName, expectedName)
    ++revision.current
    pending.current?.abort()
    setName(settings.name)
    setError('')
    setIsLoading(false)
    return settings
  }, [])

  const value = useMemo(() => ({ name, isLoading, error, refresh, saveName }), [name, isLoading, error, refresh, saveName])
  return <ShopSettingsContext.Provider value={value}>{children}</ShopSettingsContext.Provider>
}
