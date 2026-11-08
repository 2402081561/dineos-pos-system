// Whole-table payment follows the latest bill. Split payment is explicit:
// newly arriving dishes must never silently become part of a diner's selection.
export function billSelections(orders, quantities, split) {
  return orders.flatMap((order) => order.items.map((item) => ({
    itemId: item.id,
    quantity: split ? quantities[item.id] ?? 0 : Number(item.quantity) - Number(item.paidQuantity ?? 0),
  }))).filter((item) => item.quantity !== 0)
}

export function allUnpaidQuantities(orders) {
  return Object.fromEntries(orders.flatMap((order) => order.items.map((item) => [item.id, Math.max(0, Number(item.quantity) - Number(item.paidQuantity ?? 0))])))
}

export function tableForPayment(tables, payment) {
  // A physical table may already have a new visit; never use its bill as the
  // remainder of an older receipt. Walk-ins also have their own visit IDs.
  return payment?.tableSessionId ? tables.find((table) => table.tableSessionId === payment.tableSessionId) : null
}
