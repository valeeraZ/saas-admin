CREATE TABLE IF NOT EXISTS admin_console_sessions (
 id text PRIMARY KEY CHECK(length(id)=64),
 kind text NOT NULL CHECK(kind IN ('login','session')),
 payload text NOT NULL,
 expires_at timestamptz NOT NULL,
 last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_console_session_expiry ON admin_console_sessions(expires_at);
