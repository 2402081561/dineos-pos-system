import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { FloorLayoutConflictError, FloorLayoutValidationError, validateFloorLayoutUpdate } from '../src/tableFloorLayout.js'
import { moveTableOnFloor, moveTableToZone, placeTablesOnFloor } from '../../src/utils/tableFloorLayout.js'
import { DEFAULT_TABLE_STYLE } from '../src/tableAppearance.js'
import { validateFreePlan } from '../src/freeFloorLayout.js'

const tables = [
  { id: 'a', tableNumber: 2, floorX: null, floorY: null },
  { id: 'b', tableNumber: 1, floorX: 2, floorY: 0 },
]

test('new tables fill the first open floor space without moving saved tables', () => {
  const placed = placeTablesOnFloor(tables)
  assert.deepEqual(placed.map(({ id, x, y }) => ({ id, x, y })), [
    { id: 'b', x: 2, y: 0 },
    { id: 'a', x: 0, y: 0 },
  ])
})

test('moving onto another table swaps the two positions', () => {
  const placed = placeTablesOnFloor(tables)
  const moved = moveTableOnFloor(placed, 'a', 2, 0)
  assert.deepEqual(moved.map(({ id, x, y }) => ({ id, x, y })), [
    { id: 'b', x: 0, y: 0 },
    { id: 'a', x: 2, y: 0 },
  ])
})

test('server rejects duplicate positions and stale layouts', () => {
  const current = tables.map(({ id, floorX, floorY }) => ({ id, floorX, floorY }))
  assert.throws(() => validateFloorLayoutUpdate({ positions: [
    { tableId: 'a', x: 0, y: 0, expectedX: null, expectedY: null },
    { tableId: 'b', x: 0, y: 0, expectedX: 2, expectedY: 0 },
  ] }, current), /same floor position/)
  assert.throws(() => validateFloorLayoutUpdate({ positions: [
    { tableId: 'a', x: 0, y: 0, expectedX: null, expectedY: null },
    { tableId: 'b', x: 2, y: 0, expectedX: null, expectedY: null },
  ] }, current), FloorLayoutConflictError)
})

test('server accepts a complete position-only layout', () => {
  const positions = [
    { tableId: 'a', x: 0, y: 0, expectedX: null, expectedY: null },
    { tableId: 'b', x: 2, y: 0, expectedX: 2, expectedY: 0 },
  ]
  assert.deepEqual(validateFloorLayoutUpdate({ positions }, tables), positions.map(({ tableId, x, y }) => ({ tableId, x, y, zone: 'Main hall', style: DEFAULT_TABLE_STYLE })))
})

const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
const routeSource = source.slice(source.indexOf("app.patch('/api/v1/cashier/table-layout'"), source.indexOf("app.get('/api/v1/cashier/receipts'"))

async function layoutRequest(positions) {
  let handler
  let roles
  const queries = []
  const client = {
    async query(sql, values) {
      queries.push({ sql, values })
      if (sql.includes('FROM restaurant_tables ORDER BY id FOR UPDATE')) return { rows: tables.map(({ id, floorX, floorY }) => ({ id, floorX, floorY })) }
      if (sql.includes('FROM floor_plan_settings')) return { rows: [{ markers: [], revision: 0 }] }
      if (sql.includes('UPDATE floor_plan_settings')) return { rows: [{ markers: JSON.parse(values[0]), revision: 1 }] }
      return { rows: [] }
    },
    release() { queries.push({ sql: 'RELEASE' }) },
  }
  runInNewContext(routeSource, {
    app: { patch(_route, _auth, _role, callback) { handler = callback } },
    requireAuthenticatedUser() {},
    requireRole(...names) { roles = names },
    pool: { connect: async () => client },
    validateFloorLayoutUpdate,
    validateFreePlan,
    FloorLayoutConflictError,
    FloorLayoutValidationError,
  })
  let code, result
  const response = { status(value) { code = value; return this }, json(value) { result = value; return this } }
  await handler({ body: { positions } }, response, (error) => { throw error })
  return { code, result, queries, roles }
}

test('cashier layout route updates only floor metadata and commits once', async () => {
  const result = await layoutRequest([
    { tableId: 'a', x: 0, y: 1, expectedX: null, expectedY: null },
    { tableId: 'b', x: 3, y: 1, expectedX: 2, expectedY: 0 },
  ])
  assert.equal(result.code, 200)
  assert.deepEqual(Array.from(result.roles), ['admin', 'cashier'])
  assert.equal(result.queries.filter(({ sql }) => sql === 'COMMIT').length, 1)
  assert.equal(result.queries.filter(({ sql }) => sql.startsWith('UPDATE restaurant_tables SET floor_x = $1')).length, 2)
  assert.ok(result.queries.every(({ sql }) => !/SET\s+(table_number|capacity|is_enabled)/i.test(sql)))
})

