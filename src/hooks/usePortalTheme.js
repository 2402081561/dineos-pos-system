import { useLayoutEffect, useState } from 'react'

export const PORTAL_THEME_KEY = 'dineos.portal.theme'

function savedTheme() {
  try {
    // Retain the choice made in the first, Admin-only local preview.
    const value = window.localStorage.getItem(PORTAL_THEME_KEY) ?? window.localStorage.getItem('dineos.admin.theme')
    return value === 'dark' ? 'dark' : 'light'
  }
  catch { return 'light' }
}

// Mounted by the employee portal shell or its standalone login page only.
// Covers body-mounted dialogs and clears on leaving for the customer site.
export default function usePortalTheme(enabled = true) {
  const [theme, setTheme] = useState(() => enabled ? savedTheme() : 'light')
  useLayoutEffect(() => {
    if (!enabled) return undefined
    const root = document.documentElement
    const previous = root.getAttribute('data-portal-theme')
    root.setAttribute('data-portal-theme', theme)
    try { window.localStorage.setItem(PORTAL_THEME_KEY, theme) } catch { /* Private browsing may block storage. */ }
    return () => {
      if (previous === null) root.removeAttribute('data-portal-theme')
      else root.setAttribute('data-portal-theme', previous)
    }
  }, [enabled, theme])
  return { theme, toggleTheme: () => setTheme(current => current === 'dark' ? 'light' : 'dark') }
}
