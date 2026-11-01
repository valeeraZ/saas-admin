"""Isolated real Keycloak/Postgres console browser acceptance. Use Auth virtualenv Python."""

import argparse
import base64
import json
import os
import secrets
import signal
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--auth", type=Path, required=True)
    parser.add_argument("--chromium", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(args.auth.resolve() / "scripts"))
    from local_tls import create_tls
    from realm_users import user_scopes

    docker_host = (
        os.environ.get("DOCKER_HOST") if not os.environ.get("DOCKER_CONTEXT") else None
    )
    if not docker_host:
        docker_host = subprocess.check_output(
            ["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
            text=True,
        ).strip()
    if not docker_host.startswith("unix://"):
        raise SystemExit("Local Docker context required")
    work = Path(tempfile.mkdtemp(prefix="saas-console-"))
    work.chmod(0o700)

    def port():
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]

    ports = {key: port() for key in ["db", "identity", "web"]}
    assert len(set(ports.values())) == 3
    origin = f"http://127.0.0.1:{ports['web']}"
    identity = f"https://127.0.0.1:{ports['identity']}"
    create_tls(work)
    password = secrets.token_urlsafe(32)
    database_password = secrets.token_urlsafe(32)
    secret = secrets.token_urlsafe(32)
    subject = "00000000-0000-4000-8000-000000000030"
    users = []
    for name, sub in [
        ("operator", subject),
        ("outsider", "00000000-0000-4000-8000-000000000031"),
    ]:
        users.append(
            {
                "id": sub,
                "username": name,
                "enabled": True,
                "email": name + "@example.com",
                "emailVerified": True,
                "firstName": "Local",
                "lastName": "Operator" if name == "operator" else "Outsider",
                "credentials": [
                    {"type": "password", "value": password, "temporary": False}
                ],
            }
        )
    realm = {
        "realm": "saas-console-local",
        "enabled": True,
        "sslRequired": "none",
        "clientScopes": user_scopes(),
        "clients": [
            {
                "clientId": "saas-admin-console",
                "enabled": True,
                "protocol": "openid-connect",
                "publicClient": False,
                "secret": secret,
                "standardFlowEnabled": True,
                "directAccessGrantsEnabled": False,
                "serviceAccountsEnabled": False,
                "fullScopeAllowed": False,
                "redirectUris": [origin + "/api/auth/callback"],
                "attributes": {
                    "pkce.code.challenge.method": "S256",
                    "post.logout.redirect.uris": origin
                    + "/en/login##"
                    + origin
                    + "/zh/login",
                },
                "defaultClientScopes": ["basic", "profile", "email"],
            }
        ],
        "users": users,
    }
    realm["clients"][0]["protocolMappers"] = [
        {
            "name": "console-audience",
            "protocol": "openid-connect",
            "protocolMapper": "oidc-audience-mapper",
            "config": {
                "included.client.audience": "saas-admin-console",
                "access.token.claim": "true",
                "id.token.claim": "false",
                "introspection.token.claim": "true",
            },
        }
    ]
    (work / "realm.json").write_text(json.dumps(realm))
    project = "saas-console-" + secrets.token_hex(5)
    compose_file = work / "compose.json"
    compose_file.write_text(
        json.dumps(
            {
                "services": {
                    "db": {
                        "image": "postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193",
                        "environment": {
                            "POSTGRES_USER": "console",
                            "POSTGRES_PASSWORD": database_password,
                            "POSTGRES_DB": "console",
                        },
                        "ports": [f"127.0.0.1:{ports['db']}:5432"],
                        "volumes": ["db:/var/lib/postgresql/data"],
                    },
                    "keycloak": {
                        "image": "quay.io/keycloak/keycloak:26.7.3@sha256:ff4257d0d64efbe99ed1ddfaf07765cc3c36dc7518bf8324d41961327f441c54",
                        "command": [
                            "start-dev",
                            "--import-realm",
                            "--hostname=" + identity,
                            "--https-certificate-file=/opt/keycloak/conf/tls.crt",
                            "--https-certificate-key-file=/opt/keycloak/conf/tls.key",
                        ],
                        "ports": [f"127.0.0.1:{ports['identity']}:8443"],
                        "volumes": [
                            str(work / "realm.json")
                            + ":/opt/keycloak/data/import/realm.json:ro",
                            str(work / "tls.crt") + ":/opt/keycloak/conf/tls.crt:ro",
                            str(work / "tls.key") + ":/opt/keycloak/conf/tls.key:ro",
                        ],
                    },
                },
                "volumes": {"db": {}},
            }
        )
    )
    env = {
        **os.environ,
        "ADMIN_DATABASE_URL": f"postgresql://console:{database_password}@127.0.0.1:{ports['db']}/console",
        "ADMIN_ENABLE_OPERATOR": "true",
        "ADMIN_ALLOW_LOCAL_HTTP": "true",
        "ADMIN_UI_ALLOW_LOCAL_HTTP": "true",
        "ADMIN_ALLOWED_APP_ORIGINS": "https://reports.apps.internal",
        "ADMIN_UI_ORIGIN": origin,
        "ADMIN_UI_OIDC_ISSUER": identity + "/realms/saas-console-local",
        "ADMIN_UI_OIDC_CLIENT_ID": "saas-admin-console",
        "ADMIN_UI_OIDC_CLIENT_SECRET": secret,
        "ADMIN_UI_ALLOWED_SUBJECTS": subject,
        "ADMIN_UI_SESSION_KEY": base64.b64encode(secrets.token_bytes(32)).decode(),
        "NODE_EXTRA_CA_CERTS": str(work / "tls.crt"),
        "CONSOLE_TEST_PASSWORD": password,
        "CONSOLE_TEST_KEYCLOAK": project + "-keycloak-1",
        "NEXT_TELEMETRY_DISABLED": "1",
        "CONSOLE_TEST_WORK": str(work),
    }
    if args.chromium:
        env["CONSOLE_CHROMIUM"] = str(args.chromium.resolve())
    log = (work / "execution.log").open("w")
    children = []
    compose = ["docker", "compose", "-p", project, "-f", str(compose_file)]
    result = {
        "status": "running",
        "project": project,
        "ports": ports,
        "productionDeployment": False,
    }

    def run(command, cwd=root, timeout=600):
        p = subprocess.Popen(
            command, cwd=cwd, env=env, stdout=log, stderr=log, start_new_session=True
        )
        children.append(p)
        p.wait(timeout=timeout)
        if p.returncode:
            raise RuntimeError("Acceptance command failed; inspect private log")

    def wait_identity():
        ctx = ssl.create_default_context(cafile=str(work / "tls.crt"))
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx)
        )
        for _ in range(180):
            try:
                with opener.open(
                    env["ADMIN_UI_OIDC_ISSUER"] + "/.well-known/openid-configuration",
                    timeout=2,
                ) as r:
                    if r.status == 200:
                        return
            except OSError:
                time.sleep(1)
        raise RuntimeError("Keycloak readiness timeout")

    print("Console acceptance workspace: " + str(work), flush=True)
    try:
        run(compose + ["up", "-d"], timeout=180)
        wait_identity()
        run(["node", "src/cli.ts", "migrate"])
        run(["node", "src/cli.ts", "migrate"])
        run(["npm", "run", "build"], root / "web")
        server = subprocess.Popen(
            ["npm", "run", "start", "--", "--port", str(ports["web"])],
            cwd=root / "web",
            env=env,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
        children.append(server)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for _ in range(60):
            if server.poll() is not None:
                raise RuntimeError("Console exited")
            try:
                with opener.open(origin + "/en/login", timeout=2) as r:
                    if r.status == 200:
                        break
            except OSError:
                time.sleep(1)
        else:
            raise RuntimeError("Console readiness timeout")
        run(["node", "tests/console.e2e.ts"], root / "web", timeout=360)
        result["status"] = "passed"
        print(
            "PASS real console identity, database mutations, bilingual responsive UI and failure paths",
            flush=True,
        )
    except BaseException:
        result["status"] = "failed"
        raise
    finally:
        for child in reversed(children):
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            if child.poll() is None:
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
        result["cleanupSucceeded"] = (
            subprocess.run(
                compose + ["down", "--volumes"], stdout=log, stderr=log, check=False
            ).returncode
            == 0
        )
        (work / "result.json").write_text(json.dumps(result, indent=2) + "\n")
        log.close()
        print("Result: " + str(work / "result.json"), flush=True)
        if not result["cleanupSucceeded"]:
            raise RuntimeError("Console cleanup failed")


if __name__ == "__main__":

    def interrupted(*_):
        raise KeyboardInterrupt()

    signal.signal(signal.SIGTERM, interrupted)
    main()
