-- Old installations are historical evidence, never automatically globalized.
CREATE SCHEMA IF NOT EXISTS legacy_tenancy;
REVOKE ALL ON SCHEMA legacy_tenancy FROM PUBLIC;
DO $$ BEGIN
 IF to_regclass('public.installations') IS NOT NULL THEN
   ALTER TABLE public.installations SET SCHEMA legacy_tenancy;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS app_publications (
 app_id uuid PRIMARY KEY REFERENCES app_definitions(id),
 deployment_id uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT false, entitled boolean NOT NULL DEFAULT false,
 valid_until timestamptz NOT NULL,
 FOREIGN KEY(app_id,deployment_id) REFERENCES deployments(app_id,id)
);
