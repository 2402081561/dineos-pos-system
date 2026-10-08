import { orderAmounts, resolveOptions, PosValidationError, roundMoney } from './posRules.js'
const money = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 && amount <= 999999.99 ? roundMoney(amount) : null
}

export class CounterOrderValidationError extends Error {
  constructor(message, status = 409) { super(message); this.status = status }
}

export function buildCounterOrder(cartItems, menuRows, rates = {}) {
  const byId = new Map(menuRows.map((item) => [item.id, item]))
  const items = cartItems.map((item) => {
    const current = byId.get(item.menuItemId)
    if (!current || current.isAvailable !== true || current.categoryEnabled !== true || !String(current.name ?? '').trim() || money(current.price) === null) {
      throw new CounterOrderValidationError('This item is no longer available. Refresh the menu and review the order.')
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50) {
      throw new CounterOrderValidationError('An item has an invalid quantity.', 400)
    }
    try {
      const options = resolveOptions(current.optionGroups ?? [], item.selections ?? [])
      return { ...item, ...options, id: current.id, name: current.name, unitPrice: roundMoney(money(current.price) + options.extraPrice) }
    } catch (error) {
      if (error instanceof PosValidationError) throw new CounterOrderValidationError(error.message, 400)
      throw error
    }
  })
  const subtotal = money(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0))
  if (subtotal === null) throw new CounterOrderValidationError('The order total exceeds the allowed amount.', 400)
  try { return { items, ...orderAmounts(subtotal, rates) } } catch (error) { throw new CounterOrderValidationError(error.message, 400) }
}
