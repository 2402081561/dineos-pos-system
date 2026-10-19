import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { registerRefundRoutes } from '../src/refunds.js'

// Deployment rehearsal only: explicitly requires the dedicated local socket.
// No production URL fallback and no dependency on server/.env.
test('upgraded PostgreSQL executes real refunds, replays once, preserves receipts and rolls back failed audits', {
  skip: !process.env.DINEOS_REHEARSAL_SOCKET,
}, async () => {
  const host = process.env.DINEOS_REHEARSAL_SOCKET
  assert.match(host, /^\/private\/tmp\/dineos-release-pg\.[A-Za-z0-9]+$/)
  const db = new pg.Client({ host, port: 54329, user: 'dineos_rehearsal', database: 'postgres' })
  await db.connect()
  try {
    await db.query('SET search_path TO pg_temp, public')
    for (const table of ['users', 'members', 'payments', 'orders', 'member_point_transactions', 'payment_refunds', 'audit_logs']) {
      await db.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING IDENTITY)`)
    }
    await db.query('CREATE TRIGGER preserve_refund_record BEFORE UPDATE OR DELETE ON payment_refunds FOR EACH ROW EXECUTE FUNCTION public.preserve_refund_record()')
    const actor = randomUUID(), member = randomUUID(), payment = randomUUID()
    await db.query("INSERT INTO users(id,email,display_name,role) VALUES($1,'refund-test@example.invalid','Rehearsal','admin')", [actor])
    await db.query("INSERT INTO members(id,name,phone_normalized,phone_display,points_balance) VALUES($1,'Rehearsal member','60111111111','0111111111',0)", [member])
    await db.query("INSERT INTO payments(id,receipt_number,table_session_id,cashier_id,payment_method,amount,order_snapshot) VALUES($1,'REHEARSAL-REFUND',$2,$3,'Cash',9,'[{\"items\":[{\"name\":\"Mee\",\"quantity\":1,\"price\":9}]}]'::jsonb)", [payment, randomUUID(), actor])
    await db.query("INSERT INTO member_point_transactions(member_id,type,points,payment_id) VALUES($1,'earn',9,$2)", [member, payment])
    const original = (await db.query('SELECT row_to_json(p)::text AS value FROM payments p')).rows[0].value
    let handler
    registerRefundRoutes({ get() {}, post(_path, _auth, _role, callback) { handler = callback } }, {
      pool: { connect: async () => ({ query: db.query.bind(db), release() {} }) }, requireAuthenticatedUser() {}, requireRole() {},
    })
    async function refund(amount, key = randomUUID(), reason = 'Rehearsal only') {
      let status = 200, body
      await handler({ user: { id: actor }, params: { receiptNumber: 'REHEARSAL-REFUND' }, body: { requestId: key, amount, method: 'Cash', fundsReturned: true, reason } }, {
        status(code) { status = code; return this }, json(value) { body = value; return this },
      }, (error) => { throw error })
      return { status, body }
    }
    // A failing audit must roll back the refund AND points in actual PostgreSQL.
    await db.query(`CREATE FUNCTION pg_temp.fail_refund_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.details->>'reason' = 'Force audit failure' THEN RAISE EXCEPTION 'Rehearsal audit rejection'; END IF; RETURN NEW; END $$`)
    await db.query('CREATE TRIGGER fail_refund_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_refund_audit()')
    await assert.rejects(refund('4.00', randomUUID(), 'Force audit failure'), /audit rejection/)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM payment_refunds')).rows[0].n, 0)
    assert.equal((await db.query('SELECT points_balance AS n FROM members')).rows[0].n, 0)
    const key = randomUUID()
    assert.equal((await refund('4.00', key)).status, 201)
    assert.equal((await refund('4.00', key)).body.duplicate, true)
    assert.equal((await db.query('SELECT points_balance AS n FROM members')).rows[0].n, -4)
    assert.equal((await refund('6.00')).status, 409)
    assert.equal((await refund('5.00')).status, 201)
    assert.equal((await db.query('SELECT points_balance AS n FROM members')).rows[0].n, -9)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM payment_refunds')).rows[0].n, 2)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n, 2)
    assert.equal((await db.query('SELECT row_to_json(p)::text AS value FROM payments p')).rows[0].value, original)
    await assert.rejects(db.query("UPDATE payment_refunds SET reason='Changed'"), /immutable/)
    const security = await db.query("SELECT relrowsecurity AS rls, has_table_privilege('anon','public.payment_refunds','SELECT') AS anon, has_table_privilege('authenticated','public.payment_refunds','SELECT') AS authenticated FROM pg_class WHERE oid='public.payment_refunds'::regclass")
    assert.deepEqual(security.rows[0], { rls: true, anon: false, authenticated: false })
  } finally { await db.end() }
})
