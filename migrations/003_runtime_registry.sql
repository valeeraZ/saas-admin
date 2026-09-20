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
