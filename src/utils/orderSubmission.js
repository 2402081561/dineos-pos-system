// These responses explicitly reject the write. A timeout, lost response or 5xx
// cannot prove that the transaction did not commit: keep its ID and frozen cart.
export function isDefinitiveOrderRejection(error) {
  return [400, 401, 403, 404, 409, 413, 422].includes(error?.status)
}
