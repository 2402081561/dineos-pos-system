// Bright counter-bell strikes, not a doorbell melody or a sweeping siren.
// Three short bursts are easier to identify over background kitchen noise.
export function playKitchenAlert(context) {
  const offsets = [0, 0.28, 0.56, 1.65, 1.93, 2.21, 3.3, 3.58, 3.86]
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
      envelope.gain.linearRampToValueAtTime(0.9 * voice.weight, strike + 0.004)
      envelope.gain.setValueAtTime(0.9 * voice.weight, strike + 0.07)
      envelope.gain.exponentialRampToValueAtTime(0.0001 * voice.weight, strike + 0.65)
      envelope.gain.linearRampToValueAtTime(0, strike + 0.75)
      oscillator.connect(envelope)
      envelope.connect(context.destination)
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
      oscillator.start(strike)
      oscillator.stop(strike + 0.75)
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
