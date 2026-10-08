-- Older deployed APIs do not supply an item-level type. Inherit their ticket
-- type instead of silently changing a take-away item to dine-in during rollout.
ALTER TABLE public.order_items ALTER COLUMN order_type DROP DEFAULT;

CREATE FUNCTION public.default_item_order_type() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.order_type IS NULL THEN
    NEW.order_type := COALESCE((SELECT CASE WHEN orders.order_type = 'take_away'
      THEN 'take_away' ELSE 'dine_in' END FROM public.orders WHERE orders.id = NEW.order_id), 'dine_in');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.default_item_order_type() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER default_item_order_type BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.default_item_order_type();

-- Repair only legacy, whole-ticket take-away rows written during the rollout.
UPDATE public.order_items SET order_type = 'take_away'
  FROM public.orders WHERE orders.id = order_items.order_id
    AND orders.order_type = 'take_away' AND order_items.order_type = 'dine_in';
