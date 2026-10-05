-- Single-store settings. Browsers must use the role-checked Node API.
CREATE TABLE shop_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL DEFAULT 'DineOS'
    CHECK (char_length(name) BETWEEN 1 AND 80 AND name = btrim(name) AND name !~ '[[:cntrl:]]'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO shop_settings (id, name) VALUES (1, 'DineOS');
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shop_settings FROM anon, authenticated;

-- New receipts retain the store name at payment time. Existing receipts remain
-- unchanged and use the current name when they have no historical snapshot.
ALTER TABLE payments ADD COLUMN restaurant_name text
  CHECK (restaurant_name IS NULL OR char_length(restaurant_name) BETWEEN 1 AND 80);
