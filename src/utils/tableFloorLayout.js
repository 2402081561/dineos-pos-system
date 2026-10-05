export const FLOOR_COLUMNS = 8
export const FLOOR_MAX_ROWS = 50
export const DEFAULT_FLOOR_ZONE = 'Main hall'

export function floorZone(table) {
  return typeof table?.floorZone === 'string' && table.floorZone.trim() ? table.floorZone.trim() : DEFAULT_FLOOR_ZONE
}

function cellKey(zone, x, y) { return JSON.stringify([zone, x, y]) }

function validPosition(table) {
  return Number.isInteger(table.floorX) && table.floorX >= 0 && table.floorX < FLOOR_COLUMNS
    && Number.isInteger(table.floorY) && table.floorY >= 0 && table.floorY < FLOOR_MAX_ROWS
}

export function placeTablesOnFloor(tables) {
  const used = new Set()
  const placed = [...tables].sort((first, second) => Number(first.tableNumber) - Number(second.tableNumber)).map((table) => {
    const zone = floorZone(table)
    const key = cellKey(zone, table.floorX, table.floorY)
    if (validPosition(table) && !used.has(key)) {
      used.add(key)
      return { ...table, floorZone: zone, x: table.floorX, y: table.floorY }
    }
    return { ...table, floorZone: zone, x: null, y: null }
  })

  for (const table of placed) {
    if (table.x !== null) continue
    for (let y = 0; y < FLOOR_MAX_ROWS; y += 1) {
      for (let x = 0; x < FLOOR_COLUMNS; x += 1) {
        const key = cellKey(table.floorZone, x, y)
        if (used.has(key)) continue
        table.x = x
        table.y = y
        used.add(key)
        break
      }
      if (table.x !== null) break
    }
  }
  return placed
}

export function moveTableOnFloor(tables, tableId, x, y) {
  const moving = tables.find((table) => table.id === tableId)
  if (!moving || !Number.isInteger(x) || x < 0 || x >= FLOOR_COLUMNS || !Number.isInteger(y) || y < 0 || y >= FLOOR_MAX_ROWS) return tables
  const occupying = tables.find((table) => floorZone(table) === floorZone(moving) && table.x === x && table.y === y)
  return tables.map((table) => {
    if (table.id === tableId) return { ...table, x, y }
    if (table.id === occupying?.id) return { ...table, x: moving.x, y: moving.y }
    return table
  })
}

export function moveTableToZone(tables, tableId, input) {
  const zone = typeof input === 'string' ? input.trim() : ''
  if (!zone || zone.length > 40 || /\p{Cc}/u.test(zone)) throw new Error('Enter an area name of 1–40 characters.')
  const moving = tables.find((table) => table.id === tableId)
  if (!moving || floorZone(moving) === zone) return tables
  const occupied = new Set(tables.filter((table) => floorZone(table) === zone).map((table) => `${table.x}:${table.y}`))
  for (let y = 0; y < FLOOR_MAX_ROWS; y += 1) {
    for (let x = 0; x < FLOOR_COLUMNS; x += 1) {
      if (occupied.has(`${x}:${y}`)) continue
      return tables.map((table) => table.id === tableId ? { ...table, floorZone: zone, x, y } : table)
    }
  }
  throw new Error('This area is full. Choose another area.')
}
