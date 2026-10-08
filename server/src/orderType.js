import { PosValidationError } from './posRules.js'

// Omitted by older clients: preserve their original dine-in behaviour.
export function validateOrderType(value = 'dine_in') {
  if (value !== 'dine_in' && value !== 'take_away') throw new PosValidationError('Choose Dine in or Take away.', 400)
  return value
}

export function orderTypeLabel(value) {
  if (value === 'mixed') return 'Dine in / Take away'
  return value === 'take_away' ? 'Take away' : 'Dine in'
}

export function resolveItemOrderTypes(items, legacyType) {
  const fallback = validateOrderType(legacyType)
  return items.map((item) => ({ ...item, orderType: validateOrderType(item.orderType === undefined ? fallback : item.orderType) }))
}

export function summarizeOrderType(items, fallback = 'dine_in') {
  if (!items.length) return fallback
  const types = new Set(items.map((item) => validateOrderType(item.orderType)))
  return types.size > 1 ? 'mixed' : [...types][0]
}

export function receiptOrderTypeLabel(orders = []) {
  const types = new Set(orders.flatMap((order) => order.items?.length
    ? order.items.map((item) => orderTypeLabel(item.orderType ?? order.orderType))
    : [orderTypeLabel(order.orderType)]))
  return types.size > 1 ? 'Dine in / Take away' : [...types][0] ?? 'Dine in'
}
