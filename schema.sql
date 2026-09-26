DROP TABLE IF EXISTS exercises;
CREATE TABLE exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target TEXT,
    bodyPart TEXT,
    equipment TEXT,
    gifUrl TEXT,
    instructions TEXT 
);

CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Slim NIH DSLD supplement labels (built via scripts/etl-dsld.mjs)
CREATE TABLE IF NOT EXISTS supplements (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT,
    serving TEXT,
    calories INTEGER NOT NULL DEFAULT 0,
    protein REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0,
    ingredients TEXT,
    off_market INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_supplements_name ON supplements(name);
CREATE INDEX IF NOT EXISTS idx_supplements_brand ON supplements(brand);
-- Where the website is read from (owner, 2026-09-26). A tally, not a trail: one row
-- per day per city, holding a count. No address, no user agent, no path, no time of
-- day, nothing that joins two requests. Pages only — /api/* is the apps and is never
-- counted, because recording where those calls come from would be collecting a new
-- kind of data about app users. See countsAsVisit/recordVisit in index.js.
CREATE TABLE IF NOT EXISTS site_visits (
    day     TEXT    NOT NULL,          -- YYYY-MM-DD, UTC
    country TEXT    NOT NULL,          -- ISO 3166-1 alpha-2, "??" when unknown
    city    TEXT    NOT NULL DEFAULT '',
    hits    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, country, city)
);

-- How hard the API is being pulled (owner, 2026-09-26). How much, never who: day,
-- route, outcome, count. The "rejected" rows are the signal — the apps hold a valid
-- key, so requests without one are somebody trying the door. No address and nothing
-- standing in for one, because those callers are people using the app.
CREATE TABLE IF NOT EXISTS api_calls (
    day     TEXT    NOT NULL,          -- YYYY-MM-DD, UTC
    route   TEXT    NOT NULL,          -- exercises, supplements, feedback, ...
    outcome TEXT    NOT NULL,          -- ok | rejected | refused | error
    hits    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, route, outcome)
);
