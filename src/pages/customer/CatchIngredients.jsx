import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import useShopSettings from '../../hooks/useShopSettings'
import useLatestOrder from '../../hooks/useLatestOrder'

const bestKey = 'dineos.catchIngredients.best'
const ingredients = ['🥕', '🍅', '🥬', '🍄', '🌽', '🥦', '🫑', '🍗', '🥩', '🦐', '🍖']
const clampPan = (x) => Math.max(12, Math.min(88, x))

function playBurntSizzle(context) {
  const duration = 0.36
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
  const samples = buffer.getChannelData(0)
  let bubble = 0
  for (let i = 0; i < samples.length; i++) {
    const time = i / context.sampleRate
    if (Math.random() < 110 / context.sampleRate) bubble = 0.45 + Math.random() * 0.3
    bubble *= Math.exp(-380 / context.sampleRate)
    samples[i] = (Math.random() * 2 - 1) * (0.42 + 0.07 * Math.sin(time * 110) + bubble)
  }
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()
  const at = context.currentTime
  source.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(3600, at)
  filter.frequency.exponentialRampToValueAtTime(2600, at + duration)
  gain.gain.setValueAtTime(0.001, at)
  gain.gain.linearRampToValueAtTime(0.48, at + 0.014)
  gain.gain.setValueAtTime(0.42, at + 0.19)
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration)
  source.connect(filter).connect(gain).connect(context.destination)
  source.start(at)
}

