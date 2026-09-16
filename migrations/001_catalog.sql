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
CREATE TABLE IF NOT EXISTS installations (
 tenant_id uuid NOT NULL, app_id uuid NOT NULL REFERENCES app_definitions(id),
 deployment_id uuid NOT NULL, enabled boolean NOT NULL DEFAULT false,
 entitled boolean NOT NULL DEFAULT false, valid_until timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,app_id),
 FOREIGN KEY(app_id,deployment_id) REFERENCES deployments(app_id,id)
);
CREATE TABLE IF NOT EXISTS catalog_operations (
 key text PRIMARY KEY, hash text NOT NULL, actor text NOT NULL,
 body jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS installations_eligible ON installations(tenant_id,app_id) WHERE enabled AND entitled;
