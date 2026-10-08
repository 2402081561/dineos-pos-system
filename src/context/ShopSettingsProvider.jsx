import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShopSettingsContext } from './ShopSettingsContext'
import { getShopSettings, updateShopSettings } from '../services/shopSettingsService'
import { defaultConfig } from '../../server/src/posRules'

export default function ShopSettingsProvider({ children }) {
  const [settings, setSettings] = useState({ name: 'DineOS', config: defaultConfig, revision: 0, isAcceptingOrders: false })
  const name = settings.name
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
      setSettings(settings)
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

  const saveSettings = useCallback(async (nextSettings, expectedRevision) => {
    // A delayed read must not undo the name returned by a successful save.
    ++revision.current
    pending.current?.abort()
    const settings = await updateShopSettings(nextSettings, expectedRevision)
    ++revision.current
    pending.current?.abort()
    setSettings(settings)
    setError('')
    setIsLoading(false)
    return settings
  }, [])

  const value = useMemo(() => ({ name, settings, config: settings.config, isLoading, error, refresh, saveSettings }), [name, settings, isLoading, error, refresh, saveSettings])
  return <ShopSettingsContext.Provider value={value}>{children}</ShopSettingsContext.Provider>
}
