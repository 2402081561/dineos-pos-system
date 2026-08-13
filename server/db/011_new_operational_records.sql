-- Imported history keeps its source ID; new Supabase operations do not have one.
ALTER TABLE service_requests ALTER COLUMN legacy_source_id DROP NOT NULL;
ALTER TABLE shift_closings ALTER COLUMN legacy_source_id DROP NOT NULL;

CREATE UNIQUE INDEX service_requests_active_customer_type_idx
  ON service_requests (customer_session_id, request_type)
  WHERE status = 'pending';

CREATE UNIQUE INDEX shift_closings_new_shift_date_idx
  ON shift_closings (shift_date)
  WHERE legacy_source_id IS NULL;