test('free positions are saved, markers are revision checked, and old clients cannot erase them', () => {
  const current = tables.map((table) => ({ ...table, floorPoint: { x: table.id === 'a' ? 30 : 300, y: 260 } }))
  const positions = current.map((table, index) => ({ tableId: table.id, x: index, y: 0, expectedX: table.floorX, expectedY: table.floorY, point: table.floorPoint, expectedPoint: table.floorPoint }))
  const normalized = validateFloorLayoutUpdate({ positions }, current)
  const marker = { id: 'counter', type: 'cashier', zone: 'Main hall', x: 5, y: 5 }
  assert.deepEqual(validateFreePlan({ markers: [marker], expectedRevision: 1 }, normalized, { revision: 1 }), [marker])
  assert.throws(() => validateFreePlan({ markers: [], expectedRevision: 0 }, normalized, { revision: 1 }), /CONFLICT/)
  assert.throws(() => validateFloorLayoutUpdate({ positions: positions.map(({ point: _point, ...position }) => position) }, current), FloorLayoutConflictError)
  assert.throws(() => validateFloorLayoutUpdate({ positions: positions.map((position) => ({ ...position, expectedPoint: null })) }, current), FloorLayoutConflictError)
})

test('areas have independent positions; moving an area finds a free slot', () => {
  const placed = placeTablesOnFloor([
    { id: 'a', tableNumber: 1, floorZone: 'Main hall', floorX: 0, floorY: 0 },
    { id: 'b', tableNumber: 2, floorZone: 'Outdoor', floorX: 0, floorY: 0 },
  ])
  assert.equal(placed[0].x, placed[1].x)
  const moved = moveTableToZone(placed, 'a', 'Outdoor')
  assert.equal(moved[0].floorZone, 'Outdoor')
  assert.equal(moved[0].x, 1)
  assert.equal(moved[1].x, 0)
  assert.equal(moveTableOnFloor(placed, 'a', 1, 0)[1].x, 0)
})

test('server allows the same coordinates in different areas and rejects stale area edits', () => {
  const current = tables.map((table) => ({ ...table, floorZone: 'Main hall' }))
  const positions = [
    { tableId: 'a', x: 0, y: 0, zone: 'Outdoor', expectedX: null, expectedY: null, expectedZone: 'Main hall' },
    { tableId: 'b', x: 0, y: 0, zone: 'Main hall', expectedX: 2, expectedY: 0, expectedZone: 'Main hall' },
  ]
  assert.equal(validateFloorLayoutUpdate({ positions }, current)[0].zone, 'Outdoor')
  assert.throws(() => validateFloorLayoutUpdate({ positions }, current.map((table) => ({ ...table, floorZone: 'Private room' }))), FloorLayoutConflictError)
  for (const zone of ['', 'a'.repeat(41), 'Outdoor\n', null]) {
    assert.throws(() => validateFloorLayoutUpdate({ positions: [{ ...positions[0], zone }, positions[1]] }, current), FloorLayoutValidationError)
  }
})

test('coordinate-only clients preserve existing areas', () => {
  const positions = [
    { tableId: 'a', x: 0, y: 0, expectedX: null, expectedY: null },
    { tableId: 'b', x: 1, y: 0, expectedX: 2, expectedY: 0 },
  ]
  assert.ok(validateFloorLayoutUpdate({ positions }, tables.map((table) => ({ ...table, floorZone: 'Outdoor' }))).every((position) => position.zone === 'Outdoor'))
})

test('cashier layout route rolls back a stale save', async () => {
  const result = await layoutRequest([
    { tableId: 'a', x: 0, y: 0, expectedX: null, expectedY: null },
    { tableId: 'b', x: 2, y: 0, expectedX: null, expectedY: null },
  ])
  assert.equal(result.code, 409)
  assert.ok(result.queries.some(({ sql }) => sql === 'ROLLBACK'))
  assert.ok(!result.queries.some(({ sql }) => sql.startsWith('UPDATE restaurant_tables')))
})

test('appearance is validated and stale changes rejected; old clients preserve it', () => {
  const style = { shape: 'rectangle', size: 'large', orientation: 'vertical' }
  const current = tables.map((table) => ({ ...table, floorStyle: style }))
  const positions = current.map((table, index) => ({ tableId: table.id, x: index, y: 0, expectedX: table.floorX, expectedY: table.floorY }))
  assert.deepEqual(validateFloorLayoutUpdate({ positions }, current)[0].style, style)
  const edits = positions.map((position) => ({ ...position, style: DEFAULT_TABLE_STYLE, expectedStyle: style }))
  assert.deepEqual(validateFloorLayoutUpdate({ positions: edits }, current)[0].style, DEFAULT_TABLE_STYLE)
  assert.throws(() => validateFloorLayoutUpdate({ positions: edits }, tables), FloorLayoutConflictError)
  for (const invalid of [null, [], { ...style, shape: 'triangle' }, { ...style, size: 'giant' }, { ...style, orientation: 'diagonal' }, { ...style, extra: 1 }]) {
    assert.throws(() => validateFloorLayoutUpdate({ positions: [{ ...edits[0], style: invalid }, edits[1]] }, current), FloorLayoutValidationError)
  }
})
