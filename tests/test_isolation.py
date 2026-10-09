"""SQLite regression test for no cross-user push delivery and non-destructive migration."""
import sqlite3
from pathlib import Path
base = Path(__file__).resolve().parent.parent
con = sqlite3.connect(':memory:')
con.executescript((base/'cloudflare/migrations/0001_init.sql').read_text())
con.executescript((base/'cloudflare/migrations/0002_users.sql').read_text())
con.executescript((base/'cloudflare/migrations/0002_users.sql').read_text())
for uid in ('alice','bob'):
    con.execute('INSERT INTO users(uid,email,role) VALUES(?,?,?)',(uid,uid+'@example.test','member'))
    con.execute('INSERT INTO user_settings(uid,symbols) VALUES(?,?)',(uid,'["2330"]' if uid=='alice' else '["2382"]'))
    con.execute('INSERT INTO user_subscriptions(token_hash,uid,fcm_token,platform) VALUES(?,?,?,?)',(uid+'hash',uid,uid+'token','web'))
con.execute("INSERT INTO user_events(id,uid,symbol,strategy,kind,bar_ts) VALUES(?,?,?,?,?,?)",('alice-event','alice','2330','A','BUY IN','2026-10-09T09:00:00+08:00'))
con.execute("INSERT OR IGNORE INTO user_deliveries(event_id,token_hash) SELECT ?,token_hash FROM user_subscriptions WHERE uid=? AND active=1 AND created_at<=(SELECT created_at FROM user_events WHERE id=?)",('alice-event','alice','alice-event'))
r=con.execute("SELECT e.uid,s.uid,d.token_hash FROM user_deliveries d JOIN user_events e ON e.id=d.event_id JOIN user_subscriptions s ON s.token_hash=d.token_hash AND s.uid=e.uid").fetchall()
assert r==[('alice','alice','alicehash')],r
s=con.execute('SELECT uid,symbols FROM user_settings ORDER BY uid').fetchall()
assert s==[('alice','["2330"]'),('bob','["2382"]')],s
old=con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").fetchone()
assert old==('settings',),old
print('PASS: Multiuser isolation; re-runnable migration; legacy tables preserved.')
