export function moneyToCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents <= 999999999999 ? cents : null
}

export function getCashPayment(total, received) {
  const totalCents = moneyToCents(total)
  const receivedCents = moneyToCents(received)
  if (totalCents === null) return { error: 'The bill total is invalid.', change: null }
  if (receivedCents === null) return { error: 'Enter a valid cash amount with up to 2 decimal places.', change: null }
  if (receivedCents < totalCents) return { error: `Cash is short by RM ${((totalCents - receivedCents) / 100).toFixed(2)}.`, change: null }
  return { error: '', cashReceived: receivedCents / 100, change: (receivedCents - totalCents) / 100 }
}

// Match the existing backend: round discounted subtotal and each charge separately.
export function cashierBillTotal(subtotal, discountAmount) {
  const discountedCents = Math.round((Number(subtotal) - Number(discountAmount) + Number.EPSILON) * 100)
  if (!Number.isSafeInteger(discountedCents) || discountedCents < 0) return null
  return (discountedCents + Math.round(discountedCents * 10 / 100) + Math.round(discountedCents * 6 / 100)) / 100
}
