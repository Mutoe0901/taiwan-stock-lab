-- Admin-only Worker test push throttle; no changes to user_events or user_deliveries.
CREATE TABLE IF NOT EXISTS push_test_requests (
  uid TEXT PRIMARY KEY REFERENCES users(uid),
  last_attempt_ms INTEGER NOT NULL
);
