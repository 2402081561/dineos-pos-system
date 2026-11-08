const prefix = 'dineos-walk-in-assignment-v1:'
export const assignmentKey = (actor) => prefix + encodeURIComponent(actor)
export function readWalkInAssignment(actor) {
  if (!actor) return null
  try {
    const raw = sessionStorage.getItem(assignmentKey(actor))
    if (!raw) return null
    const value = JSON.parse(raw)
    if (value.actorId !== actor || !value.orderId || !value.body?.requestId || !value.body.sourceSessionId || !value.body.targetTableId || !Array.isArray(value.body.sourceOrders) || !value.body.sourceOrders.some((row) => row.id === value.orderId)) return { damaged: true }
    return value
  } catch { return { damaged: true } }
}
