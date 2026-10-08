ALTER TABLE restaurant_tables
  ADD COLUMN floor_style jsonb NOT NULL DEFAULT '{"shape":"square","size":"medium","orientation":"horizontal"}'::jsonb,
  ADD CONSTRAINT restaurant_tables_floor_style_check CHECK (
    jsonb_typeof(floor_style) = 'object'
    AND floor_style ?& ARRAY['shape', 'size', 'orientation']
    AND floor_style->>'shape' IN ('round', 'square', 'rectangle')
    AND floor_style->>'size' IN ('small', 'medium', 'large')
    AND floor_style->>'orientation' IN ('horizontal', 'vertical')
  );
