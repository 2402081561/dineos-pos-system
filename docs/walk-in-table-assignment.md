# Walk-in first, table later

Counter staff may create an independent no-table bill when a customer does not know their seat, then use **Walk-in → View order → Assign table** once the seat is known.

- Empty table: the original visit is linked to that table.
- Occupied table: the UI explicitly warns that the bills will combine, and requires **Confirm combine bills**. Target visit and all order versions are checked again on the server.
- Any payment on either visit blocks assignment, so existing receipts are not relabelled.
- Food quantities/options, prices, notes and kitchen statuses do not change; no new kitchen order is inserted. Updates increment versions so stale kitchen/payment actions must refresh.
- Original counter request keys continue to refer to their original no-table intent after assignment/merge. A lost response cannot create a duplicate bill.
- Assignments have an actor-scoped durable browser request and an atomic server idempotency/audit record. An uncertain request is shown on the counter dashboard and must be retried with its original key; reopening never auto-submits.

## Database

Migration 035 adds `orders.counter_request_walk_in` and `walk_in_table_assignments`; it uses existing visit/order/customer-session structures. It does not require deferred migrations 032/033. Migration 034 enables no-table visits.

On 2026-11-07 the explicit targeted upgrade script backed up public business data and applied:

- Independent local database (port 55434): 035, with 112 orders and 38 payments unchanged.
- Current `server/.env` database: 034 and 035, with 109 orders and 38 payments unchanged.

Backups are private local custom-format archives under `.local-tools/walkin-assignment-backup-II2xM6/` (independent local) and `.local-tools/walkin-assignment-backup-uqrF23/` (current database). No Netlify/Render deployment or Git push was performed.

## Checks

`tests/walkInAssignment.test.mjs`: actual assignment component checks for explicit selection, occupied-table warning, paid blocking, persistent exact-body retry, actor isolation and damaged storage handling.

`server/tests/walk-in-db.test.js`: creates and removes a fresh loopback-only synthetic database; exercises real creation, empty-table assignment, occupied-table merge, request replay, original-order retries after relocation, kitchen/order/price preservation, unique per-table order numbers and paid/stale-destination protection. Never run it against a hosted database.

Browser verification: the Chinese counter drawer shows 补上桌号; choosing empty Table 1 enables 确认桌号, while occupied Table 12 shows the explicit combine warning and the correct RM87.50 combined total for the existing RM72.50 walk-in plus RM15.00 table bill. No assignment was submitted on the user's existing bills. Returned to the original new-order page and verified the one-item RM13.00 walk-in draft was restored intact. Full frontend suite: 201 passing tests; targeted real local-database lifecycle check passes.
