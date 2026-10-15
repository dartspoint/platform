"""Shared, strictly validated deployment contract. Never evaluate configuration as code."""
import json, os, re, ssl, base64
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qs, parse_qsl, urlencode, unquote

ROOT = Path('/srv/dartspoint')
CONFIG = Path('/etc/dartspoint')
MANAGED = Path('/usr/local/libexec/dartspoint')
SPOOL = Path('/var/lib/dartspoint-delivery')
REPOSITORY = 'dartspoint/platform'
SERVICES = ('web', 'realtime', 'worker')
PUBLIC = ('NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_REALTIME_URL', 'NEXT_PUBLIC_SUPABASE_URL',
          'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY')
OPTIONAL_SECRETS = ('TURNSTILE_SECRET_KEY', 'RESEND_WEBHOOK_SECRET')
SECRETS = ('SUPABASE_SECRET_KEY', 'DATABASE_URL',
           'RESEND_API_KEY', 'INTERNAL_DEPLOY_TOKEN', 'RESTIC_PASSWORD', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY') + OPTIONAL_SECRETS
PRIVATE_FIELDS = SECRETS + ('MIGRATION_DATABASE_URL', 'BACKUP_DATABASE_URL')
VARIABLES = PUBLIC + ('MAIL_FROM', 'MAIL_REPLY_TO', 'RESTIC_REPOSITORY', 'AWS_DEFAULT_REGION')
OPTIONAL = ('DATABASE_CA_CERT_BASE64', 'LANDING_ORIGIN', 'SUPPORT_INBOUND_ADDRESS', 'SUPPORT_RESEND_DOMAIN_ID', 'GOOGLE_AUTH_ENABLED')

def environment(value):
    if value not in ('staging', 'production'): raise ValueError('Invalid environment')
    return value

def ports(env):
    return (3001, 2568) if environment(env) == 'staging' else (3000, 2567)

def scalar(value):
    if not isinstance(value, str) or not value or len(value) > 16384 or any(c in value for c in '\r\n\0') or value.startswith(('REPLACE_', '<')):
        raise ValueError('Missing or invalid configuration value')
    return value

def identity(sha, run, attempt):
    if not all(isinstance(value,str) for value in (sha,run,attempt)) or not re.fullmatch('[0-9a-f]{40}', sha) or not re.fullmatch('[1-9][0-9]{0,19}', run) or not re.fullmatch('[1-9][0-9]{0,5}', attempt):
        raise ValueError('Invalid release identity')
    return f'{sha}-{run}-{attempt}'

def validate_supabase_url(value):
    try:
        p = urlsplit(value)
        valid = p.scheme == 'https' and re.fullmatch(r'[a-z0-9]{20}\.supabase\.co', p.hostname or '') and p.port is None and p.username is None and p.password is None and p.path in ('', '/') and not p.query and not p.fragment
    except Exception: valid = False
    if not valid: raise ValueError('Supabase URL must be the bare project HTTPS origin')

def validate_database_url(name, value):
    try:
        p = urlsplit(value); _ = p.port
        q = parse_qs(p.query, keep_blank_values=True, strict_parsing=True)
        valid = p.scheme in ('postgres','postgresql') and p.hostname and p.username and p.password and p.port in (None,5432) and p.path == '/postgres' and not p.fragment and q.get('sslmode') in (['require'], ['verify-full']) and all(not k.startswith('ssl') or k == 'sslmode' for k in q)
    except Exception: valid = False
    if not valid: raise ValueError(f'{name} must use exactly one required TLS mode and the reviewed CA configuration')

def normalize_database_url(value):
    """Use one Supabase login over a verified direct/session connection."""
    try:
        p = urlsplit(scalar(value))
        query = parse_qsl(p.query, keep_blank_values=True, strict_parsing=True)
        modes = [v for k,v in query if k == 'sslmode']
        if len(modes) > 1 or modes and modes[0] not in ('require', 'verify-full'):
            raise ValueError()
        netloc = p.netloc
        if p.port == 6543 and ((p.hostname or '').endswith('.pooler.supabase.com') or re.fullmatch(r'db\.[a-z0-9]{20}\.supabase\.co', p.hostname or '')):
            netloc = netloc.rsplit(':',1)[0] + ':5432'
        query = [(k,v) for k,v in query if k != 'sslmode'] + [('sslmode','verify-full')]
        normalized = urlunsplit((p.scheme,netloc,p.path,urlencode(query),p.fragment))
    except Exception:
        raise ValueError('DATABASE_URL must be a valid Supabase connection with verified TLS') from None
    validate_database_url('DATABASE_URL',normalized)
    return normalized

def validate_public(env, values):
    values = {k: scalar(values[k]) for k in PUBLIC}
    host = 'staging.dartspoint.nl' if environment(env) == 'staging' else 'dartspoint.nl'
    if values['NEXT_PUBLIC_APP_URL'] != 'https://' + host or values['NEXT_PUBLIC_REALTIME_URL'] != 'https://realtime.' + host:
        raise ValueError('Origins do not match environment')
    validate_supabase_url(values['NEXT_PUBLIC_SUPABASE_URL'])
    if not re.fullmatch(r'sb_publishable_[A-Za-z0-9_-]+', values['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']):
        raise ValueError('Only a public Supabase publishable key is allowed')
    return values

def validate_backup(values):
    try:
        repository = scalar(values['RESTIC_REPOSITORY'])
        p = urlsplit(repository[3:])
        region = scalar(values['AWS_DEFAULT_REGION'])
        valid = repository.startswith('s3:https://') and p.hostname == f'{region}.your-objectstorage.com' and region in ('fsn1', 'nbg1', 'hel1') and p.port is None and p.username is None and p.password is None and not p.query and not p.fragment and re.fullmatch(r'/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9](?:/[A-Za-z0-9_-]+)*', p.path)
    except Exception: valid = False
    if not valid: raise ValueError('Use the private Hetzner S3 bucket HTTPS endpoint and matching region')

def validate_values(env, values):
    if set(values) != set(SECRETS + VARIABLES + OPTIONAL): raise ValueError('Unexpected or missing configuration fields')
    for k in SECRETS + VARIABLES:
        if k in OPTIONAL_SECRETS and not values[k] and env == 'staging': continue
        try: scalar(values[k])
        except ValueError: raise ValueError(k + ' is missing or invalid') from None
    values = {**values, 'DATABASE_URL':normalize_database_url(values['DATABASE_URL'])}
    validate_public(env, values); validate_backup(values)
    if not values['SUPABASE_SECRET_KEY'].startswith('sb_secret_'): raise ValueError('Server Supabase secret required')
    if not re.fullmatch('[A-Za-z0-9_-]{43,}', values['INTERNAL_DEPLOY_TOKEN']): raise ValueError('Deploy token needs 32 random bytes encoded base64url')
    project = urlsplit(values['NEXT_PUBLIC_SUPABASE_URL']).hostname.split('.')[0]
    database = urlsplit(values['DATABASE_URL'])
    if database.hostname != 'db.'+project+'.supabase.co' and not (database.hostname.endswith('.pooler.supabase.com') and unquote(database.username).endswith('.'+project)):
        raise ValueError('Database connection does not belong to this Supabase project')
    ca = values['DATABASE_CA_CERT_BASE64']
    if ca:
        try: ssl.PEM_cert_to_DER_cert(base64.b64decode(scalar(ca), validate=True).decode('ascii'))
        except Exception: raise ValueError('Invalid database CA certificate')
    landing = values['LANDING_ORIGIN']
    if landing:
        try:
            p = urlsplit(scalar(landing))
            valid = env == 'staging' and p.scheme == 'https' and re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.dartspoint\.nl', p.hostname or '') and p.hostname not in ('staging.dartspoint.nl','realtime.staging.dartspoint.nl') and p.port is None and p.username is None and p.password is None and not p.path and not p.query and not p.fragment
        except Exception: valid = False
        if not valid: raise ValueError('LANDING_ORIGIN must be a separate explicit staging landing HTTPS origin')
    for name in OPTIONAL_SECRETS:
        if values[name]: scalar(values[name])
    if values['RESEND_WEBHOOK_SECRET'] and not re.fullmatch(r'whsec_[A-Za-z0-9+/=_-]{20,}', values['RESEND_WEBHOOK_SECRET']): raise ValueError('Invalid Resend webhook signing secret')
    if values['SUPPORT_INBOUND_ADDRESS'] and not re.fullmatch(r'[a-z0-9._+-]+@[a-z0-9.-]+\.dartspoint\.nl', values['SUPPORT_INBOUND_ADDRESS']): raise ValueError('Support receiving address must use a dedicated DartsPoint subdomain')
    if values['SUPPORT_RESEND_DOMAIN_ID'] and not re.fullmatch(r'[A-Za-z0-9-]{1,100}', values['SUPPORT_RESEND_DOMAIN_ID']): raise ValueError('Invalid support sending domain identifier')
    if values['GOOGLE_AUTH_ENABLED'] not in ('', 'true', 'false'): raise ValueError('GOOGLE_AUTH_ENABLED must be true or false')
    if env == 'production' and (not values['SUPPORT_INBOUND_ADDRESS'] or not values['SUPPORT_RESEND_DOMAIN_ID']): raise ValueError('Production support receiving and sending must be configured')
    return values

def validate_manifest(m, env, pins):
    if not isinstance(m, dict) or set(m) != {'version','environment','sha','run','attempt','repository','workflow','platform','public','pins','images','builtAt'}:
        raise ValueError('Invalid manifest fields')
    identity(m['sha'], m['run'], m['attempt'])
    if type(m['version']) is not int or m['version'] != 1 or m['environment'] != environment(env) or m['repository'] != REPOSITORY or m['workflow'] != '.github/workflows/deploy.yml' or m['platform'] != 'linux/amd64' or m['pins'] != pins:
        raise ValueError('Wrong environment, repository, build origin or reviewed image pins')
    validate_public(env, m['public'])
    if set(m['public']) != set(PUBLIC) or set(m['images']) != set(SERVICES): raise ValueError('Unexpected manifest values')
    for service in SERVICES:
        if not re.fullmatch(r'ghcr\.io/dartspoint/platform-' + env + '-' + service + r'@sha256:[0-9a-f]{64}', m['images'][service]):
            raise ValueError('Image digest or registry is not allowed')
    return m

def write_env(path, values):
    with Path(path).open('x', encoding='utf-8') as f:
        for k, v in values.items():
            if not re.fullmatch('[A-Z][A-Z0-9_]*', k) or not isinstance(v, str) or any(c in v for c in '\r\n\0'): raise ValueError('Invalid raw environment serialization')
            f.write(f'{k}={v}\n')
    Path(path).chmod(0o600)

def read_env(path):
    p = Path(path)
    if p.is_symlink() or p.stat().st_mode & 0o077: raise ValueError('Private environment file required')
    pairs = [line.split('=',1) for line in p.read_text().splitlines()]
    if any(len(x)!=2 for x in pairs) or len(dict(pairs)) != len(pairs): raise ValueError('Invalid environment file')
    return dict(pairs)
