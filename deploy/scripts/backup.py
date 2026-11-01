"""Back up the in-cluster PostgreSQL into a new private local directory."""

import argparse
import subprocess
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--context", required=True)
    p.add_argument("--namespace", required=True)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
    args.output.chmod(0o700)
    base = [
        "kubectl",
        "--context",
        args.context,
        "-n",
        args.namespace,
        "exec",
        "saas-postgres-0",
        "--",
    ]
    commands = [
        ("globals.sql", ["pg_dumpall", "-U", "platform_bootstrap", "--globals-only"])
    ]
    commands += [
        (name + ".dump", ["pg_dump", "-U", "platform_bootstrap", "-Fc", name])
        for name in ["saas_auth", "saas_admin", "saas_portal", "keycloak"]
    ]
    for name, command in commands:
        path = args.output / (name + ".partial")
        path.touch(mode=0o600, exist_ok=False)
        with path.open("wb") as output:
            subprocess.run(base + command, stdout=output, check=True)
        path.rename(args.output / name)
    print(
        "Backup completed. Encrypt and copy off cluster; validate restoration into an isolated database before relying on it."
    )


if __name__ == "__main__":
    main()
