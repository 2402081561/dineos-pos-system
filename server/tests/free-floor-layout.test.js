import assert from 'node:assert/strict'
import test from 'node:test'
import { layoutHasOverlap, layoutObjects, samePoint, tablePoint, validPoint, validateFreePlan } from '../src/freeFloorLayout.js'

test('legacy grid layout becomes free coordinates without losing areas or shapes', () => {
  assert.deepEqual(tablePoint({ x: 7, y: 49 }), { x: 1036, y: 8330 })
  assert.ok(validPoint(tablePoint({ x: 7, y: 49 })))
  assert.deepEqual(tablePoint({ x: 3, y: 4, floorPoint: { x: 17, y: 48 } }), { x: 17, y: 48 })
  assert.equal(samePoint(null, undefined), true)
  assert.equal(samePoint({ x: 1, y: 2 }, { x: 2, y: 2 }), false)
})

test('bounded free positions reject NaN, fractions, oversized and malformed points', () => {
  for (const point of [null, [], { x: -1, y: 0 }, { x: 1061, y: 0 }, { x: 0, y: 8445 }, { x: NaN, y: 1 }, { x: 1.5, y: 0 }, { x: '1', y: 0 }, { x: 1, y: 0, extra: 1 }]) assert.ok(!validPoint(point))
})

test('overlaps respect areas and allow touching edges', () => {
  const tables = [{ id: 'a', floorZone: 'Main hall', floorPoint: { x: 0, y: 0 } }, { id: 'b', floorZone: 'Outdoor', floorPoint: { x: 0, y: 0 } }]
  assert.equal(layoutHasOverlap(layoutObjects(tables)), false)
  tables[1].floorZone = 'Main hall'
  assert.equal(layoutHasOverlap(layoutObjects(tables)), true)
  tables[1].floorPoint.x = 140
  assert.equal(layoutHasOverlap(layoutObjects(tables)), false)
})

test('markers are normalized and validated together with tables', () => {
  const positions = [{ tableId: 't1', zone: 'Main hall', point: { x: 200, y: 200 } }]
  const marker = { id: 'counter', type: 'cashier', zone: 'Main hall', x: 0, y: 0 }
  const validate = (markers) => validateFreePlan({ markers, expectedRevision: 3 }, positions, { revision: 3 })
  assert.deepEqual(validate([marker]), [marker])
  for (const bad of [{ ...marker, type: 'unknown' }, { ...marker, id: 't1' }, { ...marker, zone: '' }, { ...marker, x: 150, y: 200 }, { ...marker, y: Infinity }]) assert.throws(() => validate([bad]))
  assert.throws(() => validate([marker, marker]), /Invalid floor marker/)
  assert.throws(() => validateFreePlan({ markers: [], expectedRevision: 3 }, [{ ...positions[0], point: null }], { revision: 3 }), /valid floor position/)
})
