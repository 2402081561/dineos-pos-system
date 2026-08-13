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
