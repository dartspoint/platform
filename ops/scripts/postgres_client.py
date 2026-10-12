"""Bounded libpq client with explicit hostname verification and mounted host CA trust."""
import base64, os, re
from pathlib import Path
from urllib.parse import urlsplit, unquote
from deployment_config import validate_database_url

def client(values, folder, database_key='BACKUP_DATABASE_URL'):
    validate_database_url(database_key,values[database_key])
    if not re.fullmatch(r'[a-zA-Z0-9./:_-]+@sha256:[0-9a-f]{64}',values['POSTGRES_IMAGE']):raise ValueError('Pinned PostgreSQL client image required')
    p=urlsplit(values[database_key])
    system=Path('/etc/ssl/certs/ca-certificates.crt')
    trust=system.read_bytes() if system.is_file() else b''
    if values.get('DATABASE_CA_CERT_BASE64'):trust+=b'\n'+base64.b64decode(values['DATABASE_CA_CERT_BASE64'],validate=True)
    if not trust:raise ValueError('Provision a trusted host CA bundle or provider CA')
    certificate=Path(folder)/'database-ca.crt';certificate.write_bytes(trust);certificate.chmod(0o644)
    env={**os.environ,'PGHOST':p.hostname,'PGPORT':str(p.port or 5432),'PGUSER':unquote(p.username),'PGPASSWORD':unquote(p.password),'PGDATABASE':p.path[1:],'PGSSLMODE':'verify-full','PGSSLROOTCERT':'/tmp/database-ca.crt'}
    args=['docker','run','--rm','--cpus','0.5','--memory','256m','--pids-limit','128',
          *[x for key in ('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE','PGSSLROOTCERT') for x in ('--env',key)],
          '--mount','type=bind,source='+str(certificate)+',target=/tmp/database-ca.crt,readonly',values['POSTGRES_IMAGE']]
    return args,env
