-- Shared-table mode: every browser that scans the same table QR joins one
-- database-owned customer session. This deliberately trades individual order
-- ownership for a shared table experience.
ALTER TABLE table_sessions
  ADD COLUMN shared_customer_session_id uuid UNIQUE REFERENCES customer_sessions(id) ON DELETE SET NULL;
