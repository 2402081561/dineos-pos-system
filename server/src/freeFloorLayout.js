export const PLAN_WIDTH = 1200
export const PLAN_MAX_HEIGHT = 8600
export const TABLE_WIDTH = 140
export const TABLE_HEIGHT = 156
export const MARKER_HEIGHT = 72
export const MARKER_LABELS = { cashier: 'Cashier counter', kitchen: 'Kitchen', entrance: 'Entrance' }

export function validPoint(point, height = TABLE_HEIGHT) {
  return point && typeof point === 'object' && !Array.isArray(point)
    && Object.keys(point).every((key) => ['x', 'y'].includes(key))
    && Number.isInteger(point.x) && Number.isInteger(point.y)
    && point.x >= 0 && point.x <= PLAN_WIDTH - TABLE_WIDTH
    && point.y >= 0 && point.y <= PLAN_MAX_HEIGHT - height
}

export function samePoint(a, b) {
  return a == null && b == null || a != null && b != null && a.x === b.x && a.y === b.y
}

export function tablePoint(table) {
  return validPoint(table.floorPoint) ? { ...table.floorPoint } : { x: (table.x ?? 0) * 148, y: (table.y ?? 0) * 170 }
}

export function overlaps(a, b) {
  return a.zone === b.zone && a.x < b.x + TABLE_WIDTH && a.x + TABLE_WIDTH > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y
}

export function layoutObjects(tables, markers = []) {
  return [
    ...tables.map((table) => ({ id: table.id, zone: table.floorZone ?? 'Main hall', ...tablePoint(table), height: TABLE_HEIGHT })),
    ...markers.map((marker) => ({ ...marker, height: MARKER_HEIGHT })),
  ]
}

export function layoutHasOverlap(objects) {
  return objects.some((object, index) => objects.slice(index + 1).some((other) => overlaps(object, other)))
}

export function validateFreePlan(input, positions, settings) {
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== settings.revision) throw new Error('CONFLICT')
  if (!Array.isArray(input.markers) || input.markers.length > 60) throw new Error('Use no more than 60 floor markers.')
  const seen = new Set(positions.map((position) => position.tableId))
  const markers = input.markers.map((marker) => {
    if (!marker || typeof marker.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(marker.id) || seen.has(marker.id)
      || !Object.hasOwn(MARKER_LABELS, marker.type) || !validPoint({ x: marker.x, y: marker.y }, MARKER_HEIGHT)
      || typeof marker.zone !== 'string' || !marker.zone.trim() || marker.zone.trim().length > 40 || /\p{Cc}/u.test(marker.zone)) {
      throw new Error('Invalid floor marker. Reload the layout and try again.')
    }
    seen.add(marker.id)
    return { id: marker.id, type: marker.type, zone: marker.zone.trim(), x: marker.x, y: marker.y }
  })
  if (positions.some((position) => !validPoint(position.point))) throw new Error('Every table needs a valid floor position.')
  const objects = [
    ...positions.map((position) => ({ ...position.point, zone: position.zone, height: TABLE_HEIGHT })),
    ...markers.map((marker) => ({ ...marker, height: MARKER_HEIGHT })),
  ]
  if (layoutHasOverlap(objects)) throw new Error('Tables and markers cannot overlap. Move them apart before saving.')
  return markers
}
