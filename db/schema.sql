-- Simple relational schema for the fishing log.
-- All measurements are metric: weight in kilograms, length in centimeters.

CREATE TABLE IF NOT EXISTS species (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS locations (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS catches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  species_id  INTEGER NOT NULL REFERENCES species(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  date        TEXT NOT NULL,       -- ISO 8601, e.g. 2026-07-18
  weight_kg   REAL,                -- kilograms
  length_cm   REAL,                -- centimeters
  bait        TEXT,
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_catches_species  ON catches(species_id);
CREATE INDEX IF NOT EXISTS idx_catches_location ON catches(location_id);
CREATE INDEX IF NOT EXISTS idx_catches_date     ON catches(date);
