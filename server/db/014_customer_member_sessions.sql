-- A member can have only one active personal identity within a restaurant visit.
-- The shared Guest session remains separate and continues to support table-wide
-- ordering for customers who do not join membership.
CREATE UNIQUE INDEX customer_sessions_active_table_member_idx
  ON customer_sessions (table_session_id, member_id)
  WHERE left_at IS NULL AND member_id IS NOT NULL;
