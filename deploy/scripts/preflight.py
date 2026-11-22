"""Read-only target-cluster checks. Never prints Secret contents."""

import argparse
import base64
import json
import re
import subprocess
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--context", required=True)
    p.add_argument("--namespace", required=True)
    p.add_argument("--values", type=Path, required=True)
    args = p.parse_args()
    values = json.loads(args.values.read_text())
    workloads = values["workloads"]
    for name in ["admin-api", "console", "portal"]:
        if not re.fullmatch(
            r".+@sha256:[a-f0-9]{64}", workloads[name]["image"]
        ):
            raise SystemExit(f"Missing immutable image digest: {name}")
    base = [
        "kubectl",
        "--context",
        args.context,
        "--namespace",
        args.namespace,
        "--request-timeout=10s",
    ]

    def get(*command):
        return json.loads(
            subprocess.check_output(base + list(command) + ["-o", "json"])
        )

    get("get", "namespace", args.namespace)
    for crd in ["keycloaks.k8s.keycloak.org", "keycloakrealmimports.k8s.keycloak.org"]:
        get("get", "crd", crd)
    required = {
        "saas-console": [
            "ADMIN_DATABASE_URL",
            "ADMIN_AUTH_OPERATOR_KEY",
            "ADMIN_UI_SESSION_KEY",
            "ADMIN_UI_OIDC_CLIENT_SECRET",
            "ADMIN_UI_ALLOWED_SUBJECTS",
        ],
        "saas-portal": [
            "PORTAL_DATABASE_URL",
            "PORTAL_SESSION_KEY",
            "PORTAL_OIDC_CLIENT_SECRET",
            "PORTAL_ADMIN_KEY",
        ],
        "saas-admin-api": ["ADMIN_DATABASE_URL", "ADMIN_PORTAL_KEY"],
        "saas-admin-migrate": ["ADMIN_DATABASE_URL"],
        "saas-portal-migrate": ["PORTAL_DATABASE_URL"],
        "saas-console-prune": ["ADMIN_DATABASE_URL"],
        "saas-admin-api-tls": ["tls.crt", "tls.key"],
        "saas-trust": ["ca.crt", "ca-bundle.crt"],
        "saas-portal-signing": ["private.pem"],
        "saas-public-tls": ["tls.crt", "tls.key"],
    }
    for name, keys in required.items():
        data = get("get", "secret", name).get("data", {})
        if any(not data.get(key) or not base64.b64decode(data[key]) for key in keys):
            raise SystemExit(f"Missing/empty required Secret key: {name}")
    print(
        "PASS context, namespace, Keycloak CRDs, pinned images and required Secret keys (read-only)."
    )
    print(
        "Still verify DNS/TLS, operator readiness, SMTP, StorageClass, database restore and real browser acceptance."
    )


if __name__ == "__main__":
    main()
