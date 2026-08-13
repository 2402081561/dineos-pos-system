import { useEffect, useMemo, useRef, useState } from 'react'

const soundPreferenceKey = 'dineos.staffAlertSoundEnabled'
const acknowledgedRequestsKey = 'dineos.staffAcknowledgedRequestAlerts'

function readBooleanPreference() {
  try { return localStorage.getItem(soundPreferenceKey) === 'true' } catch { return false }
}

function readAcknowledgedRequestIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(acknowledgedRequestsKey) ?? '[]')
    return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string').slice(-500) : [])
  } catch {
    return new Set()
  }
}

function saveAcknowledgedRequestIds(requestIds) {
  try { localStorage.setItem(acknowledgedRequestsKey, JSON.stringify([...requestIds].slice(-500))) } catch { /* Alert acknowledgement is optional UX state. */ }
}

function playAlertTone(context) {
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

function useStaffRequestAlerts(requests) {
  const [soundEnabled, setSoundEnabled] = useState(readBooleanPreference)
  const [newRequestIds, setNewRequestIds] = useState(new Set())
  const hasLoadedInitialSnapshotRef = useRef(false)
  const knownRequestIdsRef = useRef(new Set())
  const acknowledgedRequestIdsRef = useRef(null)
  const audioContextRef = useRef(null)
  const lastSoundAlertKeyRef = useRef('')

  const newRequests = useMemo(
    () => requests.filter((request) => newRequestIds.has(String(request.id ?? ''))),
    [newRequestIds, requests],
  )

  useEffect(() => {
    const requestIds = new Set(requests.map((request) => String(request.id ?? '')).filter(Boolean))
    if (!acknowledgedRequestIdsRef.current) acknowledgedRequestIdsRef.current = readAcknowledgedRequestIds()

    if (!hasLoadedInitialSnapshotRef.current) {
      knownRequestIdsRef.current = requestIds
      hasLoadedInitialSnapshotRef.current = true
    } else {
      const newIds = [...requestIds].filter((requestId) => !knownRequestIdsRef.current.has(requestId)
        && !acknowledgedRequestIdsRef.current.has(requestId))
      if (newIds.length > 0) {
        newIds.forEach((requestId) => acknowledgedRequestIdsRef.current.add(requestId))
        saveAcknowledgedRequestIds(acknowledgedRequestIdsRef.current)
        setNewRequestIds((currentIds) => new Set([...currentIds, ...newIds]))
      }
      knownRequestIdsRef.current = requestIds
    }

    setNewRequestIds((currentIds) => new Set([...currentIds].filter((requestId) => requestIds.has(requestId))))
  }, [requests])

  useEffect(() => () => {
    audioContextRef.current?.close?.().catch(() => {})
  }, [])

  useEffect(() => {
    const alertKey = newRequests.map((request) => request.id).sort().join(',')
    if (!soundEnabled || !alertKey || lastSoundAlertKeyRef.current === alertKey) return
    lastSoundAlertKeyRef.current = alertKey

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return
      const context = audioContextRef.current ?? new AudioContext()
      audioContextRef.current = context
      if (context.state === 'suspended') context.resume().then(() => playAlertTone(context)).catch(() => {})
      else playAlertTone(context)
    } catch { /* Sound is optional; the visible queue alert remains available. */ }
  }, [newRequests, soundEnabled])

  function toggleSound() {
    const nextEnabled = !soundEnabled
    setSoundEnabled(nextEnabled)
    if (nextEnabled) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext
        if (AudioContext) {
          const context = audioContextRef.current ?? new AudioContext()
          audioContextRef.current = context
          if (context.state === 'suspended') void context.resume().catch(() => {})
        }
      } catch { /* Sound is optional; the visible queue alert remains available. */ }
    }
    try { localStorage.setItem(soundPreferenceKey, String(nextEnabled)) } catch { /* Sound preference is optional UX state. */ }
  }

  return { newRequests, soundEnabled, toggleSound }
}

export default useStaffRequestAlerts
