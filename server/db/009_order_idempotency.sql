-- A customer retry after a network interruption must return the same order,
-- never create a duplicate kitchen ticket.
ALTER TABLE orders ADD COLUMN client_request_id uuid;
CREATE UNIQUE INDEX orders_customer_request_idx ON orders (customer_session_id, client_request_id) WHERE client_request_id IS NOT NULL;
