-- Additive v0.7.2 migration. Back up production and confirm D1 Time Travel first.
-- Existing users/settings/subscriptions/events/deliveries remain untouched.
CREATE TABLE IF NOT EXISTS user_credentials (
 uid TEXT PRIMARY KEY REFERENCES users(uid), ciphertext TEXT NOT NULL,
 iv TEXT NOT NULL, key_version TEXT NOT NULL, revision TEXT NOT NULL,
 updated_at TEXT NOT NULL, checked_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'valid', last_error TEXT
);
CREATE TABLE IF NOT EXISTS user_candles (
 uid TEXT NOT NULL, revision TEXT NOT NULL, symbol TEXT NOT NULL, ts TEXT NOT NULL,
 open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL,
 PRIMARY KEY(uid,revision,symbol,ts)
);
CREATE TABLE IF NOT EXISTS user_cache_state (
 uid TEXT NOT NULL, revision TEXT NOT NULL, symbol TEXT NOT NULL,
 last_historical_day TEXT, updated_at TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(uid,revision,symbol)
);
CREATE TABLE IF NOT EXISTS user_health (
 uid TEXT PRIMARY KEY, last_run TEXT, last_ok TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS user_rate_limits (
 uid TEXT NOT NULL, operation TEXT NOT NULL, next_at INTEGER NOT NULL,
 PRIMARY KEY(uid,operation)
);

CREATE TABLE IF NOT EXISTS monitor_cursor (
 id INTEGER PRIMARY KEY CHECK(id=1), uid TEXT NOT NULL DEFAULT '', symbol TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO monitor_cursor(id) VALUES(1);
CREATE TABLE IF NOT EXISTS user_scan_state (
 uid TEXT NOT NULL, symbol TEXT NOT NULL, bar_ts TEXT NOT NULL, settings_hash TEXT NOT NULL,
 PRIMARY KEY(uid,symbol)
);
CREATE TABLE IF NOT EXISTS user_api_budget (
 uid TEXT PRIMARY KEY, minute INTEGER NOT NULL, calls INTEGER NOT NULL
);
