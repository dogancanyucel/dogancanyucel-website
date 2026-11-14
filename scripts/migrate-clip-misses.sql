-- Run once against D1 before the missing-name report can record anything:
--   npx wrangler d1 execute exercises_db --remote --file scripts/migrate-clip-misses.sql
-- Until it exists, every report is lost: clips.js swallows the failure on purpose, so the app is
-- answered 204 either way and nothing in the response says the count went nowhere.
--
-- Why this file arrived late (2026-11-14, the full scan): the table was written into schema.sql when
-- /api/clips/missing was built, but site_visits and api_calls each got a migration file of their own and
-- this one did not — and nothing applies schema.sql to the live database. There was no way to create the
-- table short of typing the DDL by hand, and no sign anywhere that it was missing.
CREATE TABLE IF NOT EXISTS clip_misses (
    day  TEXT    NOT NULL,          -- YYYY-MM-DD, UTC
    name TEXT    NOT NULL,          -- folded: lower case, single spaces
    hits INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, name)
);
