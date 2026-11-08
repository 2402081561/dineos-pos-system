-- A walk-in bill is a real, independent visit without a physical table.
-- Existing table visits and order/payment foreign keys remain unchanged.
ALTER TABLE table_sessions ALTER COLUMN table_id DROP NOT NULL;

CREATE FUNCTION complete_walk_in_visit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM table_sessions
    WHERE id = NEW.table_session_id AND table_id IS NULL AND status = 'active'
    FOR UPDATE;
  IF FOUND AND NOT EXISTS (
    SELECT 1 FROM orders WHERE table_session_id = NEW.table_session_id
      AND status <> 'cancelled'
      AND (payment_status <> 'paid' OR NOT (
        status = 'served' OR (status = 'ready' AND
          COALESCE((SELECT (config->>'requireHandoffConfirmation')::boolean
            FROM shop_settings WHERE id = 1), true) = false)
      ))
  ) THEN
    UPDATE table_sessions SET status = 'completed', updated_at = now()
      WHERE id = NEW.table_session_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER complete_walk_in_after_order_update
AFTER UPDATE OF status, payment_status ON orders
FOR EACH ROW EXECUTE FUNCTION complete_walk_in_visit();
