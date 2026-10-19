// Bright counter-bell strikes, not a doorbell melody or a sweeping siren.
// Four full-volume bursts with longer attacks stand out over kitchen noise.
// Keep strikes separate and below digital full scale to avoid clipping.
export function playKitchenAlert(context) {
  const offsets = [0, 0.4, 0.8, 2, 2.4, 2.8, 4, 4.4, 4.8, 6, 6.4, 6.8]
  const voices = [
    { frequency: 1174.66, type: 'triangle', weight: 0.6 },
    { frequency: 1760, type: 'sine', weight: 0.28 },
    { frequency: 3520, type: 'sine', weight: 0.12 },
  ]
  const start = context.currentTime + 0.01
  const nodes = []
  let stopped = false
  for (const offset of offsets) {
    const strike = start + offset
    for (const voice of voices) {
      const oscillator = context.createOscillator()
      const envelope = context.createGain()
      oscillator.type = voice.type
      oscillator.frequency.setValueAtTime(voice.frequency, strike)
      envelope.gain.setValueAtTime(0, strike)
      envelope.gain.linearRampToValueAtTime(0.98 * voice.weight, strike + 0.004)
      envelope.gain.setValueAtTime(0.98 * voice.weight, strike + 0.18)
      envelope.gain.exponentialRampToValueAtTime(0.0001 * voice.weight, strike + 0.38)
      envelope.gain.linearRampToValueAtTime(0, strike + 0.4)
      oscillator.connect(envelope)
      envelope.connect(context.destination)
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
      oscillator.start(strike)
      oscillator.stop(strike + 0.4)
      nodes.push(oscillator)
    }
  }
  return {
    stop() {
      if (stopped) return
      stopped = true
      for (const oscillator of nodes) {
        try { oscillator.stop() } catch { /* Already ended. */ }
      }
    },
  }
}
