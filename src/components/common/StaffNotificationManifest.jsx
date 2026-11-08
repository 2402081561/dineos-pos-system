import { useEffect } from 'react'

// Staff installation must not change a customer's saved menu/home-screen link.
export default function StaffNotificationManifest() {
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'manifest'; link.href = '/manifest.webmanifest'
    document.head.append(link)
    return () => link.remove()
  }, [])
  return null
}
