import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

test('local walk-in lifecycle: independent bills, retry, kitchen, payment, receipts and handoff', { skip: process.env.DINEOS_DATABASE_TESTS !== '1' }, async () => {
  // Never run mutating integration tests against a hosted database.
  const target = new URL(process.env.DATABASE_URL)
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Local database required')
  const name = 'walkin_test_' + randomUUID().replaceAll('-', '')
  const adminUrl = new URL(target); adminUrl.pathname = '/template1'
  const admin = new pg.Client({ connectionString: adminUrl.href })
  await admin.connect()
  let pool, server
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`)
    target.pathname = '/' + name
    process.env.DATABASE_URL = target.href
    process.env.MEMBER_EMAIL_OTP_ENABLED = 'false'
    process.env.MEMBER_WELCOME_EMAIL_ENABLED = 'false'
    const db = new pg.Client({ connectionString: target.href }); await db.connect()
    // Build synthetic fixtures, not a copy of customer data. Deliberately test
    // 031 + 034/035 compatibility without requiring deferred 032/033 upgrades.
    const migrations = new URL('../db/', import.meta.url)
    for (const file of (await readdir(migrations)).filter((file) => /^\d{3}.*\.sql$/.test(file) && (Number(file.slice(0, 3)) <= 31 || file.startsWith('034_') || file.startsWith('035_'))).sort()) {
      await db.query(await readFile(new URL(file, migrations), 'utf8'))
    }
    const actor = (await db.query("INSERT INTO users(email,display_name,role) VALUES ('test@example.invalid','Test cashier','admin') RETURNING id")).rows[0]
    await db.query("INSERT INTO menu_items(name,price) VALUES ('Test rice',9)")
    await db.query('INSERT INTO restaurant_tables(table_number,capacity) VALUES (1,4)')
    assert.ok(actor)
    await db.query("UPDATE shop_settings SET config=jsonb_set(config,'{requireHandoffConfirmation}','true'::jsonb)")
    await db.end()

    // Exercise actual production handlers and SQL. Authentication is replaced
    // only in this in-memory test module, never in the application source.
    const index = new URL('../src/index.js', import.meta.url)
    const require = createRequire(index)
    let source = await readFile(index, 'utf8')
    source = source.slice(0, source.indexOf('const apiServer =')) + '\nexport { app, pool };'
    source = source.replace('const requireAuthenticatedUser = createAuthenticatedUserMiddleware({ verifyToken: verifySupabaseAccessToken, pool })',
      `const requireAuthenticatedUser = (request, response, next) => { request.user = { id: '${actor.id}', role: 'admin' }; next() }`)
    source = source.replace(/from '([^']+)'/g, (_, spec) => `from '${spec.startsWith('node:') ? spec : pathToFileURL(require.resolve(spec)).href}'`)
      .replace("import 'dotenv/config'", `import '${pathToFileURL(require.resolve('dotenv/config')).href}'`)
    const appModule = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
    pool = appModule.pool
    server = appModule.app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const base = 'http://127.0.0.1:' + server.address().port
    async function api(path, body, method = body ? 'POST' : 'GET', key) {
      const response = await fetch(base + '/api/v1' + path, { method, headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      const data = response.status === 204 ? {} : await response.json()
      assert.ok(response.ok, `${method} ${path} ${response.status}: ${JSON.stringify(data)}`)
      return data
    }
    const setup = await api('/cashier/order-setup')
    assert.equal(setup.walkInEnabled, true)
    const dish = setup.items.find((item) => item.isAvailable && !item.optionGroups?.length && Number(item.price) > 0)
    assert.ok(dish)
    const key = randomUUID()
    const body = { tableId: null, isWalkIn: true, expectedTableSessionId: null, customerNickname: 'Walk-in test', settingsRevision: setup.settingsRevision,
      items: [{ menuItemId: dish.id, quantity: 1, orderType: 'take_away' }] }
    const first = await api('/cashier/orders', body, 'POST', key)
    const [retry, second] = await Promise.all([api('/cashier/orders', body, 'POST', key), api('/cashier/orders', { ...body, customerNickname: 'Separate customer' }, 'POST', randomUUID())])
    assert.equal(first.order.id, retry.order.id)
    assert.equal(retry.duplicate, true)
    assert.notEqual(first.order.tableSessionId, second.order.tableSessionId)
    assert.equal(first.order.isWalkIn, true)
    assert.equal(first.order.tableId, null)
    const pending = await api('/cashier/pending-orders')
    assert.ok(pending.orders.some((order) => order.id === first.order.id && order.isWalkIn))
    assert.equal(pending.floorTables.length, setup.tables.length)
    assert.ok((await api('/kitchen/orders')).orders.some((order) => order.id === first.order.id && order.isWalkIn))
    const detail = (await api('/cashier/orders/' + first.order.id)).order
    const paymentBody = { requestId: randomUUID(), orderIds: [detail.id], versions: { [detail.id]: detail.version },
      paymentMethod: 'Cash', discount: { type: 'percentage', value: 0 }, cashReceived: 1000,
      selections: detail.items.map((item) => ({ itemId: item.id, quantity: item.quantity })) }
    const payment = (await api('/cashier/payments', paymentBody)).payment
    assert.equal(payment.isWalkIn, true)
    assert.equal((await api('/cashier/payments', paymentBody)).payment.receiptNumber, payment.receiptNumber)
    assert.equal((await api('/cashier/payment-requests/' + paymentBody.requestId)).payment.isWalkIn, true)
    assert.equal((await api('/cashier/receipts/' + payment.receiptNumber)).receipt.isWalkIn, true)
    assert.ok((await api('/cashier/receipts')).receipts.some((receipt) => receipt.receiptNumber === payment.receiptNumber && receipt.isWalkIn))
    await api('/cashier/receipts/' + payment.receiptNumber + '/reprint', {}, 'POST')
    assert.equal((await api('/cashier/orders/' + detail.id)).order.tableSessionStatus, 'active', 'Paid preparing orders stay in the kitchen')
    for (const [expectedStatus, status] of [['received', 'preparing'], ['preparing', 'ready']]) {
      const fresh = (await api('/cashier/orders/' + detail.id)).order
      await api('/kitchen/orders/' + detail.id + '/status', { expectedStatus, status, expectedVersion: fresh.version }, 'PATCH')
    }
    const handoff = (await api('/staff/handoffs')).orders.find((order) => order.id === detail.id)
    assert.ok(handoff?.isWalkIn)
    await api('/staff/orders/' + detail.id + '/handoff', { itemId: detail.items[0].id, quantity: 1, expectedVersion: handoff.version }, 'PATCH')
    assert.equal((await api('/cashier/orders/' + detail.id)).order.tableSessionStatus, 'completed')
    assert.ok((await api('/cashier/pending-orders')).orders.some((order) => order.id === second.order.id), 'Second walk-in remains unpaid')
    await pool.query("UPDATE shop_settings SET config=jsonb_set(config,'{requireHandoffConfirmation}','false'::jsonb)")
    const secondDetail = (await api('/cashier/orders/' + second.order.id)).order
    await api('/cashier/payments', { ...paymentBody, requestId: randomUUID(), orderIds: [secondDetail.id], versions: { [secondDetail.id]: secondDetail.version }, selections: secondDetail.items.map((item) => ({ itemId: item.id, quantity: item.quantity })) })
    for (const [expectedStatus, status] of [['received', 'preparing'], ['preparing', 'ready']]) {
      const fresh = (await api('/cashier/orders/' + secondDetail.id)).order
      await api('/kitchen/orders/' + secondDetail.id + '/status', { expectedStatus, status, expectedVersion: fresh.version }, 'PATCH')
    }
    assert.equal((await api('/cashier/orders/' + secondDetail.id)).order.tableSessionStatus, 'completed', 'Ready and paid completes a walk-in when staff handoff is disabled')
    await api('/admin/orders'); await api('/admin/dashboard'); await api('/cashier/settlement')

    // Assign the EXISTING unpaid walk-in to an empty table, without recreating
    // a kitchen order or losing the original creation idempotency key.
    const sourceKey = randomUUID()
    const third = await api('/cashier/orders', { ...body, customerNickname: 'Seat later', items: [{ ...body.items[0], quantity: 2 }] }, 'POST', sourceKey)
    const options = await api(`/cashier/walk-in-visits/${third.order.tableSessionId}/tables`)
    const empty = options.tables.find((table) => table.tableSessionId === null)
    assert.ok(empty)
    const assignment = { requestId: randomUUID(), sourceSessionId: third.order.tableSessionId, targetTableId: empty.id, targetSessionId: null, sourceOrders: options.source.orders, targetOrders: empty.orders }
    const beforeAssign = (await api('/cashier/orders/' + third.order.id)).order
    const assigned = await api('/cashier/walk-in-visits/assign-table', assignment)
    assert.equal(assigned.result.tableNumber, empty.tableNumber)
    assert.equal((await api('/cashier/walk-in-visits/assign-table', assignment)).duplicate, true)
    const assignedDetail = (await api('/cashier/orders/' + third.order.id)).order
    assert.equal(assignedDetail.isWalkIn, false)
    assert.equal(assignedDetail.tableId, empty.id)
    assert.equal(assignedDetail.status, beforeAssign.status)
    assert.deepEqual(assignedDetail.items, beforeAssign.items)
    assert.equal(assignedDetail.grandTotal, beforeAssign.grandTotal)
    assert.equal((await api('/cashier/orders', { ...body, items: [{ ...body.items[0], quantity: 2 }] }, 'POST', sourceKey)).order.id, third.order.id)

    // Choosing an occupied table explicitly combines its bills, preserving IDs,
    // kitchen progress, historical prices and unique table-order slots.
    const fourthKey = randomUUID(), fourth = await api('/cashier/orders', body, 'POST', fourthKey)
    const mergeSetup = await api(`/cashier/walk-in-visits/${fourth.order.tableSessionId}/tables`)
    const occupied = mergeSetup.tables.find((table) => table.id === empty.id)
    const merge = { requestId: randomUUID(), sourceSessionId: fourth.order.tableSessionId, targetTableId: empty.id, targetSessionId: occupied.tableSessionId, sourceOrders: mergeSetup.source.orders, targetOrders: occupied.orders }
    assert.equal((await api('/cashier/walk-in-visits/assign-table', merge)).result.merged, true)
    assert.equal((await api('/cashier/orders', body, 'POST', fourthKey)).order.id, fourth.order.id)
    const mergedDetail = (await api('/cashier/orders/' + fourth.order.id)).order
    assert.equal(mergedDetail.tableSessionId, third.order.tableSessionId)
    const mergedOrders = (await api('/cashier/pending-orders')).orders.filter((order) => order.tableSessionId === third.order.tableSessionId)
    assert.equal(mergedOrders.length, 2)
    const slots = (await pool.query('SELECT table_order_number FROM orders WHERE table_session_id=$1', [third.order.tableSessionId])).rows
    assert.equal(new Set(slots.map((row) => row.table_order_number)).size, 2)
    assert.equal((await api('/kitchen/orders')).orders.filter((order) => [third.order.id, fourth.order.id].includes(order.id)).length, 2)

    const fifth = await api('/cashier/orders', body, 'POST', randomUUID())
    const paidDetail = (await api('/cashier/orders/' + fifth.order.id)).order
    await api('/cashier/payments', { ...paymentBody, requestId: randomUUID(), orderIds: [paidDetail.id], versions: { [paidDetail.id]: paidDetail.version }, selections: paidDetail.items.map((item) => ({ itemId: item.id, quantity: item.quantity })) })
    const paidSetup = await api(`/cashier/walk-in-visits/${fifth.order.tableSessionId}/tables`)
    assert.equal(paidSetup.source.hasPayments, true)
    const paidAttempt = await fetch(base + '/api/v1/cashier/walk-in-visits/assign-table', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...merge, requestId: randomUUID(), sourceSessionId: fifth.order.tableSessionId, sourceOrders: paidSetup.source.orders, targetOrders: paidSetup.tables.find((table) => table.id === empty.id).orders }) })
    assert.equal(paidAttempt.status, 409)
    assert.equal((await api('/cashier/orders/' + fifth.order.id)).order.isWalkIn, true)
    const rejectedPost = async (value) => fetch(base + '/api/v1/cashier/walk-in-visits/assign-table', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
    assert.equal((await rejectedPost({ ...assignment, targetTableId: randomUUID() })).status, 409, 'Reusing an assignment key for another destination is rejected')
    const sixth = await api('/cashier/orders', body, 'POST', randomUUID())
    const staleSetup = await api(`/cashier/walk-in-visits/${sixth.order.tableSessionId}/tables`)
    const staleTarget = staleSetup.tables.find((table) => table.id === empty.id)
    const staleBody = { ...merge, requestId: randomUUID(), sourceSessionId: sixth.order.tableSessionId, sourceOrders: staleSetup.source.orders, targetOrders: staleTarget.orders }
    await pool.query('UPDATE orders SET version=version+1 WHERE id=$1', [sixth.order.id])
    assert.equal((await rejectedPost(staleBody)).status, 409)
    assert.equal((await api('/cashier/orders/' + sixth.order.id)).order.isWalkIn, true)
    const freshSetup = await api(`/cashier/walk-in-visits/${sixth.order.tableSessionId}/tables`)
    assert.equal((await rejectedPost({ ...staleBody, requestId: randomUUID(), sourceOrders: freshSetup.source.orders, targetSessionId: null, targetOrders: [] })).status, 409, 'An occupied table cannot be silently treated as empty')
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM walk_in_table_assignments')).rows[0].n, 2)
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 50)) // finish fire-and-forget local audit writes
    if (server) await new Promise((resolve) => server.close(resolve))
    if (pool) await pool.end()
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    await admin.end()
  }
})
