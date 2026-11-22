"""Deployment contract tests; use Auth's virtualenv Python (PyYAML + cryptography)."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml
from cryptography import x509

ROOT = Path(__file__).resolve().parents[2]


class DeploymentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="saas-chart-test-")
        cls.directory = Path(cls.temp.name) / "private"
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "deploy/scripts/prepare.py"),
                "--output",
                str(cls.directory),
                "--namespace",
                "saas-test",
                "--portal-host",
                "portal.example.com",
                "--console-host",
                "admin.example.com",
                "--identity-host",
                "id.example.com",
                "--app-dns-suffix",
                "apps.example.com",
                "--smtp-host",
                "smtp.example.com",
                "--smtp-from",
                "no-reply@example.com",
            ],
            check=True,
            capture_output=True,
        )
        cls.values = json.loads((cls.directory / "platform-values.json").read_text())
        for component in cls.values["workloads"].values():
            component["image"] = "registry.example.com/service@sha256:" + "a" * 64
        cls.values_file = cls.directory / "render.json"
        cls.values_file.write_text(json.dumps(cls.values))
        rendered = subprocess.check_output(
            [
                "helm",
                "template",
                "saas",
                str(ROOT / "deploy/charts/saas-platform"),
                "-n",
                "saas-test",
                "-f",
                str(cls.values_file),
            ],
            text=True,
        )
        cls.resources = list(yaml.safe_load_all(rendered))
        cls.secrets = {
            s["metadata"]["name"]: s["stringData"]
            for s in json.loads((cls.directory / "secrets.json").read_text())["items"]
        }

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_platform_ignores_legacy_auth_values(self):
        self.assertFalse((self.directory / "auth-values.json").exists())
        self.assertEqual(set(self.values["workloads"]), {"admin-api", "console", "portal"})
        rendered = subprocess.check_output(
            [
                "helm", "template", "saas", str(ROOT / "deploy/charts/saas-platform"),
                "-n", "saas-test", "-f", str(self.values_file),
                "--set-string", "workloads.auth.image=legacy,workloads.worker.image=legacy",
                "--set-string", "migrations.auth.workload=auth",
            ],
            text=True,
        )
        self.assertEqual(list(yaml.safe_load_all(rendered)), self.resources)

    def test_preflight_checks_platform_images_before_cluster_access(self):
        result = subprocess.run(
            [
                sys.executable, str(ROOT / "deploy/scripts/preflight.py"),
                "--context", "unused", "--namespace", "saas-test",
                "--values", str(self.directory / "platform-values.json"),
            ],
            capture_output=True, check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"Missing immutable image digest: admin-api", result.stderr)

    def test_credentials_are_separated_by_process(self):
        for name in [
            "saas-portal",
            "saas-admin-api",
            "saas-auth-migrate",
            "saas-admin-migrate",
            "saas-portal-migrate",
            "saas-console-prune",
        ]:
            self.assertFalse(
                any(
                    "OPERATOR_KEY" in key or "WORKER_SECRET" in key
                    for key in self.secrets[name]
                )
            )
        self.assertEqual(
            self.secrets["saas-auth"]["SAAS_APP_OPERATOR_KEY"],
            self.secrets["saas-console"]["ADMIN_AUTH_OPERATOR_KEY"],
        )
        for name in ["saas-auth", "saas-worker"]:
            self.assertEqual(
                self.secrets[name]["SAAS_OIDC_ISSUER"],
                "https://id.example.com/realms/platform",
            )
        self.assertNotEqual(
            self.secrets["saas-admin-api"]["ADMIN_DATABASE_URL"],
            self.secrets["saas-console"]["ADMIN_DATABASE_URL"],
        )
        self.assertNotEqual(
            self.secrets["saas-admin-migrate"]["ADMIN_DATABASE_URL"],
            self.secrets["saas-console"]["ADMIN_DATABASE_URL"],
        )

    def test_no_demo_users_or_password_grants(self):
        realm = json.loads((self.directory / "realm-import.json").read_text())["spec"][
            "realm"
        ]
        self.assertTrue(all(u.get("serviceAccountClientId") for u in realm["users"]))
        self.assertTrue(
            all(not c["directAccessGrantsEnabled"] for c in realm["clients"])
        )
        self.assertFalse(realm["verifyEmail"])
        self.assertTrue(realm["resetPasswordAllowed"])
        self.assertEqual(
            realm["clients"][0]["redirectUris"],
            ["https://portal.example.com/api/auth/callback"],
        )
        self.assertEqual(self.secrets["saas-console"]["ADMIN_UI_ALLOWED_SUBJECTS"], "")

    def test_private_tls_and_public_ingress_boundaries(self):
        services = [r for r in self.resources if r["kind"] == "Service"]
        for service in services:
            self.assertEqual(service["spec"]["type"], "ClusterIP")
        self.assertEqual(
            {r["metadata"]["name"] for r in self.resources if r["kind"] == "Ingress"},
            {"saas-portal", "saas-console"},
        )
        cert = x509.load_pem_x509_certificate(
            self.secrets["saas-auth-tls"]["tls.crt"].encode()
        )
        self.assertIn(
            "saas-auth.saas-test.svc.cluster.local",
            cert.extensions.get_extension_for_class(
                x509.SubjectAlternativeName
            ).value.get_values_for_type(x509.DNSName),
        )
        self.assertEqual(
            len([r for r in self.resources if r["kind"] == "NetworkPolicy"]), 1
        )

    def test_migrations_finish_before_application_rollout(self):
        jobs = [r for r in self.resources if r["kind"] == "Job"]
        self.assertEqual(len(jobs), 2)
        for job in jobs:
            self.assertEqual(
                job["metadata"]["annotations"]["helm.sh/hook"],
                "pre-install,pre-upgrade",
            )
            self.assertEqual(job["spec"]["template"]["spec"]["restartPolicy"], "Never")
            self.assertEqual(job["spec"]["activeDeadlineSeconds"], 300)

    def test_workloads_are_unprivileged_and_have_probes(self):
        for resource in self.resources:
            if resource["kind"] != "Deployment":
                continue
            pod = resource["spec"]["template"]["spec"]
            self.assertFalse(pod["automountServiceAccountToken"])
            for container in pod["containers"]:
                self.assertFalse(
                    container["securityContext"]["allowPrivilegeEscalation"]
                )
                self.assertTrue(container["securityContext"]["readOnlyRootFilesystem"])
            app = pod["containers"][0]
            self.assertIn("startupProbe", app)
            self.assertIn("readinessProbe", app)
            self.assertIn("livenessProbe", app)

    def test_unpinned_image_is_rejected(self):
        invalid = {
            **self.values,
            "workloads": {
                **self.values["workloads"],
                "portal": {"image": "portal:latest"},
            },
        }
        path = self.directory / "invalid.json"
        path.write_text(json.dumps(invalid))
        result = subprocess.run(
            [
                "helm",
                "template",
                "saas",
                str(ROOT / "deploy/charts/saas-platform"),
                "-f",
                str(path),
            ],
            capture_output=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"Images must use", result.stderr)

    def test_database_volume_is_retained(self):
        rendered = subprocess.check_output(
            [
                "helm",
                "template",
                "infra",
                str(ROOT / "deploy/charts/saas-infrastructure"),
                "-f",
                str(self.directory / "infrastructure-values.json"),
            ],
            text=True,
        )
        stateful = next(
            r for r in yaml.safe_load_all(rendered) if r["kind"] == "StatefulSet"
        )
        self.assertEqual(
            stateful["spec"]["persistentVolumeClaimRetentionPolicy"],
            {"whenDeleted": "Retain", "whenScaled": "Retain"},
        )
        self.assertTrue(stateful["spec"]["volumeClaimTemplates"])

    def test_existing_secrets_cannot_be_regenerated(self):
        result = subprocess.run(
            [
                sys.executable,
                str(ROOT / "deploy/scripts/prepare.py"),
                "--output",
                str(self.directory),
                "--namespace",
                "saas-test",
                "--portal-host",
                "portal.example.com",
                "--console-host",
                "admin.example.com",
                "--identity-host",
                "id.example.com",
                "--app-dns-suffix",
                "apps.example.com",
                "--smtp-host",
                "smtp.example.com",
                "--smtp-from",
                "no-reply@example.com",
            ],
            capture_output=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
