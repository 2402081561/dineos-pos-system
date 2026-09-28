// Never fall back to the private, restaurant-wide order number.
export function customerOrderLabel(order) {
  const number = Number(order?.tableOrderNumber)
  return Number.isSafeInteger(number) && number > 0
    ? `Table order ${String(number).padStart(2, '0')}`
    : 'Order'
}
