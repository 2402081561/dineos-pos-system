// Per-tab storage is intentional: admin, cashier, kitchen and staff can sign
// in independently. Never fall back to shared localStorage when access is denied.
export function createTabAuthStorage({ getStorage = () => window.sessionStorage, createId = () => crypto.randomUUID() } = {}) {
  const memory = new Map()
  let browserStorage
  let tabId = createId()
  try {
    browserStorage = getStorage()
    tabId = browserStorage.getItem('dineos-auth-tab-id') || tabId
    browserStorage.setItem('dineos-auth-tab-id', tabId)
  } catch { browserStorage = null }
  memory.set('dineos-auth-tab-id', tabId)
  const storage = {
    getItem(key) {
      if (browserStorage) {
        try {
          const value = browserStorage.getItem(key)
          if (value === null) memory.delete(key)
          else memory.set(key, value)
          return value
        } catch { browserStorage = null }
      }
      return memory.get(key) ?? null
    },
    setItem(key, value) {
      memory.set(key, String(value))
      try { browserStorage?.setItem(key, String(value)) } catch { browserStorage = null }
    },
    removeItem(key) {
      memory.delete(key)
      try { browserStorage?.removeItem(key) } catch { browserStorage = null }
    },
  }
  return { storage, tabId }
}