function CatchRound({ t }) {
  const pan = useRef(50)
  const board = useRef(null)
  const audio = useRef(null)
  const [position, setPosition] = useState(50)
  const [phase, setPhase] = useState('idle')
  const [frame, setFrame] = useState({ time: 30, score: 0, items: [] })
  const [best, setBest] = useState(() => {
    try { return Math.max(0, Number(localStorage.getItem(bestKey)) || 0) } catch { return 0 }
  })
  useEffect(() => () => { void audio.current?.close().catch(() => {}) }, [])

  function prepareSound() {
    const Audio = window.AudioContext || window.webkitAudioContext
    if (!Audio) return
    try {
      const context = audio.current ??= new Audio()
      void context.resume().catch(() => {})
    } catch { /* The game remains playable without sound. */ }
  }
  function move(x) {
    pan.current = clampPan(x)
    setPosition(pan.current)
  }
  function start() {
    prepareSound()
    move(50)
    setFrame({ time: 30, score: 0, items: [] })
    setPhase('playing')
    board.current?.focus()
  }
  useEffect(() => {
    if (phase !== 'playing') return
    let lastTime = performance.now(), elapsed = 0, feedback
    let request, items = [], nextSpawn = 420, id = 0, score = 0
    let caught = 0, burntCaught = 0
    function resetClock() { lastTime = performance.now() }
    document.addEventListener('visibilitychange', resetClock)
    function tick(now) {
      if (!document.hidden) elapsed += Math.max(0, Math.min(50, now - lastTime))
      lastTime = now
      if (elapsed >= 30000) {
        const record = Math.max(best, score)
        try { localStorage.setItem(bestKey, String(record)) } catch { /* Optional local score. */ }
        setBest(record)
        setFrame({ time: 0, score, items: [], caught, burntCaught, newRecord: score > best })
        setPhase('finished')
        return
      }
      if (elapsed >= nextSpawn) {
        const burnt = id > 1 && Math.random() < 0.36
        items.push({ id: id++, born: elapsed, x: 12 + Math.random() * 76, burnt, icon: burnt ? '🥩' : ingredients[Math.floor(Math.random() * ingredients.length)] })
        nextSpawn = elapsed + Math.max(430, 850 - elapsed / 75)
      }
      items = items.flatMap((item) => {
        const y = (elapsed - item.born) / 23
        if (y < 86) return [{ ...item, y }]
        if (Math.abs(item.x - pan.current) <= 12) {
          const next = Math.max(0, score + (item.burnt ? -2 : 1))
          feedback = { amount: next - score, burnt: item.burnt, until: elapsed + 600 }
          score = next
          if (item.burnt) burntCaught++
          else caught++
          if (!document.hidden) navigator.vibrate?.(item.burnt ? [35, 30, 35] : 16)
          const context = audio.current
          if (context?.state === 'running' && !document.hidden && item.burnt) {
            playBurntSizzle(context)
          } else if (context?.state === 'running' && !document.hidden) {
            const oscillator = context.createOscillator(), gain = context.createGain()
            const at = context.currentTime
            oscillator.frequency.setValueAtTime(660, at)
            oscillator.frequency.exponentialRampToValueAtTime(880, at + 0.11)
            gain.gain.setValueAtTime(0.065, at)
            gain.gain.exponentialRampToValueAtTime(0.001, at + 0.13)
            oscillator.connect(gain).connect(context.destination)
            oscillator.start(at)
            oscillator.stop(at + 0.14)
          }
        }
        return []
      })
      setFrame({ time: Math.ceil((30000 - elapsed) / 1000), score, items, feedback: feedback?.until > elapsed ? feedback : null })
      request = requestAnimationFrame(tick)
    }
    request = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(request)
      document.removeEventListener('visibilitychange', resetClock)
      navigator.vibrate?.(0)
    }
  }, [phase, best])

  function drag(event) {
    if (phase !== 'playing' || !event.isPrimary) return
    const bounds = event.currentTarget.getBoundingClientRect()
    move((event.clientX - bounds.left) / bounds.width * 100)
  }

  return <>
    <p className="text-sm text-slate-600">{t('Drag the pan or use the left and right arrow keys. Catch ingredients (+1) and avoid burnt food (−2).')}</p>
    <div className="grid grid-cols-3 gap-2 text-center text-sm font-bold">
      <div>{t('Time left')}<div className="text-xl tabular-nums">{frame.time}s</div></div>
      <div>{t('Score')}<div className="text-xl tabular-nums">{frame.score}</div></div>
      <div>{t('Best score')}<div className="text-xl tabular-nums">{best}</div></div>
    </div>
    <div ref={board} role="region" aria-label={t('Game board')} tabIndex={0}
      className="relative h-[min(52dvh,26rem)] min-h-52 select-none overflow-hidden rounded-2xl border border-orange-200 bg-orange-50 focus-visible:ring-2 focus-visible:ring-orange-600"
      style={{ touchAction: phase === 'playing' ? 'none' : 'auto' }}
      onPointerDown={(event) => {
        if (phase !== 'playing' || !event.isPrimary) return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag(event)
      }}
      onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) drag(event) }}
      onKeyDown={(event) => {
        if (phase !== 'playing' || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
        event.preventDefault()
        move(pan.current + (event.key === 'ArrowLeft' ? -6 : 6))
      }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{
        backgroundImage: 'linear-gradient(to bottom, transparent, #f3d9b85e), linear-gradient(#dec4ac55 1px, transparent 1px), linear-gradient(90deg, #dec4ac55 1px, transparent 1px)',
        backgroundSize: '100% 100%, 42px 42px, 42px 42px',
      }} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[14%] border-t-4 border-amber-700/25 bg-[#d49b67]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, #8d542718 0 1px, transparent 1px 7px), linear-gradient(#f0bc86, #c88b57)',
      }} />
      {frame.items.map((item) => <span aria-hidden="true" key={item.id} className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-3xl ${item.burnt ? 'rounded-full bg-slate-900 p-1' : ''}`} style={{ left: item.x + '%', top: item.y + '%' }}><span className={item.burnt ? "inline-block grayscale brightness-50" : undefined}>{item.icon}</span>{item.burnt && <small className="absolute -right-2 -top-2 rounded-full bg-white px-1 text-sm font-black text-slate-900">!</small>}</span>)}
      {frame.feedback && <span aria-hidden="true" className={`pointer-events-none absolute right-3 top-3 rounded-lg bg-white px-3 py-1 text-lg font-black ${frame.feedback.burnt ? 'text-red-800' : 'text-green-800'}`}>{frame.feedback.burnt ? '' : '+'}{frame.feedback.amount}</span>}
      <span aria-hidden="true" className="pointer-events-none absolute top-[86%] -translate-x-1/2 -translate-y-1/2 text-5xl" style={{ left: position + '%' }}>🍳</span>
      {phase !== 'playing' && <div className="absolute inset-0 grid place-content-center gap-3 bg-white/70 text-center">
        {phase === 'finished' && <div role="status" className="mx-3 rounded-xl bg-white px-4 py-2 text-sm text-slate-800">
          <p className="font-bold">{t('Round over')} · {t('Score')}: {frame.score}</p>
          {frame.newRecord && <p className="font-extrabold text-orange-800">🏆 {t('New record!')}</p>}
          <p>{t('Ingredients caught')}: {frame.caught}</p>
          <p>{t('Burnt steaks caught')}: {frame.burntCaught}</p>
        </div>}
        <button type="button" onClick={start} className="min-h-11 rounded-xl bg-orange-700 px-5 font-bold text-white">{t(phase === 'idle' ? 'Start game' : 'Play again')}</button>
      </div>}
    </div>
  </>
}

function OrderReadyNotice({ t }) {
  const { state } = useLocation()
  const { order, orders, error, isLoading } = useLatestOrder()
  const watched = state?.waitingOrderId ? orders.find(({ id }) => id === state.waitingOrderId) : order
  const ready = !error && !isLoading && watched?.status === 'ready'
  return <div role="status" aria-live="polite" className="min-h-11">
    {ready && <div className="flex flex-wrap items-center justify-between gap-x-3 rounded-xl bg-emerald-50 px-3 text-sm font-bold text-emerald-900">
      <span>{t('Your order is ready')}</span>
      <Link className="inline-flex min-h-11 items-center underline" to="/orders">{t('View order')}</Link>
    </div>}
  </div>
}

export default function CatchIngredients() {
  const { t } = useCustomerLanguage()
  const { config, isLoading, error } = useShopSettings()
  return <div className="mx-auto max-w-lg space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-x-4">
      <Link className="inline-flex min-h-11 items-center font-semibold text-orange-800 underline" to="/more">{t('Back to More')}</Link>
      <Link className="inline-flex min-h-11 items-center font-semibold text-orange-800 underline" to="/orders">{t('My Orders')}</Link>
    </div>
    <h1 className="text-2xl font-extrabold">{t('Catch the ingredients')}</h1>
    {!isLoading && !error && config?.miniGameEnabled === true ? <><OrderReadyNotice t={t} /><CatchRound t={t} /></> : <p role="status">{t(isLoading ? 'Loading page…' : 'Mini-game unavailable')}</p>}
  </div>
}
