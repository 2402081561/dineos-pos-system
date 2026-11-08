import { useEffect, useRef, useState } from 'react'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { updateSupabaseMenuFlags } from '../../services/adminApiService'

// Both workspaces use the existing availability-only API. This does not edit
// prices, delete dishes, or change items in orders that have already been sent.
export default function MenuAvailabilityControl({ item, disabled = false, onUpdated, onPendingChange }) {
  const { t } = useCustomerLanguage()
  const [isAvailable, setIsAvailable] = useState(item.isAvailable === true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const mounted = useRef(true)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { setIsAvailable(item.isAvailable === true) }, [item.id, item.isAvailable])

  async function changeAvailability() {
    if (busy.current || disabled) return
    busy.current = true
    setIsSaving(true)
    setError('')
    onPendingChange?.(item.id, true)
    try {
      const updated = await updateSupabaseMenuFlags(item, { isAvailable: !isAvailable })
      if (updated?.id !== item.id || typeof updated.isAvailable !== 'boolean') throw new Error('Invalid availability response')
      if (mounted.current) {
        setIsAvailable(updated.isAvailable)
        onUpdated?.(updated)
      }
    } catch {
      if (mounted.current) setError('Could not update availability. Please try again.')
    } finally {
      busy.current = false
      onPendingChange?.(item.id, false)
      if (mounted.current) {
        setIsSaving(false)
      }
    }
  }

  const action = isAvailable ? t('Mark sold out') : t('Restore availability')
  return <div className="min-w-0 space-y-2">
    <p aria-live="polite" className={isAvailable ? 'sr-only' : 'flex items-center gap-1.5 text-xs font-bold text-red-700'}>
      {isAvailable ? '' : <><span aria-hidden="true">⊘</span>{t('Sold out')}</>}
    </p>
    <button aria-label={t('Availability for {{name}}: {{action}}', { name: item.name, action })} aria-busy={isSaving || undefined} className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${isAvailable ? 'border-red-300 bg-red-50 text-red-700 hover:border-red-500 hover:bg-red-100 focus-visible:ring-red-500' : 'border-emerald-700 bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 focus-visible:ring-emerald-500'}`} disabled={disabled || isSaving} onClick={() => void changeAvailability()} type="button">
      <span aria-hidden="true" className={isSaving ? 'h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent' : 'shrink-0'}>{isSaving ? null : isAvailable ? '⊘' : '✓'}</span>
      {isSaving ? t('Updating availability...') : action}
    </button>
    {error && <p role="alert" className="text-xs font-semibold leading-5 text-red-700">{t(error)}</p>}
  </div>
}
