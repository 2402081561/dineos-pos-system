import { useEffect, useRef, useState } from 'react'
import { ToastContext } from './ToastContext'

function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timeoutRef = useRef(null)

  function showToast(message, tone = 'success', options = {}) {
    clearTimeout(timeoutRef.current)
    setToast({ message, tone, ...options })
    timeoutRef.current = setTimeout(() => setToast(null), 4000)
  }

  function dismissToast() {
    clearTimeout(timeoutRef.current)
    setToast(null)
  }

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  return <ToastContext.Provider value={{ toast, showToast, dismissToast }}>{children}</ToastContext.Provider>
}

export default ToastProvider
