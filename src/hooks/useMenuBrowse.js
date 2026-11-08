import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { customerVisitStorage } from '../utils/customerVisitStorage'
import { menuRestoreTop } from '../utils/menuBrowseState'

// One snapshot per tab and table visit. Never restore while menu polling updates.
export default function useMenuBrowse(session, ready) {
  const [initial] = useState(() => customerVisitStorage.readMenuBrowse(session))
  const [searchTerm, setSearchTerm] = useState(initial.searchTerm)
  const [category, setCategory] = useState(initial.category)
  const [popularOnly, setPopularOnly] = useState(initial.popularOnly)
  const root = useRef(null)
  const latest = useRef(initial)
  const restored = useRef(false)

  useLayoutEffect(() => {
    if (!ready || restored.current || !root.current) return
    const rows = [...root.current.querySelectorAll('[data-menu-item]')].filter((row) => row.getClientRects().length)
    const anchor = rows.find((row) => row.dataset.menuItem === initial.anchorId)
    window.scrollTo({ top: menuRestoreTop(initial, anchor?.getBoundingClientRect().top, window.scrollY), left: 0, behavior: 'instant' })
    restored.current = true
  }, [ready, initial])

  useEffect(() => {
    latest.current = { ...latest.current, searchTerm, category, popularOnly }
    customerVisitStorage.saveMenuBrowse(session, latest.current)
  }, [session, searchTerm, category, popularOnly])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let navigating = false
    function capture() {
      if (navigating || !restored.current || !root.current?.isConnected) return
      const rows = [...root.current.querySelectorAll('[data-menu-item]')]
      const anchor = rows.find((row) => row.getClientRects().length && row.getBoundingClientRect().bottom > 144)
      latest.current = { ...latest.current, scrollY: window.scrollY, anchorId: anchor?.dataset.menuItem ?? '', anchorTop: anchor?.getBoundingClientRect().top ?? 0 }
      customerVisitStorage.saveMenuBrowse(session, latest.current)
    }
    function beforeNavigation(event) {
      const link = event.target.closest?.('a[href]')
      if (!link || link.getAttribute('href') === '/menu' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      capture()
      // A route change can clamp the old document scroll before React's
      // passive cleanup. Keep the position from the actual link activation.
      navigating = true
    }
    window.addEventListener('scroll', capture, { passive: true })
    window.addEventListener('pagehide', capture)
    window.addEventListener('click', beforeNavigation, true)
    return () => {
      // Use the last captured position: the next page may already have scrolled
      // to the top or removed our DOM before effect cleanup runs.
      customerVisitStorage.saveMenuBrowse(session, latest.current)
      window.removeEventListener('scroll', capture)
      window.removeEventListener('pagehide', capture)
      window.removeEventListener('click', beforeNavigation, true)
    }
  }, [session])

  return { root, searchTerm, setSearchTerm, category, setCategory, popularOnly, setPopularOnly }
}
