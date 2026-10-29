# Saved identifiers and table-visit operations (2026-10-26)

Local implementation. **Migration 032 is prepared but has NOT been applied to the production database. No deploy or push.** The UI disables new counter fields until the server confirms availability. Without 032, saved-identifier/table-visit endpoints show an upgrade-required message rather than pretending to save.

## Identifiers

- Counter new-order draft optionally includes `ticketSeat` and `ticketReference`, each up to 80 plain-text characters. They survive refresh and freeze with uncertain submissions; old drafts/requests with no fields remain valid.
- Creation writes identifiers in the same transaction as the order. Existing idempotent retries do not overwrite them.
- Staff can load/save them from table order management, recent-order details, and kitchen print preview. Admin/cashier/kitchen only; no public customer endpoint exposes the phone suffix/car plate.
- Edits use independent `ticketRevision` compare-and-swap plus transactional audit. Identical retries succeed without an extra edit. Stale conflicting saves require reload. Financial versions, prices and quantities are untouched.
- Kitchen queue displays the identifiers. Printing loads saved values, requires saving edits first, and carries them in the existing v0.3 helper payload. Kitchen paper still has no order number/time/price, and dine-in/takeaway headings occur once per group.

## Whole-visit move / merge

Cashier → select an active table → its order-management panel → Move / merge table bill → Load current tables → choose destination → confirm.

- Empty destination: move the entire active visit, retaining its session ID and guest tokens.
- Occupied destination: combine visits at the target, retaining canonical order numbers and prices; renumber only internal per-visit order counters to avoid collisions. Kitchen and fulfilment statuses/counters are not reset. Source table becomes free. Customer sessions and service requests move with their orders.
- Original shared Guest identities remain shared, not accidentally treated as personal/member identities. A member active at both tables blocks merging rather than silently combining their accounts.
- API-verified merge history rebases the same browser's cart to the destination without changing an uncertain order's request ID. Normal new visits still clear old carts.
- Counter retries compare their original table, even after moving, so a lost order response cannot create a replacement ticket.
- **Neither visit may contain ANY payment record, paid item quantity, paid total or receipt reference. Partially paid visits are blocked too.** This deliberately avoids relocating historical receipts or refunds. Physical table layout is not modified.
- Ordered locks and complete expected visit/order-version snapshots protect against concurrent joins, kitchen changes, payments, duplicate clicks and stale confirmation. Order versions increment so old payment confirmations cannot collect a moved bill.
- Each operation persists an actor-bound request ID, canonical fingerprint and result in `table_visit_moves`, plus an audit entry, in one transaction. Identical retries return the prior result. Audit failure rolls everything back.
- Browser session storage saves the exact request before sending. Uncertain responses keep it; a reload never automatically sends it. Open an active table's management panel and explicitly retry the saved operation. Damaged saved recovery data blocks a new move until an administrator checks it.

## Verification

`DINEOS_LOCAL_VISIT_TEST=1 node --test server/tests/table-visits-local.test.js` creates a fresh isolated local PostgreSQL (no `.env`/production connection), applies 001–032, and executes actual handlers for identifier persistence/stale saves, move/merge, replay/actor isolation, stale order protection, payment blocking, competing destinations, a racing payment and audit-failure rollback. Cleanup stops the temporary cluster.

Frontend regressions cover saved identifiers, print gating, draft persistence, confirmed-merge cart rebasing and exact-key move recovery after refresh. Existing customer/order/payment/receipt tests must remain green. Hardware printing and production acceptance remain pending after separately approved migration/deployment.
