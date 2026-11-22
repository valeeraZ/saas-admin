-- Up Migration

CREATE TABLE IF NOT EXISTS app_definitions (
 id uuid PRIMARY KEY, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 description text NOT NULL CHECK(length(description)<=1000), suffix text NOT NULL UNIQUE,
 active boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS deployments (
 id uuid PRIMARY KEY, app_id uuid NOT NULL REFERENCES app_definitions(id),
 digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
 reviewer text NOT NULL CHECK(length(reviewer)>0), reviewed_at timestamptz NOT NULL DEFAULT now(),
 ready boolean NOT NULL DEFAULT false, UNIQUE(app_id,digest), UNIQUE(app_id,id)
);
CREATE TABLE IF NOT EXISTS catalog_operations (
 key text PRIMARY KEY, hash text NOT NULL, actor text NOT NULL,
 body jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deployment_routes (
 deployment_id uuid PRIMARY KEY REFERENCES deployments(id),
 target_origin text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime_deployments (
 deployment_id uuid PRIMARY KEY REFERENCES deployments(id),
 app_id uuid NOT NULL REFERENCES app_definitions(id),
 mount text NOT NULL,
 runtime text NOT NULL CHECK(runtime IN ('http','nextjs')),
 asset_version text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','retired','revoked')),
 assets_until timestamptz,
 FOREIGN KEY(app_id,deployment_id) REFERENCES deployments(app_id,id),
 UNIQUE(mount,asset_version),
 CHECK((runtime='http' AND asset_version IS NULL) OR
       (runtime='nextjs' AND asset_version IS NOT NULL AND asset_version ~ '^[a-zA-Z0-9-]{1,80}$')),
 CHECK((status='retired' AND assets_until IS NOT NULL) OR (status<>'retired' AND assets_until IS NULL))
);

CREATE TABLE IF NOT EXISTS admin_console_sessions (
 id text PRIMARY KEY CHECK(length(id)=64),
 kind text NOT NULL CHECK(kind IN ('login','session')),
 payload text NOT NULL,
 expires_at timestamptz NOT NULL,
 last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_console_session_expiry ON admin_console_sessions(expires_at);

CREATE TABLE IF NOT EXISTS app_publications (
 app_id uuid PRIMARY KEY REFERENCES app_definitions(id),
 deployment_id uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT false, entitled boolean NOT NULL DEFAULT false,
 valid_until timestamptz NOT NULL,
 FOREIGN KEY(app_id,deployment_id) REFERENCES deployments(app_id,id)
);

-- Preserve historical tenant installations when upgrading an existing database.
DO $$
BEGIN
  IF to_regclass('public.installations') IS NOT NULL THEN
    CREATE SCHEMA IF NOT EXISTS legacy_tenancy;
    REVOKE ALL ON SCHEMA legacy_tenancy FROM PUBLIC;
    ALTER TABLE public.installations SET SCHEMA legacy_tenancy;
  END IF;
END
$$;
