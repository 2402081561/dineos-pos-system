import { validateOrderType } from '../../server/src/orderType.js'

export function cartLineId(menuItemId, notes, selections, orderType = 'dine_in') {
  return JSON.stringify([menuItemId, notes, selections, validateOrderType(orderType)])
}

// Move a quantity, never copy or discard it. Prices/options/notes stay intact.
export function moveCartQuantity(items, sourceId, quantity, orderType) {
  validateOrderType(orderType)
  const source = items.find((item) => item.cartItemId === sourceId)
  if (!source || !Number.isInteger(quantity) || quantity < 1 || quantity > source.quantity) return { items, error: 'Invalid quantity.' }
  if ((source.orderType ?? 'dine_in') === orderType) return { items, error: '' }
  const targetId = cartLineId(source.menuItemId, source.specialInstructions ?? '', source.selections ?? [], orderType)
  const target = items.find((item) => item.cartItemId === targetId)
  if ((target?.quantity ?? 0) + quantity > 50) return { items, error: 'Each item line can contain at most 50 items.' }
  const next = items.flatMap((item) => {
    if (item.cartItemId === sourceId) {
      if (target) return item.quantity === quantity ? [] : [{ ...item, quantity: item.quantity - quantity }]
      // Keep the existing row mounted and in place when changing the whole line.
      const changed = { ...source, cartItemId: targetId, orderType, quantity }
      if (item.quantity === quantity) return [{ ...changed, cartRowId: source.cartRowId ?? source.cartItemId }]
      // A separate portion belongs beside its source, not at the end of the cart.
      return [{ ...item, quantity: item.quantity - quantity }, { ...changed, cartRowId: crypto.randomUUID() }]
    }
    return item.cartItemId === targetId ? [{ ...item, quantity: item.quantity + quantity }] : [item]
  })
  if (next.length > 30) return { items, error: 'Your cart can contain at most 30 item lines.' }
  return { items: next, error: '' }
}
