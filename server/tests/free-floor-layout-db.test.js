import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import dotenv from 'dotenv'
import pg from 'pg'
import { FloorLayoutConflictError, FloorLayoutValidationError, validateFloorLayoutUpdate } from '../src/tableFloorLayout.js'
import { validateFreePlan } from '../src/freeFloorLayout.js'

test('free layout route persists tables and markers atomically, rejects stale saves', { skip: process.env.DINEOS_DATABASE_TESTS !== '1' }, async () => {
  dotenv.config({ path: new URL('../.env', import.meta.url) })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    // Only connection-local temporary tables are modified, never business records.
    await client.query(`CREATE TEMP TABLE restaurant_tables (id text PRIMARY KEY, floor_x int, floor_y int, floor_zone text, floor_style jsonb, floor_point jsonb);
      CREATE TEMP TABLE floor_plan_settings (id int PRIMARY KEY, markers jsonb, revision int, updated_at timestamptz);
      INSERT INTO restaurant_tables VALUES ('t1',0,0,'Main hall','{"shape":"round","size":"large","orientation":"horizontal"}',NULL);
      INSERT INTO floor_plan_settings VALUES (1,'[]',0,now())`)
    const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
    const routeSource = source.slice(source.indexOf("app.patch('/api/v1/cashier/table-layout'"), source.indexOf("app.get('/api/v1/cashier/receipts'"))
    let handler
    runInNewContext(routeSource, {
      app: { patch(_url, _auth, _role, callback) { handler = callback } }, requireAuthenticatedUser() {}, requireRole() {},
      pool: { connect: async () => ({ query: (sql, params) => client.query(sql, params), release() {} }) },
      validateFloorLayoutUpdate, validateFreePlan, FloorLayoutConflictError, FloorLayoutValidationError,
    })
    const body = { expectedRevision: 0, markers: [{ id: 'counter', type: 'cashier', zone: 'Main hall', x: 20, y: 30 }], positions: [{ tableId: 't1', x: 0, y: 0, zone: 'Main hall', expectedZone: 'Main hall', expectedX: 0, expectedY: 0, point: { x: 375, y: 180 }, expectedPoint: null }] }
    async function request(input) {
      let status, data
      await handler({ body: input }, { status(code) { status = code; return this }, json(value) { data = value; return this } }, (error) => { throw error })
      return { status, data }
    }
    const saved = await request(body)
    assert.equal(saved.status, 200)
    assert.equal(saved.data.floorPlan.revision, 1)
    assert.deepEqual((await client.query('SELECT floor_point FROM restaurant_tables')).rows[0].floor_point, { x: 375, y: 180 })
    assert.deepEqual((await client.query('SELECT markers FROM floor_plan_settings')).rows[0].markers, body.markers)
    assert.equal((await request(body)).status, 409)
    const updated = { ...body, positions: [{ ...body.positions[0], expectedPoint: body.positions[0].point }], expectedRevision: 1, markers: [] }
    assert.equal((await request(updated)).status, 200)
    assert.equal((await client.query('SELECT markers FROM floor_plan_settings')).rows[0].markers.length, 0)
    assert.equal((await request({ ...updated, expectedRevision: 1 })).status, 409)
    assert.equal((await client.query('SELECT revision FROM floor_plan_settings')).rows[0].revision, 2)
  } finally { await client.end() }
})
