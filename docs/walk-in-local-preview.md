# Walk-in local preview (2026-11-06)

This change is **not deployed**. Hosted database migrations remain unchanged.
The existing `server/.env` was not edited; it still refers to the hosted DB.
Do not run the schema command with that URL without a separate production approval.

## Isolated local environment

- Local database: `postgresql://dineos_local@127.0.0.1:55434/postgres`
- API: `http://localhost:4001`
- Frontend: `http://127.0.0.1:4182`
- Local-only upgrade: `034_walk_in_orders.sql`; 032/033 were not applied.
- Private pre-upgrade archive and cluster: `.local-tools/walk-in-local-iNi3QJ/`
- Copied original counts: 109 orders / 38 payments; upgrade preserves both.
- Authentication remains real Supabase sign-in. There is no authentication bypass
  in either preview server. A different browser origin needs its own login.
- Email OTP and welcome sending are explicitly disabled in the preview process.

API launch (from repository root):

```sh
env DATABASE_URL=postgresql://dineos_local@127.0.0.1:55434/postgres PORT=4001 MEMBER_EMAIL_OTP_ENABLED=false MEMBER_WELCOME_EMAIL_ENABLED=false npm --prefix server run dev
```

Frontend launch (another terminal):

```sh
env VITE_API_URL=http://localhost:4001 VITE_SAVED_TABLE_VISITS_ENABLED=false npm run dev -- --host 127.0.0.1 --port 4182 --strictPort
```

Port 5173 continues to use the original API configuration. Do not test walk-in
writes there. The preview deliberately avoids changing the user's current servers.

## Workflow

Cashier → New order → Table selection → Walk-in (no table).
Each submission creates its own no-table visit. Payment grouping uses that visit
ID, not a shared “walk-in table”. Existing request IDs protect retries. Cashier
shows separate outstanding walk-in bills. Kitchen, handoff and receipt queries
include no-table visits; printed headings say “Walk-in” / “散客”.

A paid order remains active while the kitchen prepares it. Completion requires
payment and handoff, or payment and kitchen-ready when handoff confirmation is
disabled. No physical-table clearing is shown for walk-in receipts.

## Verification

`tests/walkInOrders.test.mjs` exercises the real pending-payment grouping hook,
draft recovery, counter page and API adapter plus printer payloads.
`server/tests/walk-in-db.test.js` refuses non-loopback database hosts, creates a
disposable local test database with synthetic fixtures, exercises the actual Express handlers and SQL,
then removes that test database. Its in-memory authentication fixture is test-only.

```sh
env DINEOS_DATABASE_TESTS=1 DATABASE_URL=postgresql://dineos_local@127.0.0.1:55434/postgres node --test server/tests/walk-in-db.test.js
```
