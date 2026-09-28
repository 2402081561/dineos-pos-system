-- Customer references are scoped to one dining/table session, not the business day.
LOCK TABLE public.table_sessions, public.orders IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.orders ADD COLUMN table_order_number bigint;
ALTER TABLE public.table_sessions ADD COLUMN last_order_number bigint NOT NULL DEFAULT 0
  CHECK (last_order_number >= 0);

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY table_session_id ORDER BY created_at, id) AS number
  FROM public.orders
)
UPDATE public.orders SET table_order_number = numbered.number
FROM numbered WHERE orders.id = numbered.id;

UPDATE public.table_sessions SET last_order_number = numbers.last_number
FROM (SELECT table_session_id, max(table_order_number) AS last_number FROM public.orders GROUP BY table_session_id) numbers
WHERE table_sessions.id = numbers.table_session_id;

ALTER TABLE public.orders ALTER COLUMN table_order_number SET NOT NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_table_order_number_positive CHECK (table_order_number > 0);
ALTER TABLE public.orders ADD CONSTRAINT orders_table_order_number_key UNIQUE (table_session_id, table_order_number);

CREATE OR REPLACE FUNCTION public.assign_daily_order_number() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  order_date date;
  daily_number bigint;
BEGIN
  -- Lock the dining session first, matching the order-creation transaction.
  -- This counter persists across midnight and includes paid/cancelled orders.
  UPDATE public.table_sessions SET last_order_number = last_order_number + 1
  WHERE id = NEW.table_session_id
  RETURNING last_order_number INTO NEW.table_order_number;

  NEW.created_at := coalesce(NEW.created_at, now());
  order_date := (NEW.created_at AT TIME ZONE 'Asia/Kuching')::date;
  INSERT INTO public.order_sequences AS sequences (business_date, last_number)
  VALUES (order_date, 1)
  ON CONFLICT (business_date) DO UPDATE
    SET last_number = sequences.last_number + 1
  RETURNING last_number INTO daily_number;

  NEW.order_number := to_char(order_date, 'YYYYMMDD') || '-' ||
    lpad(daily_number::text, greatest(3, length(daily_number::text)), '0');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_daily_order_number() FROM PUBLIC, anon, authenticated;
