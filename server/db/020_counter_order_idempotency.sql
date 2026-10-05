-- Counter retries must address one globally unique request, even when the
-- first response is lost before the cashier receives it.
CREATE UNIQUE INDEX orders_client_request_global_idx ON orders (client_request_id)
  WHERE client_request_id IS NOT NULL;

-- Counter orders belong to the table bill, but the cashier is not a diner
-- and must not receive a usable guest session.
ALTER TABLE customer_sessions ADD COLUMN created_by_cashier boolean NOT NULL DEFAULT false;
