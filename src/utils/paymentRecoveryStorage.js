const prefix = 'dineos-pending-payment-v1:'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function paymentRequestBody(value) {
  return Object.fromEntries(['orderIds', 'paymentMethod', 'discount', 'cashReceived', 'expectedAmount', 'selections', 'versions', 'requestId'].filter((key) => value[key] !== undefined).map((key) => [key, value[key]]))
}
export function validPendingPayment(value, actorId) {
  const p = value?.body
  return value?.actorId === actorId && typeof value.tableNumber === 'string' && value.tableNumber.length <= 100 &&
    p && uuid.test(p.requestId) && Array.isArray(p.orderIds) && p.orderIds.length > 0 && p.orderIds.length <= 50 && p.orderIds.every((id) => uuid.test(id)) &&
    typeof p.paymentMethod === 'string' && p.paymentMethod.length < 50 && Number.isFinite(p.expectedAmount) && p.expectedAmount >= 0 &&
    Array.isArray(p.selections) && p.selections.length <= 1500 && p.selections.every((s) => uuid.test(s.itemId) && Number.isInteger(s.quantity) && s.quantity > 0) &&
    p.versions && typeof p.versions === 'object' && p.orderIds.every((id) => Number.isInteger(p.versions[id])) &&
    p.discount && ['percentage', 'fixed'].includes(p.discount.type) && Number.isFinite(Number(p.discount.value)) &&
    (p.paymentMethod !== 'Cash' || Number.isFinite(p.cashReceived))
}
export function createPaymentRecoveryStorage(getStorage = () => window.sessionStorage) {
  const memory = new Map()
  return {
    read(actorId) {
      if (!actorId) return null
      const key = prefix + encodeURIComponent(actorId)
      let raw = memory.get(key)
      try { raw = getStorage().getItem(key); if (raw === null) memory.delete(key) } catch { /* same-tab fallback */ }
      if (!raw) return null
      try { const value = JSON.parse(raw); return validPendingPayment(value, actorId) ? value : { actorId, damaged: true } }
      catch { return { actorId, damaged: true } }
    },
    save(value) {
      if (!validPendingPayment(value, value.actorId)) throw new Error('Invalid payment request.')
      const key = prefix + encodeURIComponent(value.actorId), raw = JSON.stringify(value)
      // Do not send a payment unless its recovery key is durable first.
      getStorage().setItem(key, raw)
      memory.set(key, raw)
    },
    clear(actorId) {
      const key = prefix + encodeURIComponent(actorId)
      getStorage().removeItem(key)
      memory.delete(key)
    },
  }
}
export const paymentRecoveryStorage = createPaymentRecoveryStorage()
