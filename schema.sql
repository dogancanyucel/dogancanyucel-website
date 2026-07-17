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