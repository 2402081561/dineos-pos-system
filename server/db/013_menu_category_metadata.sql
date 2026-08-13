ALTER TABLE categories ADD COLUMN icon text NOT NULL DEFAULT '';
ALTER TABLE menu_items ADD COLUMN ingredients jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE menu_items ADD COLUMN allergy_information jsonb NOT NULL DEFAULT '[]'::jsonb;
