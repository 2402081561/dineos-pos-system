import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { playKitchenAlert } from '../src/utils/kitchenAlert.js'

function fixture() {
  const oscillators = [], gains = []
  const context = {
    currentTime: 10, destination: {},
    createOscillator() {
      const node = { frequencies: [], stops: [], frequency: { setValueAtTime(value, time) { node.frequencies.push({ value, time }) } }, connect() {}, disconnect() { node.disconnected = true }, start(time) { node.startTime = time }, stop(time) { node.stops.push(time) } }
      oscillators.push(node); return node
    },
    createGain() {
      const node = { events: [], connect() {}, disconnect() { node.disconnected = true } }
      node.gain = Object.fromEntries(['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime'].map((method) => [method, (value, time) => node.events.push({ method, value, time })]))
      gains.push(node); return node
    },
  }
  return { context, oscillators, gains }
}
function envelopeAt(node, time) {
  let previous = { time: 0, value: 0 }
  for (const event of node.events) {
    if (time < event.time) {
      const fraction = (time - previous.time) / (event.time - previous.time)
      if (event.method === 'linearRampToValueAtTime') return previous.value + (event.value - previous.value) * fraction
      if (event.method === 'exponentialRampToValueAtTime') return previous.value * (event.value / previous.value) ** fraction
      return previous.value
    }
    previous = event
  }
  return previous.value
}

test('counter bell plays nine bright strikes with fixed pitches, not a siren sweep', () => {
  const audio = fixture(); playKitchenAlert(audio.context)
  assert.equal(audio.oscillators.length, 27)
  assert.equal(new Set(audio.oscillators.map((node) => node.startTime)).size, 9)
  assert.equal(audio.oscillators.filter((node) => node.type === 'triangle').length, 9)
  assert.ok(audio.oscillators.every((node) => node.frequencies.length === 1))
  assert.ok(Math.abs(Math.max(...audio.oscillators.map((node) => node.stops[0])) - 14.62) < 0.001)
  for (let time = 10; time < 15; time += 0.001) {
    const peakBound = audio.gains.reduce((total, node) => total + envelopeAt(node, time), 0)
    assert.ok(peakBound >= 0 && peakBound <= 1, 'Layered bells must retain headroom')
  }
})

test('muting stops all scheduled strikes once; completed nodes disconnect', () => {
  const audio = fixture(), sound = playKitchenAlert(audio.context)
  sound.stop(); sound.stop()
  assert.ok(audio.oscillators.every((node) => node.stops.length === 2))
  audio.oscillators.forEach((node) => node.onended())
  assert.ok(audio.oscillators.every((node) => node.disconnected))
  assert.ok(audio.gains.every((node) => node.disconnected))
})

// Exercise the actual dashboard playback callback without a browser or orders.
const source = await readFile(new URL('../src/pages/kitchen/Dashboard.jsx', import.meta.url), 'utf8')
const callbackSource = source.slice(source.indexOf('const playAlert = useCallback('), source.indexOf('  useEffect(() => {\n    const alertKey'))
function dashboardFixture({ enabled = true, mounted = true, state = 'running' } = {}) {
  let starts = 0, stops = 0, error = ''
  let resume
  const context = { state, resume: () => new Promise((resolve) => { resume = resolve }) }
  const generation = { current: 0 }
  const play = runInNewContext(callbackSource + '; playAlert', {
    useCallback: (callback) => callback,
    window: { AudioContext: function () { return context } },
    audioContextRef: { current: null }, playbackGenerationRef: generation,
    isMountedRef: { current: mounted }, soundEnabledRef: { current: enabled },
    alertSoundRef: { current: { stop() { stops++ } } },
    playKitchenAlert: () => { starts++; return { stop() { stops++ } } },
    setSoundError: (value) => { error = value },
  })
  return { play, generation, resolveResume: () => resume(), get starts() { return starts }, get stops() { return stops }, get error() { return error } }
}
test('automatic alerts respect mute/unmount; explicit preview works while muted', async () => {
  for (const options of [{ enabled: false }, { mounted: false }]) {
    const audio = dashboardFixture(options); await audio.play(); assert.equal(audio.starts, 0)
  }
  const preview = dashboardFixture({ enabled: false }); await preview.play(true)
  assert.equal(preview.starts, 1); assert.equal(preview.stops, 1)
})
test('pending browser audio unlock cannot play after a newer cancellation', async () => {
  const audio = dashboardFixture({ state: 'suspended' })
  const pending = audio.play()
  ++audio.generation.current
  audio.resolveResume(); await pending
  assert.equal(audio.starts, 0)
})
