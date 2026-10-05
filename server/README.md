# DineOS Node.js + PostgreSQL API

This is a new, independent backend foundation. It does not connect to, migrate, or modify the current Firebase database.

## Local setup

1. Create an empty PostgreSQL database named `dineos_next`.
2. Copy `.env.example` to `.env` and set a real `DATABASE_URL`.
3. Apply the schema with `npm run db:schema`.
4. Run `npm run dev`.

`GET /health` verifies only the new PostgreSQL connection.

The existing React/Firebase application deliberately remains unchanged. API routes and a frontend migration should be introduced incrementally after the new database is provisioned and verified.

## Copy the current Firestore data

After the new PostgreSQL database is ready, run `npm run migrate:firestore-snapshot` inside `server/`.

The command is read-only against Firebase and upserts every known top-level DineOS Firestore collection into `firebase_import_documents`. It preserves the original Firestore document ID and serialized data for traceability. It does not copy Firebase Authentication accounts or passwords; those require a separate authenticated-account migration plan and must never copy passwords into PostgreSQL.

Then apply any new migrations with `npm run db:schema` and run `npm run map:firestore-snapshot`. The mapper creates normalized copies of categories, tables, members, menu items, rewards, table/customer sessions, orders, and order items while retaining a source-ID map. When a legacy order's table session document was already removed from Firebase, the mapper creates one completed historical session per original table number rather than discarding the order. Payments, point transactions, staff accounts, and operational history remain safely preserved in the immutable snapshot until their relationships and authentication migration are designed and verified.

## Cash received and change

Before running the cash-tender update, apply migration `017_cash_tender.sql` using `npm run db:schema`. Deploy the updated API and frontend together: older clients without `cashReceived` cannot complete a Cash payment with the updated API and must refresh. Other payment methods are unchanged.

Cash payments require a non-negative decimal `cashReceived` (at most two decimal places). The API recalculates the bill from locked orders, checks the optional `expectedAmount` confirmation, rejects insufficient cash, and derives change itself. `payments.amount` remains the bill amount, not the tendered cash; reports and shift closing therefore do not count change as revenue. Original receipts without recorded tender remain NULL rather than receiving invented historical values.

Run isolated validation/handler tests from the repository root with `node --test server/tests/cash-payment.test.js`. These tests use a database double and do not complete real payments.

## Cashier table floor plan

Apply `018_table_floor_layout.sql` with `npm run db:schema` before deploying the floor-plan API and frontend. It adds nullable grid coordinates to existing restaurant tables; tables without saved positions are placed automatically in the first free slot on screen. The Cashier or Admin role may save a complete floor layout through the API, which updates only the coordinates in a transaction. Concurrent edits or changes to the table list are rejected, and positions are shared by cashier devices. This does not change table numbers, QR codes, sessions, orders, or payments.

`019_table_floor_areas.sql` extends the plan with table areas (default: Main hall). Positions are unique within each area. Apply it before starting the updated API. Cashier/Admin can move tables between areas with the same save transaction and conflict checks. The pending-orders response also includes current-visit order counts, all unpaid totals and served payable totals for the table-summary dialog. Ordering sessions are labelled separately from seating capacity because a shared session is not an actual guest headcount.

## Single-store shop name

Apply `npm run server:db:schema` from the repository root to add migration
`021_shop_settings.sql`, then restart the API. Admins can open `/admin/settings`
to change the shared shop name (1–80 characters, Chinese or English).
Only an authenticated `admin` may PATCH `/api/v1/admin/shop-settings`;
`/api/v1/public/shop-settings` exposes only the display name, never credentials.
Direct browser database access remains revoked; RLS is enabled without policies.
The client refreshes the name every 30 seconds while visible and on returning
to the tab. Saving uses the previously loaded name to reject stale overwrites.

New payments snapshot the shop name as `payments.restaurant_name` so reprinting
does not rename historical receipts. Existing payments are not backfilled and
display the current name. Apply the migration before running the updated API.
