# Runtime diagnostics

This instrumentation is diagnostic only, not a fix for the November 8 connection failures. No additional dependency, schema change, outbound heartbeat, write retry, or Render setting change is required.

## Two distinct probes

- `GET /livez`: minimal `{ "status": "ok" }`, no database/auth dependency, `Cache-Control: no-store`. It proves only that the HTTP application can respond.
- `GET /health`: unchanged database-aware readiness check. Keep this as the existing Render health-check path. Do not replace it with `/livez`: a live process may still have an unavailable database.

## Log signals

`[API diagnostics]` entries are JSON with a random per-process `bootId`:

- `boot`: index-module execution reached application initialization.
- `listening`: HTTP listener started, with elapsed startup milliseconds.
- `first_http_request` / `first_preflight`: first request of each kind reached Express, logged only once per process.
- `heartbeat`: once per minute while the process is running; uptime, RSS/heap MiB, coarse timer delay, cumulative request/preflight counts and passive pool total/idle/waiter counts. These are not CPU measurements. No DB query or network request is made.
- `listen_error` / `closed`: listener failure code or close event. These do not intercept exceptions, retry writes, change process exit behavior, or implement shutdown/restart handling. Abrupt kills may have no close log.

No URL, query string, request/response body, headers, token, user/order identifier, database address, or secret is logged. Public liveness exposes no boot identifier, memory, pool, or deployment details. The timer is unreferenced and does not prevent Render idle spin-down.

## Interpret during an incident

1. Compare `/livez`, `/health`, and a credential-free OPTIONS preflight from the approved frontend origin.
2. `/livez` and OPTIONS work, `/health` fails: investigate database/pool readiness; this does not prove all business routes work.
3. All three fail, recent heartbeats continue: investigate request forwarding/HTTP handling; request counters may help establish whether traffic reaches Express.
4. All three fail and there are no new boot/heartbeat records: sleep, failed wake-up, process termination/blocking, or delayed log ingestion remain possible. Absence of logs alone does not distinguish them or prove a platform fault.
5. A later new boot/listening record establishes a new process; compare its timestamp with requests. A successful redeploy is recovery evidence, not a permanent fix.

Do not automatically restart/redeploy, keep the free service awake with external polling, or change compute plans. Those actions require the owner's separate approval. These diagnostics are useful online only after a separately approved backend deployment.
