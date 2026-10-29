-- Internal aliases only; existing menu names, orders and receipt snapshots stay intact.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS kitchen_name text NOT NULL DEFAULT '';
ALTER TABLE menu_items ADD CONSTRAINT menu_items_kitchen_name_length CHECK (char_length(kitchen_name) <= 40);
