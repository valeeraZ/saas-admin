CREATE TABLE IF NOT EXISTS deployment_routes (
 deployment_id uuid PRIMARY KEY REFERENCES deployments(id),
 target_origin text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
