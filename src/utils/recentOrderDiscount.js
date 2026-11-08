import { recentOrderPayment } from './cashierRecentOrder'
import { calculateTableDiscount } from '../services/orderService'
import { paymentPlan } from '../../server/src/paymentSelection'

// A draft only: the existing payment confirmation commits the discount.
export function recentOrderDiscountPreview(order, floor, discount) {
  const payment = recentOrderPayment(order, floor)
  if (!payment) throw new Error('The bill has changed. Review it and confirm payment again.')
  const selections = payment.orders.flatMap((entry) => entry.items.map((item) => ({ itemId: item.id, quantity: Number(item.quantity) - Number(item.paidQuantity ?? 0) }))).filter((item) => item.quantity > 0)
  const original = paymentPlan(payment.orders, selections)
  const preview = calculateTableDiscount(original.subtotal, discount)
  return { payment, preview, original, discounted: paymentPlan(payment.orders, selections, preview.amount) }
}
