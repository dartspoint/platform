#!/usr/bin/env python3
"""Create app-owned role configurations from a verified hosted build manifest."""
import json, os
from pathlib import Path
from deployment_config import *
os.umask(0o077)

def required(name):
    return scalar(os.environ.get(name, ''))

def prepare(manifest, values, root):
    env = manifest['environment']
    validate_values(env, values)
    if {k: values[k] for k in PUBLIC} != manifest['public']:
        raise ValueError('Build-time public configuration differs from deployment')
    release = root / 'releases' / identity(manifest['sha'], manifest['run'], manifest['attempt'])
    release.mkdir(mode=0o700, exist_ok=False)
    common = {'NODE_ENV':'production', 'APP_ENV':env, 'DEPLOY_ENV':env,
              'WORKER_ID':'dartspoint-'+env, 'RELEASE_SHA':manifest['sha'],
              'DATABASE_URL':values['DATABASE_URL'], 'DATABASE_CA_CERT_BASE64':values['DATABASE_CA_CERT_BASE64'],
              'REDIS_URL':'redis://redis:6379/0'}
    auth = {'NEXT_PUBLIC_SUPABASE_URL':values['NEXT_PUBLIC_SUPABASE_URL'], 'SUPABASE_SECRET_KEY':values['SUPABASE_SECRET_KEY']}
    write_env(release/'web.env', {**common, **auth, **manifest['public'], 'REALTIME_HEALTH_URL':'http://realtime:2567'})
    write_env(release/'realtime.env', {**common, **auth, 'NEXT_PUBLIC_APP_URL':values['NEXT_PUBLIC_APP_URL'], 'BIND_HOST':'0.0.0.0', 'INTERNAL_DEPLOY_TOKEN':values['INTERNAL_DEPLOY_TOKEN']})
    write_env(release/'worker.env', {**common, **auth, **{k:values[k] for k in ('NEXT_PUBLIC_APP_URL','RESEND_API_KEY','MAIL_FROM','MAIL_REPLY_TO')}})
    write_env(release/'migration.env', {'NODE_ENV':'production','APP_ENV':env,'DEPLOY_ENV':env,'MIGRATION_DATABASE_URL':values['MIGRATION_DATABASE_URL'],'DATABASE_CA_CERT_BASE64':values['DATABASE_CA_CERT_BASE64']})
    backup = {k:values[k] for k in ('RESTIC_REPOSITORY','RESTIC_PASSWORD','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_DEFAULT_REGION','BACKUP_DATABASE_URL','DATABASE_CA_CERT_BASE64')}
    backup['POSTGRES_IMAGE'] = manifest['pins']['POSTGRES_IMAGE']
    write_env(release/'backup.env', backup)
    web, realtime = ports(env)
    write_env(release/'deploy.env', {'DEPLOY_ENV':env,'RELEASE_DIR':str(release),'WEB_PORT':str(web),'REALTIME_PORT':str(realtime),'REDIS_IMAGE':manifest['pins']['REDIS_IMAGE'],**{s.upper()+'_IMAGE':manifest['images'][s] for s in SERVICES}})
    metadata = {**manifest, 'id':release.name, 'redisImage':manifest['pins']['REDIS_IMAGE']}
    (release/'release.json').write_text(json.dumps(metadata, indent=2)+'\n')
    return release
