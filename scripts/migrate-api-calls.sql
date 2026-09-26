-- Run once against D1 before the API tally can record anything:
--   npx wrangler d1 execute exercises_db --remote --file scripts/migrate-api-calls.sql
-- Until it exists, the count is lost and every route answers exactly as before.
CREATE TABLE IF NOT EXISTS api_calls (
    day     TEXT    NOT NULL,
    route   TEXT    NOT NULL,
    outcome TEXT    NOT NULL,
    hits    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, route, outcome)
);
