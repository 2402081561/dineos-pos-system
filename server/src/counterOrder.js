const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100
const money = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 && amount <= 999999.99 ? roundMoney(amount) : null
}

export class CounterOrderValidationError extends Error {
  constructor(message, status = 409) { super(message); this.status = status }
}

export function buildCounterOrder(cartItems, menuRows) {
  const byId = new Map(menuRows.map((item) => [item.id, item]))
  const items = cartItems.map((item) => {
    const current = byId.get(item.menuItemId)
    if (!current || current.isAvailable !== true || current.categoryEnabled !== true || !String(current.name ?? '').trim() || money(current.price) === null) {
      throw new CounterOrderValidationError('This item is no longer available. Refresh the menu and review the order.')
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50) {
      throw new CounterOrderValidationError('An item has an invalid quantity.', 400)
    }
    return { ...item, id: current.id, name: current.name, unitPrice: money(current.price) }
  })
  const subtotal = money(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0))
  const serviceCharge = subtotal === null ? null : money(roundMoney(subtotal * 0.1))
  const sst = subtotal === null ? null : money(roundMoney(subtotal * 0.06))
  const grandTotal = subtotal === null ? null : money(roundMoney(subtotal + serviceCharge + sst))
  if (grandTotal === null) throw new CounterOrderValidationError('The order total exceeds the allowed amount.', 400)
  return { items, subtotal, serviceCharge, sst, grandTotal }
}
