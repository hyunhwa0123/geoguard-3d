INSERT INTO restricted_zone (name, boundary, min_altitude, max_altitude, description)
VALUES
  ('Seoul Station Safety Zone', ST_GeomFromText('POLYGON((126.9700 37.5528,126.9748 37.5528,126.9748 37.5562,126.9700 37.5562,126.9700 37.5528))', 4326), 0, 150, 'Synthetic demonstration zone near Seoul Station; not an official aviation restriction.'),
  ('Yongsan Riverfront Safety Zone', ST_GeomFromText('POLYGON((126.9590 37.5230,126.9650 37.5230,126.9650 37.5270,126.9590 37.5270,126.9590 37.5230))', 4326), 30, 220, 'Synthetic demonstration zone; not an official aviation restriction.'),
  ('Namsan High Altitude Zone', ST_GeomFromText('POLYGON((126.9830 37.5480,126.9910 37.5480,126.9910 37.5540,126.9830 37.5540,126.9830 37.5480))', 4326), 100, 350, 'Synthetic high-altitude demonstration zone; not an official aviation restriction.')
ON CONFLICT (name) DO UPDATE
SET boundary = EXCLUDED.boundary,
    min_altitude = EXCLUDED.min_altitude,
    max_altitude = EXCLUDED.max_altitude,
    description = EXCLUDED.description;
