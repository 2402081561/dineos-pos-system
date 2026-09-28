-- Human-readable references only; UUIDs remain the identity used by payments
-- and every order mutation. Business days follow Malaysia time.
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.orders ADD COLUMN order_number text;
CREATE TABLE public.order_sequences (
  business_date date PRIMARY KEY,
  last_number bigint NOT NULL CHECK (last_number > 0)
);

WITH numbered AS (
  SELECT id, (created_at AT TIME ZONE 'Asia/Kuching')::date AS business_date,
    row_number() OVER (
      PARTITION BY (created_at AT TIME ZONE 'Asia/Kuching')::date
      ORDER BY created_at, id
    ) AS daily_number
  FROM public.orders
)
UPDATE public.orders AS orders
SET order_number = to_char(numbered.business_date, 'YYYYMMDD') || '-' ||
  lpad(numbered.daily_number::text, greatest(3, length(numbered.daily_number::text)), '0')
FROM numbered WHERE orders.id = numbered.id;

INSERT INTO public.order_sequences (business_date, last_number)
SELECT (created_at AT TIME ZONE 'Asia/Kuching')::date, count(*)
FROM public.orders GROUP BY (created_at AT TIME ZONE 'Asia/Kuching')::date;

ALTER TABLE public.orders ALTER COLUMN order_number SET NOT NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);

CREATE FUNCTION public.assign_daily_order_number() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  order_date date;
  daily_number bigint;
BEGIN
  NEW.created_at := coalesce(NEW.created_at, now());
  order_date := (NEW.created_at AT TIME ZONE 'Asia/Kuching')::date;
  -- The row lock from this upsert serializes concurrent orders for the day.
  -- Both the allocation and the order roll back together on failure.
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

CREATE TRIGGER orders_assign_daily_number
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.assign_daily_order_number();

REVOKE ALL ON TABLE public.order_sequences FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_daily_order_number() FROM PUBLIC, anon, authenticated;
