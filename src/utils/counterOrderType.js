import { cartLineId } from './cartOrderType.js'

export function counterDefaultOrderType(draft) {
  if (['dine_in', 'take_away'].includes(draft.defaultOrderType)) return draft.defaultOrderType
  const lines = Object.values(draft.cart ?? {})
  return lines.length && lines.every((line) => line.orderType === 'take_away') ? 'take_away' : 'dine_in'
}

// Explicit bulk action only. Build the result first so overflow never leaves a
// half-converted order, and keep different options/notes on separate lines.
export function changeCounterCartType(cart, orderType) {
  if (!['dine_in', 'take_away'].includes(orderType)) return { cart, error: 'Invalid order type.' }
  const next = {}
  for (const [oldId, line] of Object.entries(cart)) {
    const id = cartLineId(line.menuItemId ?? oldId, line.notes ?? '', line.selections ?? [], orderType)
    const quantity = (next[id]?.quantity ?? 0) + line.quantity
    if (quantity > 50) return { cart, error: 'Each item line can contain at most 50 items.' }
    next[id] = { ...line, orderType, quantity }
  }
  return { cart: next, error: '' }
}
