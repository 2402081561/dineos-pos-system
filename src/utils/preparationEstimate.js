function safeQuantity(value) {
  const quantity = Number(value)
  return Number.isInteger(quantity) && quantity > 0 ? quantity : 1
}

export function estimatePreparationTime(quantity, status = 'received') {
  const itemQuantity = safeQuantity(quantity)
  const fullPreparationMinutes = 3 + Math.ceil(Math.max(0, itemQuantity - 1) * 0.75)
  const minimum = status === 'preparing'
    ? Math.max(1, Math.ceil(fullPreparationMinutes * 0.6))
    : fullPreparationMinutes

  return {
    minimum,
    maximum: minimum + 2,
    label: `${minimum}–${minimum + 2} mins`,
  }
}
