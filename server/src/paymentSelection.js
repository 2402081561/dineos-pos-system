import { allocateBill, orderAmounts, PosValidationError, roundMoney } from './posRules.js'
import { summarizeOrderType } from './orderType.js'

// Shared preview rules. API loads prices and remaining quantities under locks.
export function selectPaymentOrders(orders, selections) {
  if (!Array.isArray(selections) || !selections.length || selections.length > 500) throw new PosValidationError('Select at least one unpaid item.')
  const seen = new Set()
  for (const selection of selections) {
    if (seen.has(selection?.itemId) || !Number.isInteger(selection?.quantity) || selection.quantity < 1) throw new PosValidationError('Select valid, unique item quantities.')
    seen.add(selection.itemId)
  }
  const selected = orders.map((order) => {
    const items = order.items.flatMap((item) => {
      const selection = selections.find((entry) => entry.itemId === item.id)
      if (!selection) return []
      seen.delete(item.id)
      if (selection.quantity > Number(item.quantity) - Number(item.paidQuantity ?? 0)) throw new PosValidationError('Some selected items have already been paid. Refresh the bill.', 409)
      return [{ ...item, quantity: selection.quantity }]
    })
    return { ...order, orderType: summarizeOrderType(items), items, subtotal: roundMoney(items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)) }
  }).filter((order) => order.items.length)
  if (seen.size || !selected.length) throw new PosValidationError('The selected items do not belong to this bill.', 409)
  return selected
}

export function paymentPlan(orders, selections, discount = 0) {
  const bill = allocateBill(selectPaymentOrders(orders, selections), discount)
  return { ...bill, finalOrders: bill.finalOrders.map((paid) => {
    const original = orders.find((order) => order.id === paid.id)
    const remainingItems = original.items.map((item) => ({ ...item, quantity: Number(item.quantity) - Number(item.paidQuantity ?? 0) - (paid.items.find((entry) => entry.id === item.id)?.quantity ?? 0) }))
    const remaining = orderAmounts(roundMoney(remainingItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)), original)
    return { ...paid, remaining, fullyPaid: remainingItems.every((item) => item.quantity === 0) }
  }) }
}
