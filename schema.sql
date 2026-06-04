-- D1 schema for the K&P Restaurant Catalogue.
-- The API also creates this automatically on first run, but you can apply it
-- manually with:  wrangler d1 execute kp-restaurants --file=./schema.sql
CREATE TABLE IF NOT EXISTS restaurants (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  cuisine    TEXT,
  city       TEXT,
  comment    TEXT,
  visits     TEXT,            -- JSON array: [{ "label": "", "k": 9, "p": 8.5 }]
  sort       INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine ON restaurants (cuisine);
CREATE INDEX IF NOT EXISTS idx_restaurants_sort ON restaurants (sort);
