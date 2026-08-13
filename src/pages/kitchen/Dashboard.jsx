import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import KitchenOrderCard from '../../components/kitchen/KitchenOrderCard'
import KitchenOrderSkeleton from '../../components/kitchen/KitchenOrderSkeleton'
import useKitchenOrders from '../../hooks/useKitchenOrders'
import { updateSupabaseKitchenOrderStatus } from '../../services/adminApiService'
import { useEffect, useMemo, useRef, useState } from 'react'

const soundPreferenceKey = 'dineos.kitchenAlertSoundEnabled'

function readSoundPreference() {
  try { return localStorage.getItem(soundPreferenceKey) === 'true' } catch { return false }
}

function orderLabel(order) {
  return order.orderNumber ?? `#${String(order?.id ?? '').slice(-6).toUpperCase() || '—'}`
}

function Dashboard() {
  const { orders, isLoading, error, newOrderIds, refresh } = useKitchenOrders()
  const [updatingOrderIds, setUpdatingOrderIds] = useState(new Set())
  const [updateError, setUpdateError] = useState('')
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const updatingOrderIdsRef = useRef(new Set())
  const isMountedRef = useRef(true)
  const audioContextRef = useRef(null)
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
    audioContextRef.current?.close?.().catch(() => {})
  }, [])

  useEffect(() => {
    const alertKey = newOrders.map((order) => order.id).sort().join(',')
    if (!soundEnabled || !alertKey || lastSoundAlertKeyRef.current === alertKey) return
    lastSoundAlertKeyRef.current = alertKey
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return
      const context = audioContextRef.current ?? new AudioContext()
      audioContextRef.current = context
      const playTone = () => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.frequency.value = 880
        gain.gain.setValueAtTime(0.06, context.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start()
        oscillator.stop(context.currentTime + 0.18)
      }
      if (context.state === 'suspended') context.resume().then(playTone).catch(() => {})
      else playTone()
    } catch { /* Sound is optional; the visual alert remains available. */ }
  }, [newOrders, soundEnabled])

  function toggleSound() {
    const nextEnabled = !soundEnabled
    setSoundEnabled(nextEnabled)
    try { localStorage.setItem(soundPreferenceKey, String(nextEnabled)) } catch { /* Sound preference is optional UX state. */ }
  }

  async function handleUpdateStatus(orderId, status, expectedStatus) {
    if (updatingOrderIdsRef.current.has(orderId)) return

    try {
      updatingOrderIdsRef.current.add(orderId)
      setUpdatingOrderIds(new Set(updatingOrderIdsRef.current))
      setUpdateError('')
      await updateSupabaseKitchenOrderStatus(orderId, status, expectedStatus)
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

  return <div className="space-y-7"><SectionHeading action={<button aria-pressed={soundEnabled} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-300" onClick={toggleSound} type="button">{soundEnabled ? '🔔 Sound on' : '🔕 Sound off'}</button>} eyebrow="Kitchen command centre" title="Incoming orders" description="Keep every table moving with a clear, live kitchen queue." />{newOrders.length > 0 && <section aria-live="polite" className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-950 shadow-sm"><p className="font-extrabold">🔔 New order{newOrders.length === 1 ? '' : 's'} waiting</p><p className="mt-1 text-sm text-orange-900">{newOrders.map((order) => `Table ${order.tableNumber ?? order.tableId ?? '—'} · ${orderLabel(order)}`).join('  •  ')}</p></section>}{updateError && <StatePanel description={updateError} title="Order update failed" tone="error" />}{isLoading ? <div className="grid gap-5 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <KitchenOrderSkeleton key={index} />)}</div> : error ? <StatePanel description={error} title="Kitchen orders unavailable" tone="error" /> : orders.length === 0 ? <StatePanel description="New customer orders will appear here automatically." title="No active kitchen orders." /> : <div className="grid gap-5 lg:grid-cols-3">{orders.map((order) => <KitchenOrderCard isNewOrder={newOrderIds.has(order.id)} isUpdating={updatingOrderIds.has(order.id)} key={order.id} now={currentTime} onUpdateStatus={handleUpdateStatus} order={order} />)}</div>}</div>
}

export default Dashboard
