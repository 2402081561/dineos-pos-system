import { useEffect, useState } from 'react'
import { getPreparationEstimate } from '../services/customerApi'

export default function usePreparationEstimate(quantity) {
  const [result, setResult] = useState(null)
  useEffect(() => {
    let active = true, timer, controller
    async function load() {
      controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 10000)
      try {
        const estimate = await getPreparationEstimate(quantity, controller.signal)
        if (active) setResult({ quantity, estimate })
      } catch {
        // Never leave a stale low estimate displayed when the queue is unavailable.
        if (active) setResult({ quantity, estimate: null })
      } finally {
        window.clearTimeout(timeout)
        if (active) timer = window.setTimeout(load, 15000)
      }
    }
    void load()
    return () => { active = false; window.clearTimeout(timer); controller?.abort() }
  }, [quantity])
  return result?.quantity === quantity ? result.estimate : null
}
