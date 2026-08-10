export function formatCurrency(value) {
  const amount = Number(value)
  return `RM ${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`
}
