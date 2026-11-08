-- Opt-in devices only. No historical orders are backfilled, and no order,
-- payment or customer record is rewritten. Independent of deferred 032/033.
CREATE TABLE order_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  language text NOT NULL DEFAULT 'zh' CHECK (language IN ('zh','en')),
  enabled boolean NOT NULL DEFAULT true,
  generation integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
  last_test_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,device_id)
);
CREATE TABLE order_push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES order_push_subscriptions(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','accepted','expired','failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id,order_id)
);
CREATE INDEX order_push_due_idx ON order_push_deliveries(next_attempt_at) WHERE status IN ('pending','sending');
CREATE INDEX order_push_active_devices_idx ON order_push_subscriptions(user_id) WHERE enabled;
ALTER TABLE order_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON order_push_subscriptions,order_push_deliveries FROM anon,authenticated;

CREATE FUNCTION enqueue_takeaway_push() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  -- The queue commits/rolls back WITH the order. A duplicate HTTP request
  -- returns the same order and cannot create another notification job.
  IF NEW.order_type IN ('take_away','mixed') AND NEW.status='received' THEN
    INSERT INTO public.order_push_deliveries(subscription_id,generation,order_id)
    SELECT s.id,s.generation,NEW.id FROM public.order_push_subscriptions s
    JOIN public.users u ON u.id=s.user_id
    WHERE s.enabled AND s.expires_at>now() AND u.role IN ('admin','cashier');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER orders_enqueue_takeaway_push AFTER INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION enqueue_takeaway_push();
REVOKE ALL ON FUNCTION enqueue_takeaway_push() FROM PUBLIC,anon,authenticated;
