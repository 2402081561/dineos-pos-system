ALTER TABLE restaurant_tables
  ADD COLUMN floor_zone text NOT NULL DEFAULT 'Main hall'
  CHECK (char_length(floor_zone) BETWEEN 1 AND 40 AND floor_zone = btrim(floor_zone));

DROP INDEX restaurant_tables_floor_position_unique;
CREATE UNIQUE INDEX restaurant_tables_floor_position_unique
  ON restaurant_tables (floor_zone, floor_x, floor_y)
  WHERE floor_x IS NOT NULL AND floor_y IS NOT NULL;

ALTER TABLE restaurant_tables DROP CONSTRAINT restaurant_tables_floor_position_check;
ALTER TABLE restaurant_tables ADD CONSTRAINT restaurant_tables_floor_position_check CHECK (
  (floor_x IS NULL AND floor_y IS NULL)
  OR (floor_x IS NOT NULL AND floor_y IS NOT NULL AND floor_x BETWEEN 0 AND 7 AND floor_y BETWEEN 0 AND 49)
);
