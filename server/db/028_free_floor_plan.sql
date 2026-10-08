ALTER TABLE restaurant_tables ADD COLUMN floor_point jsonb
  CHECK (floor_point IS NULL OR (
    jsonb_typeof(floor_point) = 'object'
    AND floor_point ?& ARRAY['x', 'y']
    AND jsonb_typeof(floor_point->'x') = 'number'
    AND jsonb_typeof(floor_point->'y') = 'number'
    AND floor_point->'x' >= '0'::jsonb AND floor_point->'x' <= '1060'::jsonb
    AND floor_point->'y' >= '0'::jsonb AND floor_point->'y' <= '8444'::jsonb
  ));

CREATE TABLE floor_plan_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  revision integer NOT NULL DEFAULT 0,
  markers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(markers) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO floor_plan_settings (id) VALUES (1);
ALTER TABLE floor_plan_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON floor_plan_settings FROM anon, authenticated;
