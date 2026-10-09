-- v0.7.1 multi-user migration. Leave 0001_init.sql and all old tables intact.
-- Run ONCE on the existing taiwan-stock-lab-db database.
CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS invites (
  email TEXT PRIMARY KEY,
  invited_by TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_settings (
  uid TEXT PRIMARY KEY REFERENCES users(uid),
  symbols TEXT NOT NULL DEFAULT '[]',
  flags TEXT NOT NULL DEFAULT '{"BUY IN":true,"SELL IN":true,"PROFIT OUT":true,"FAIL OUT":true}',
  volume_ratio REAL NOT NULL DEFAULT 1.2,
  strategies TEXT NOT NULL DEFAULT '["A","B"]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_subscriptions (
  token_hash TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid),
  fcm_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android','web')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS user_subscriptions_uid ON user_subscriptions(uid,active);
CREATE TABLE IF NOT EXISTS user_events (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid),
  symbol TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('A','B')),
  kind TEXT NOT NULL,
  bar_ts TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(uid,symbol,strategy,kind,bar_ts)
);
CREATE INDEX IF NOT EXISTS user_events_created ON user_events(created_at);
CREATE TABLE IF NOT EXISTS user_deliveries (
  event_id TEXT NOT NULL REFERENCES user_events(id),
  token_hash TEXT NOT NULL REFERENCES user_subscriptions(token_hash),
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER,
  sent_at TEXT,
  last_error TEXT,
  PRIMARY KEY(event_id,token_hash)
);
