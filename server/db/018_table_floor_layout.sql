ALTER TABLE restaurant_tables
  ADD COLUMN floor_x integer,
  ADD COLUMN floor_y integer;

ALTER TABLE restaurant_tables
  ADD CONSTRAINT restaurant_tables_floor_position_check CHECK (
    (floor_x IS NULL AND floor_y IS NULL)
    OR (floor_x BETWEEN 0 AND 7 AND floor_y BETWEEN 0 AND 49)
  );

CREATE UNIQUE INDEX restaurant_tables_floor_position_unique
  ON restaurant_tables (floor_x, floor_y)
  WHERE floor_x IS NOT NULL AND floor_y IS NOT NULL;
