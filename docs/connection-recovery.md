# Connection recovery (2026-10-26)

Scope: application stability only. No schema changes, production orders, payments, deployment or push.

## Backend

`createDatabasePool` attaches both pool-level idle-error and connected-client socket-error listeners. node-postgres discards dead clients; later requests acquire new connections. The API does not exit or end the entire pool when one connection fails. Connection acquisition/new connections have an 8-second limit, with TCP keepalive enabled. This does not guarantee instant detection of every black-holed in-flight query; the frontend's existing 15-second request timeout remains an uncertain result, not proof of rejection.

Known network/connection errors map to HTTP 503, while SQL bugs and unexpected application errors remain 500. Connection errors are logged by code only: no raw pg client, database credentials, backend secret or SQL parameters are logged. The health response remains 503 when the database is unavailable and returns to 200 when it is reachable. No catch-all `uncaughtException` suppression is used.

No SQL query, COMMIT, order, payment or refund is automatically replayed. A lost response or 503 can occur after commit, so existing persisted idempotency keys and explicit recovery actions are retained. Do not collect money again because a request timed out.

## Frontend

Polling continues serially after errors and also refreshes read-only feeds when the browser emits `online`. This is not automatic offline submission. The existing connection banner marks failed/stale feeds and clears after successful reads.

Existing-token staff verification against `/me` now has a 15-second timeout. Transient restore failures retain credentials, retry the identity read every five seconds or on `online`, and stop after verification. Explicit 401/403 do not retry. Cleanup/account changes suppress late results. Protected routes show the reconnect message while initial identity verification is unavailable; no private content is granted to an unverified user, and successful recovery returns to the original protected URL.

## Verification

- Unit/regression tests for idle and checked-out error handlers, safe logging, connection error classification, reconnect polling, authentication recovery/cleanup, protected routes, 503 counter-order key retention and a committed-but-unconfirmed payment recovered by read without another POST.
- `DINEOS_LOCAL_RECOVERY_TEST=1 node --test server/tests/database-recovery-local.test.js` creates a NEW private local PostgreSQL cluster, never reads `.env`/`DATABASE_URL`, terminates idle/active test connections, stops/restarts that isolated database, and verifies the same HTTP API process returns 503 then 200. Cleanup stops the cluster. Requires PostgreSQL binaries (default `/opt/homebrew/opt/postgresql@17/bin`).
- Existing order/payment retry and session-persistence regression suites remain required.

To apply locally, restart the existing backend or let `node --watch` reload it. Netlify/Render require a separately authorized deployment; local changes do not update them.
