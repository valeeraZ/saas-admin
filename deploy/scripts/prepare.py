"""Generate private single-cluster configuration. Requires Auth's virtualenv Python.

Never overwrites an existing directory or applies resources to a cluster.
"""

import argparse
import base64
import json
import re
import secrets
import ssl
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--namespace", required=True)
    p.add_argument("--portal-host", required=True)
    p.add_argument("--console-host", required=True)
    p.add_argument("--identity-host", required=True)
    p.add_argument("--app-dns-suffix", required=True)
    p.add_argument("--ingress-class", default="")
    p.add_argument("--database-host", help="Omit to provision in-cluster PostgreSQL")
    p.add_argument(
        "--database-ca",
        type=Path,
        help="Required root CA PEM for an external PostgreSQL server",
    )
    p.add_argument(
        "--operator-sub",
        default="",
        help="Verified stable Keycloak subject; can be set after realm bootstrap",
    )
    p.add_argument("--smtp-host", required=True)
    p.add_argument("--smtp-from", required=True)
    p.add_argument("--smtp-port", type=int, default=587)
    args = p.parse_args()
    if args.database_host and not args.database_ca:
        p.error("--database-ca required with an external database")
    dns = re.compile(r"(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?")
    for value in [
        args.namespace,
        args.portal_host,
        args.console_host,
        args.identity_host,
        args.app_dns_suffix,
        args.database_host or "saas-postgres",
    ]:
        if not dns.fullmatch(value):
            p.error("Namespace and hosts must be plain lowercase DNS names")
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", args.namespace):
        p.error("Invalid namespace")
    args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
    args.output.chmod(0o700)

    def write(name, value):
        path = args.output / name
        path.write_text(
            value if isinstance(value, str) else json.dumps(value, indent=2) + "\n"
        )
        path.chmod(0o600)

    objects = []

    def secret(name, values, kind="Opaque"):
        objects.append(
            {
                "apiVersion": "v1",
                "kind": "Secret",
                "metadata": {"name": name, "namespace": args.namespace},
                "type": kind,
                "stringData": values,
            }
        )

    def key():
        return rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def pem(private):
        return private.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode()

    now = datetime.now(timezone.utc)
    ca_key = key()
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "SaaS internal CA")])
    ca = (
        x509.CertificateBuilder()
        .subject_name(ca_name)
        .issuer_name(ca_name)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .sign(ca_key, hashes.SHA256())
    )
    ca_pem = ca.public_bytes(serialization.Encoding.PEM).decode()
    write("internal-ca.key", pem(ca_key))
    write("internal-ca.crt", ca_pem)
    # Python's SSL_CERT_FILE replaces the default bundle; preserve public roots too.
    public_roots = ssl.get_default_verify_paths().cafile
    if not public_roots:
        raise RuntimeError("System public CA bundle required")
    trust = {
        "ca.crt": ca_pem,
        "ca-bundle.crt": Path(public_roots).read_text() + "\n" + ca_pem,
    }
    if args.database_ca:
        trust["database-ca.crt"] = args.database_ca.read_text()
    secret("saas-trust", trust)
    for component in ["auth", "admin-api"]:
        hostname = f"saas-{component}.{args.namespace}.svc.cluster.local"
        private = key()
        cert = (
            x509.CertificateBuilder()
            .subject_name(
                x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, hostname)])
            )
            .issuer_name(ca.subject)
            .public_key(private.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(minutes=5))
            .not_valid_after(now + timedelta(days=90))
            .add_extension(
                x509.SubjectAlternativeName([x509.DNSName(hostname)]), critical=False
            )
            .add_extension(
                x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False
            )
            .sign(ca_key, hashes.SHA256())
        )
        secret(
            f"saas-{component}-tls",
            {
                "tls.crt": cert.public_bytes(serialization.Encoding.PEM).decode(),
                "tls.key": pem(private),
            },
            "kubernetes.io/tls",
        )
    signing = key()
    secret("saas-portal-signing", {"private.pem": pem(signing)})
    write(
        "portal-signing-public.pem",
        signing.public_key()
        .public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        )
        .decode(),
    )

    roles = [
        "saas_auth",
        "saas_portal",
        "saas_admin_migrator",
        "saas_admin_api",
        "saas_console",
        "saas_keycloak",
    ]
    passwords = {role: secrets.token_hex(32) for role in roles}
    db_host = args.database_host or f"saas-postgres.{args.namespace}.svc.cluster.local"

    def db(role, database):
        url = f"postgresql://{role}:{passwords[role]}@{db_host}:5432/{database}"
        return (
            url + "?sslmode=verify-full&sslrootcert=/run/trust/database-ca.crt"
            if args.database_host
            else url
        )

    sql = "\\set ON_ERROR_STOP on\n"
    for role in roles:
        sql += f"CREATE ROLE {role} LOGIN PASSWORD '{passwords[role]}';\n"
    for database, owner in [
        ("saas_auth", "saas_auth"),
        ("saas_portal", "saas_portal"),
        ("saas_admin", "saas_admin_migrator"),
        ("keycloak", "saas_keycloak"),
    ]:
        sql += f"CREATE DATABASE {database} OWNER {owner};\nREVOKE CONNECT ON DATABASE {database} FROM PUBLIC;\nGRANT CONNECT ON DATABASE {database} TO {owner};\n"
    sql += "GRANT CONNECT ON DATABASE saas_admin TO saas_admin_api, saas_console;\n"
    write("database-init.sql", sql)
    secret(
        "saas-postgres-bootstrap",
        {"POSTGRES_PASSWORD": secrets.token_hex(32), "init.sql": sql},
    )
    secret(
        "saas-keycloak-db",
        {"username": "saas_keycloak", "password": passwords["saas_keycloak"]},
    )
    portal_secret, console_secret, auth_secret, worker_secret = [
        secrets.token_urlsafe(32) for _ in range(4)
    ]
    operator_key, catalog_key = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    session_key = lambda: base64.b64encode(secrets.token_bytes(32)).decode()
    auth_common = {
        "SAAS_DATABASE_URL": db("saas_auth", "saas_auth"),
        "SAAS_CURSOR_SECRET": secrets.token_urlsafe(32),
        "SAAS_INTROSPECTION_SECRET": auth_secret,
        "SAAS_TASK_KEY": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
    }
    secret("saas-auth", {**auth_common, "SAAS_APP_OPERATOR_KEY": operator_key})
    secret("saas-worker", {**auth_common, "SAAS_SESSION_WORKER_SECRET": worker_secret})
    secret("saas-auth-migrate", {"SAAS_DATABASE_URL": db("saas_auth", "saas_auth")})
    secret(
        "saas-admin-api",
        {
            "ADMIN_DATABASE_URL": db("saas_admin_api", "saas_admin"),
            "ADMIN_PORTAL_KEY": catalog_key,
        },
    )
    secret(
        "saas-admin-migrate",
        {"ADMIN_DATABASE_URL": db("saas_admin_migrator", "saas_admin")},
    )
    secret(
        "saas-console-prune", {"ADMIN_DATABASE_URL": db("saas_console", "saas_admin")}
    )
    secret(
        "saas-console",
        {
            "ADMIN_DATABASE_URL": db("saas_console", "saas_admin"),
            "ADMIN_UI_OIDC_CLIENT_SECRET": console_secret,
            "ADMIN_UI_SESSION_KEY": session_key(),
            "ADMIN_AUTH_OPERATOR_KEY": operator_key,
            "ADMIN_UI_ALLOWED_SUBJECTS": args.operator_sub,
        },
    )
    secret(
        "saas-portal",
        {
            "PORTAL_DATABASE_URL": db("saas_portal", "saas_portal"),
            "PORTAL_SESSION_KEY": session_key(),
            "PORTAL_OIDC_CLIENT_SECRET": portal_secret,
            "PORTAL_ADMIN_KEY": catalog_key,
        },
    )
    secret(
        "saas-portal-migrate", {"PORTAL_DATABASE_URL": db("saas_portal", "saas_portal")}
    )
    secret(
        "saas-oidc-clients",
        {
            "PORTAL_SECRET": portal_secret,
            "CONSOLE_SECRET": console_secret,
            "AUTH_SECRET": auth_secret,
            "WORKER_SECRET": worker_secret,
            "SMTP_USER": "",
            "SMTP_PASSWORD": "",
        },
    )
    write("secrets.json", {"apiVersion": "v1", "kind": "List", "items": objects})

    def audience(client):
        return {
            "name": client + "-audience",
            "protocol": "openid-connect",
            "protocolMapper": "oidc-audience-mapper",
            "config": {
                "included.custom.audience": client,
                "access.token.claim": "true",
                "id.token.claim": "false",
            },
        }

    def client(name, placeholder, origin=None, target=None):
        return {
            "clientId": name,
            "enabled": True,
            "protocol": "openid-connect",
            "publicClient": False,
            "secret": "${" + placeholder + "}",
            "standardFlowEnabled": bool(origin),
            "directAccessGrantsEnabled": False,
            "serviceAccountsEnabled": name == "saas-session-worker",
            "fullScopeAllowed": name == "saas-session-worker",
            "redirectUris": [origin + "/api/auth/callback"] if origin else [],
            "attributes": {
                "pkce.code.challenge.method": "S256",
                "standard.token.exchange.enabled": "true"
                if name == "saas-portal"
                else "false",
                "post.logout.redirect.uris": origin + "/*" if origin else "",
            },
            "defaultClientScopes": ["basic", "profile", "email"] if origin else [],
            "protocolMappers": [audience(target)] if target else [],
        }

    portal_origin, console_origin = (
        "https://" + args.portal_host,
        "https://" + args.console_host,
    )
    issuer = "https://" + args.identity_host + "/realms/platform"
    realm = {
        "realm": "platform",
        "enabled": True,
        "sslRequired": "external",
        "registrationAllowed": True,
        "verifyEmail": True,
        "resetPasswordAllowed": True,
        "bruteForceProtected": True,
        "accessTokenLifespan": 300,
        "ssoSessionIdleTimeout": 1800,
        "ssoSessionMaxLifespan": 28800,
        "clients": [
            client("saas-portal", "PORTAL_SECRET", portal_origin, "saas-auth"),
            client(
                "saas-admin-console",
                "CONSOLE_SECRET",
                console_origin,
                "saas-admin-console",
            ),
            client("saas-auth", "AUTH_SECRET"),
            client("saas-session-worker", "WORKER_SECRET"),
        ],
        "users": [
            {
                "username": "service-account-saas-session-worker",
                "enabled": True,
                "serviceAccountClientId": "saas-session-worker",
                "clientRoles": {"realm-management": ["manage-users"]},
            }
        ],
        "smtpServer": {
            "host": args.smtp_host,
            "port": str(args.smtp_port),
            "from": args.smtp_from,
            "auth": "true",
            "starttls": "true",
            "user": "${SMTP_USER}",
            "password": "${SMTP_PASSWORD}",
        },
    }
    realm["clients"][-1]["protocolMappers"] = [
        {
            "name": "session-permission",
            "protocol": "openid-connect",
            "protocolMapper": "oidc-usermodel-client-role-mapper",
            "config": {
                "usermodel.clientRoleMapping.clientId": "realm-management",
                "claim.name": "resource_access.realm-management.roles",
                "jsonType.label": "String",
                "multivalued": "true",
                "access.token.claim": "true",
            },
        }
    ]
    write(
        "realm-import.json",
        {
            "apiVersion": "k8s.keycloak.org/v2beta1",
            "kind": "KeycloakRealmImport",
            "metadata": {"name": "saas-platform-realm", "namespace": args.namespace},
            "spec": {
                "keycloakCRName": "saas-keycloak",
                "placeholders": {
                    name: {"secret": {"name": "saas-oidc-clients", "key": name}}
                    for name in [
                        "PORTAL_SECRET",
                        "CONSOLE_SECRET",
                        "AUTH_SECRET",
                        "WORKER_SECRET",
                        "SMTP_USER",
                        "SMTP_PASSWORD",
                    ]
                },
                "realm": realm,
            },
        },
    )
    auth_env = {
        "SAAS_OIDC_ISSUER": issuer,
        "SAAS_USER_CLIENTS": "saas-portal",
        "SAAS_INTROSPECTION_CLIENT": "saas-auth",
    }
    auth_url = f"https://saas-auth.{args.namespace}.svc.cluster.local"
    admin_url = f"https://saas-admin-api.{args.namespace}.svc.cluster.local"
    workloads = {
        name: {"image": ""}
        for name in ["auth", "worker", "admin-api", "console", "portal"]
    }
    workloads["auth"]["env"] = auth_env
    workloads["worker"]["env"] = {
        **auth_env,
        "SAAS_SESSION_WORKER_CLIENT": "saas-session-worker",
    }
    workloads["admin-api"]["env"] = {"ADMIN_AUTH_URL": auth_url}
    workloads["console"]["env"] = {
        "ADMIN_AUTH_URL": auth_url,
        "ADMIN_ENABLE_OPERATOR": "true",
        "ADMIN_UI_ORIGIN": console_origin,
        "ADMIN_UI_OIDC_ISSUER": issuer,
        "ADMIN_UI_OIDC_CLIENT_ID": "saas-admin-console",
        "ADMIN_APP_DNS_SUFFIXES": args.app_dns_suffix,
    }
    workloads["portal"]["env"] = {
        "PORTAL_ORIGIN": portal_origin,
        "PORTAL_OIDC_ISSUER": issuer,
        "PORTAL_OIDC_CLIENT_ID": "saas-portal",
        "PORTAL_AUTH_URL": auth_url,
        "PORTAL_ADMIN_URL": admin_url,
        "PORTAL_REGISTRY_MODE": "admin",
        "PORTAL_APP_DNS_SUFFIXES": args.app_dns_suffix,
        "PORTAL_APP_SIGNING_KEY_FILE": "/run/signing/private.pem",
        "PORTAL_APP_KEY_ID": "portal-1",
    }
    write(
        "platform-values.json",
        {
            "workloads": workloads,
            "ingress": {
                "portalHost": args.portal_host,
                "consoleHost": args.console_host,
                "className": args.ingress_class,
            },
        },
    )
    write(
        "infrastructure-values.json",
        {
            "postgres": {"enabled": not bool(args.database_host)},
            "keycloak": {
                "hostname": args.identity_host,
                "databaseHost": db_host,
                "databaseTls": bool(args.database_host),
                "ingressClassName": args.ingress_class,
            },
        },
    )
    print(
        "Prepared private configuration; no resources applied. Supply image digests, public TLS, SMTP credentials and verified operator subjects before deployment."
    )


if __name__ == "__main__":
    main()
