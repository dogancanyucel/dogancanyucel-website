-- Run once against D1 before the visit tally can record anything:
--   npx wrangler d1 execute exercises_db --remote --file scripts/migrate-site-visits.sql
-- Until it exists, index.js swallows the failed write and still serves the page.
CREATE TABLE IF NOT EXISTS site_visits (
    day     TEXT    NOT NULL,
    country TEXT    NOT NULL,
    city    TEXT    NOT NULL DEFAULT '',
    hits    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, country, city)
);
