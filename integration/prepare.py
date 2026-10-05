"""Create a separate Admin database on the existing disposable Portal integration Postgres."""
import os,secrets
from pathlib import Path
import psycopg
from psycopg import sql
root=Path(__file__).resolve().parents[1]
portal=Path(os.environ['PORTAL_SOURCE'])
if (root/'.env.local').exists(): raise SystemExit('Admin local config exists; reuse it.')
env=dict(line.split('=',1) for line in (portal/'.local/auth.env').read_text().splitlines())
password=secrets.token_urlsafe(32);key=secrets.token_urlsafe(32)
with psycopg.connect(env['SAAS_DATABASE_URL'],autocommit=True) as conn:
 conn.execute(sql.SQL('CREATE ROLE saas_admin LOGIN PASSWORD {}').format(sql.Literal(password)))
 conn.execute('CREATE DATABASE saas_admin OWNER saas_admin')
(root/'.env.local').write_text(f'ADMIN_DATABASE_URL=postgresql://saas_admin:{password}@127.0.0.1:55434/saas_admin\nADMIN_AUTH_URL=http://127.0.0.1:59000\nADMIN_ALLOW_LOCAL_HTTP=true\nADMIN_PORTAL_KEY={key}\nADMIN_AUTH_OPERATOR_KEY={env["SAAS_APP_OPERATOR_KEY"]}\n')
(root/'.env.local').chmod(0o600)
p=portal/'.env.local';p.write_text(p.read_text()+f'\nPORTAL_ADMIN_URL=http://127.0.0.1:59100\nPORTAL_ADMIN_KEY={key}\n')
print('Isolated Admin database and service credentials configured.')
