# Operational recovery and manual refunds

## What changed

- The cashier saves the exact payment body and request ID in session storage before sending. A refresh restores a read-only status check for the same employee. Only an explicit retry re-sends the original body/key. Pending or damaged records block fresh collections in that tab. The status lookup only returns a payment owned by the authenticated cashier; it never creates a payment.
- Live polling feeds expose checking, updated, failed/stale, and offline states. The displayed timestamp is the oldest successful update among active monitored feeds, not a promise that every backend service is healthy. Requests time out after 15 seconds. No offline submissions are queued or automatically replayed. Backend version/price checks remain authoritative.
- Customer service history is scoped to the authenticated table visit. Pending requests appear before recent completed requests (up to 100). The UI disables duplicate types while pending. No extra “in progress” state is invented: the existing workflow is pending → completed.
- Pages load on demand. Render/lazy-load errors show a safe reload action instead of an unhandled blank page. Reloading leaves saved session-storage recovery records intact; this cannot recover data the browser has deleted.

## Refund workflow

Only an Admin may create a refund record. Cashiers may view the refund summary beside a paid receipt. The Admin selects an original paid receipt, enters a positive amount/reason/method, confirms that money has **already been returned outside DineOS**, then reviews and submits. DineOS does not initiate bank/card/e-wallet transfers. A lost response retains the exact refund request; refresh checks history before allowing another record.

Refunds are monetary adjustments against a payment, not item cancellation or inventory restoration. Partial refunds can be recorded up to the remaining original payment amount. Receipt snapshots, paid quantities, kitchen state and handoffs are not rewritten. Each refund has its own printable record. The payment row lock serializes concurrent refunds; request IDs are globally locked and bound to the Admin and normalized payload. Refund, points adjustment and audit commit in one transaction. Refund records are immutable and not accessible directly by Supabase browser roles.

Loyalty points awarded by that payment are reversed proportionally to cumulative refunded amount, rounded down, with an exact full reversal at full refund. If the points were already redeemed, the balance can become negative; future earnings offset that debt, while existing redemption guards disallow spending unavailable points. This policy is displayed on the refund screen. No rewards already handed out are silently removed.

Reports show gross receipts, recorded refunds and net receipts separately. Refunds use their actual recorded date, including refunds of earlier receipts. Net receipts may be negative on a refund-only day. Sales charts and item sales remain gross, not item-level net-sales allocations. Daily closing data includes separate refund totals/breakdown/net receipts; existing finalized snapshots remain unchanged. CSV report exports include refund records. Existing receipts can still be printed unchanged.

## Database rollout — not performed by this change

Migration `server/db/030_refund_records.sql` is registered in the schema runner. It adds the refund ledger, protects it with RLS/role revocations, adds the refund point-transaction type/sign rule, and allows point debt. It does not delete or rewrite historical orders/receipts. Review the policy, back up the database and validate in a disposable test database before applying to a live store. No migration or live financial operation was executed during implementation.

Until migration 030 is applied, refund writes return a clear unavailable response. Reports and closing screens mark refund/net totals unavailable rather than silently calling them zero; gross receipts remain readable. Gmail remains postponed and the member-email feature gate is unchanged.

## Verification and limitations

Automated tests use mocked API/transaction boundaries only. They cover per-employee recovery, lost committed responses, explicit retries, concurrent refund keys, over-refund rejection, immutable receipts, atomic audit/points rollback, table-scoped requests, and period reporting. Browser checks use temporary mocked data, including a 390px mobile layout. No real orders, payments, refunds, emails, or deployments are performed.

Recovery is per browser tab and employee, not a cross-device financial reconciliation service. Do not close an unresolved tab or clear browser storage; inspect receipt/refund history first. A permanently damaged or irreconcilable record intentionally blocks new money operations in that tab until an administrator reconciles it; there is no unsafe “forget payment” shortcut. Printer hardware/cutter behavior and real database migration execution require separate environment checks.
