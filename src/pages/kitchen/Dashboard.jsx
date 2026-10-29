import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import KitchenOrderCard from '../../components/kitchen/PrintableKitchenOrderCard'
import KitchenOrderSkeleton from '../../components/kitchen/KitchenOrderSkeleton'
import useKitchenOrders from '../../hooks/useKitchenOrders'
import { updateSupabaseKitchenOrderStatus } from '../../services/adminApiService'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { playKitchenAlert } from '../../utils/kitchenAlert'

const soundPreferenceKey = 'dineos.kitchenAlertSoundEnabled'

function readSoundPreference() {
  try { return localStorage.getItem(soundPreferenceKey) !== 'false' } catch { return true }
}

function orderLabel(order) {
  return order.orderNumber ?? `#${String(order?.id ?? '').slice(-6).toUpperCase() || '—'}`
}

function Dashboard() {
  const { t: uiText } = useCustomerLanguage()

  const { orders, isLoading, error, newOrderIds, refresh } = useKitchenOrders()
  const [updatingOrderIds, setUpdatingOrderIds] = useState(new Set())
  const [updateError, setUpdateError] = useState('')
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const updatingOrderIdsRef = useRef(new Set())
  const isMountedRef = useRef(true)
  const audioContextRef = useRef(null)
  const alertSoundRef = useRef(null)
  const playbackGenerationRef = useRef(0)
  const [soundError, setSoundError] = useState('')
  const soundEnabledRef = useRef(readSoundPreference())
  const lastSoundAlertKeyRef = useRef('')
  const [soundEnabled, setSoundEnabled] = useState(readSoundPreference)
  const newOrders = useMemo(() => orders.filter((order) => newOrderIds.has(order.id)), [newOrderIds, orders])

  useEffect(() => {
    isMountedRef.current = true
    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 30000)
    return () => {
      isMountedRef.current = false
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => () => {
    ++playbackGenerationRef.current
    alertSoundRef.current?.stop()
    audioContextRef.current?.close?.().catch(() => {})
    audioContextRef.current = null
  }, [])

  const playAlert = useCallback(async (preview = false) => {
    const generation = ++playbackGenerationRef.current
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) throw new Error('This browser does not support audio.')
      const context = audioContextRef.current ?? new AudioContext()
      audioContextRef.current = context
      if (context.state === 'suspended') await context.resume()
      if (!isMountedRef.current || generation !== playbackGenerationRef.current || (!preview && !soundEnabledRef.current)) return
      alertSoundRef.current?.stop()
      alertSoundRef.current = playKitchenAlert(context)
      setSoundError('')
    } catch {
      if (isMountedRef.current && generation === playbackGenerationRef.current) setSoundError('Could not play the alert. Click Test sound and check your device volume / mute setting.')
    }
  }, [])

  useEffect(() => {
    const alertKey = newOrders.map((order) => order.id).sort().join(',')
    if (!soundEnabled || !alertKey || lastSoundAlertKeyRef.current === alertKey) return
    lastSoundAlertKeyRef.current = alertKey
    void playAlert()
  }, [newOrders, soundEnabled, playAlert])

  function toggleSound() {
    const nextEnabled = !soundEnabled
    soundEnabledRef.current = nextEnabled
    if (!nextEnabled) {
      ++playbackGenerationRef.current
      alertSoundRef.current?.stop()
      lastSoundAlertKeyRef.current = ''
    } else {
      // Preview also unlocks audio in this user gesture for subsequent orders.
      lastSoundAlertKeyRef.current = newOrders.map((order) => order.id).sort().join(',')
      void playAlert()
    }
    setSoundEnabled(nextEnabled)
    try { localStorage.setItem(soundPreferenceKey, String(nextEnabled)) } catch { /* Sound preference is optional UX state. */ }
  }

  async function handleUpdateStatus(orderId, status, expectedStatus, expectedVersion) {
    if (error || updatingOrderIdsRef.current.has(orderId)) return

    try {
      updatingOrderIdsRef.current.add(orderId)
      setUpdatingOrderIds(new Set(updatingOrderIdsRef.current))
      setUpdateError('')
      await updateSupabaseKitchenOrderStatus(orderId, status, expectedStatus, expectedVersion)
      await refresh()
    } catch (apiError) {
      console.error('[Kitchen Dashboard] Failed to update order status:', apiError)
      setUpdateError(apiError.message?.includes('updated by another') ? 'This order was already updated. The queue will refresh automatically.' : 'We could not update this order. Please try again.')
      if (apiError.message?.includes('updated by another')) {
        await refresh()
        window.setTimeout(() => { if (isMountedRef.current) setUpdateError('') }, 2500)
      }
    } finally {
      updatingOrderIdsRef.current.delete(orderId)
      if (isMountedRef.current) setUpdatingOrderIds(new Set(updatingOrderIdsRef.current))
    }
  }

  return <div className="space-y-7"><SectionHeading action={<div className="flex flex-wrap gap-2"><button className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700 hover:bg-orange-100" onClick={() => void playAlert(true)} type="button">{uiText("▶ Test sound")}</button><button aria-pressed={soundEnabled} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-300" onClick={toggleSound} type="button">{uiText(soundEnabled ? '🔔 Sound on' : '🔕 Sound off')}</button></div>} eyebrow={uiText("Kitchen command centre")} title={uiText("Incoming orders")} description={uiText("Keep every table moving with a clear, live kitchen queue.")} />{soundError && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{uiText(soundError)}</p>}{newOrders.length > 0 && <section aria-live="polite" className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-950 shadow-sm"><p className="font-extrabold">🔔 {uiText("New orders waiting")}</p><p className="mt-1 text-sm text-orange-900">{newOrders.map((order) => `${uiText('Table {{number}}', { number: order.tableNumber ?? order.tableId ?? '—' })} · ${orderLabel(order)}${order.orderType === 'take_away' ? uiText(" · TAKE AWAY") : ''}`).join('  •  ')}</p></section>}{updateError && <StatePanel description={uiText(updateError)} title={uiText("Order update failed")} tone="error" />}{isLoading ? <div className="grid gap-5 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <KitchenOrderSkeleton key={index} />)}</div> : error && orders.length === 0 ? <StatePanel description={uiText(error)} title={uiText("Kitchen orders unavailable")} tone="error" /> : orders.length === 0 ? <StatePanel description={uiText("New customer orders will appear here automatically.")} title={uiText("No active kitchen orders.")} /> : <div className="grid gap-5 lg:grid-cols-3">{orders.map((order) => <KitchenOrderCard isNewOrder={newOrderIds.has(order.id)} isUpdating={Boolean(error) || updatingOrderIds.has(order.id)} key={order.id} now={currentTime} onUpdateStatus={handleUpdateStatus} order={order} />)}</div>}</div>
}

export default Dashboard
