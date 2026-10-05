export const FLOOR_COLUMNS = 8
export const FLOOR_MAX_ROWS = 50

export class FloorLayoutConflictError extends Error {}
export class FloorLayoutValidationError extends Error {}

export function validateFloorLayoutUpdate(input, currentTables) {
  const positions = input?.positions
  if (!Array.isArray(positions) || positions.length !== currentTables.length) {
    throw new FloorLayoutConflictError('The table list changed. Reload the floor plan and try again.')
  }

  const currentById = new Map(currentTables.map((table) => [table.id, table]))
  const seenIds = new Set()
  const seenCells = new Set()
  const normalized = []
  for (const position of positions) {
    if (!position || typeof position.tableId !== 'string' || !currentById.has(position.tableId) || seenIds.has(position.tableId)) {
      throw new FloorLayoutValidationError('The floor plan contains a missing or duplicate table.')
    }
    if (!Number.isInteger(position.x) || position.x < 0 || position.x >= FLOOR_COLUMNS || !Number.isInteger(position.y) || position.y < 0 || position.y >= FLOOR_MAX_ROWS) {
      throw new FloorLayoutValidationError('Every table must be placed on the floor grid.')
    }
    const current = currentById.get(position.tableId)
    // Older clients can still save coordinates without erasing an existing area.
    const zone = position.zone === undefined ? current.floorZone ?? 'Main hall' : position.zone
    if (typeof zone !== 'string' || !zone.trim() || zone.trim().length > 40 || /\p{Cc}/u.test(zone)) {
      throw new FloorLayoutValidationError('Area names must contain 1–40 characters without line breaks.')
    }
    const cell = JSON.stringify([zone.trim(), position.x, position.y])
    if (seenCells.has(cell)) throw new FloorLayoutValidationError('Two tables cannot occupy the same floor position in one area.')
    if (position.expectedX !== current.floorX || position.expectedY !== current.floorY || (position.zone !== undefined && position.expectedZone !== (current.floorZone ?? 'Main hall'))) {
      throw new FloorLayoutConflictError('The floor plan was changed by someone else. Reload it before saving.')
    }
    seenIds.add(position.tableId)
    seenCells.add(cell)
    normalized.push({ tableId: position.tableId, x: position.x, y: position.y, zone: zone.trim() })
  }
  return normalized
}
