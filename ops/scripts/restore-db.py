#!/usr/bin/env python3
"""Restore a real application/auth dump into an isolated, disposable PostgreSQL."""
import json, re, secrets, subprocess, sys, time
from pathlib import Path

def run(args, data=None):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        log=Path('artifacts/restore-private.log');log.parent.mkdir(exist_ok=True);log.write_bytes(result.stderr);log.chmod(0o600)
        raise RuntimeError('Restore operation failed; inspect private diagnostics')
    return result.stdout

def restore(dump, image, required_extensions=None):
    if not re.fullmatch(r'[a-zA-Z0-9./:_-]+@sha256:[0-9a-f]{64}', image):
        raise ValueError('Restore PostgreSQL image must be pinned by digest')
    required_extensions=required_extensions or []
    if not isinstance(required_extensions,list):raise ValueError('Invalid extension metadata')
    seen=set()
    for extension in required_extensions:
        if (not isinstance(extension,dict) or set(extension)!= {'name','schema','version'} or extension['name'] not in ('pgcrypto','citext','uuid-ossp') or extension['schema'] not in ('public','extensions') or not re.fullmatch(r'[0-9]+(?:\.[0-9]+){1,2}',extension['version']) or extension['name'] in seen):
            raise ValueError('Unsupported extension metadata; explicit restore review required')
        seen.add(extension['name'])
    name='dartspoint-restore-'+secrets.token_hex(8)
    try:
        run(['docker','run','-d','--name',name,'--network','none','--cpus','0.5','--memory','512m','--pids-limit','128','--env','POSTGRES_HOST_AUTH_METHOD=trust',image])
        for attempt in range(60):
            # Ignore the temporary Unix-socket server used by image initdb.
            result=subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if result.returncode==0:break
            time.sleep(1)
        else:raise RuntimeError('Restore database did not become ready')
        run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],b'create role anon; create role authenticated; create role service_role; create role dartspoint_app; drop schema public cascade;')
        # Supabase may install contrib extensions outside the schema-filtered dump.
        for extension in required_extensions:
            if extension['schema']=='extensions':
                sql='create schema if not exists extensions;create extension "'+extension['name']+'" with schema extensions version \''+extension['version']+'\';'
                run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],sql.encode())
        run(['docker','exec','-i',name,'pg_restore','-U','postgres','--dbname','postgres','--no-owner','--no-privileges','--exit-on-error'],Path(dump).read_bytes())
        extensions=json.loads(run(['docker','exec',name,'psql','-U','postgres','-At','-c',"select coalesce(json_agg(json_build_object('name',e.extname,'schema',n.nspname,'version',e.extversion)),'[]'::json) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname in ('pgcrypto','citext','uuid-ossp');"]))
        if any(extension not in extensions for extension in required_extensions):raise RuntimeError('Restored extension namespace/version differs from snapshot')
        # Reinstall the reviewed role grants (provider-specific ownership/ACLs are excluded).
        grants=b"grant usage on schema public,auth to authenticated;grant select on profiles,preferences,notifications,channels,chat_messages to authenticated;grant usage on schema public,private to dartspoint_app;grant select,insert,update,delete on all tables in schema public,private to dartspoint_app;grant usage,select on all sequences in schema public,private to dartspoint_app;revoke update,delete on private.audit_events,public.rating_ledger,public.match_events from dartspoint_app;"
        run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],grants)
        exists=lambda table: run(['docker','exec',name,'psql','-U','postgres','-At','-c',"select to_regclass('private."+table+"') is not null"]).decode().strip()=='t'
        has_launch=exists('launch_subscriptions')
        if exists('command_ingress'):
            run(['docker','exec',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-c','revoke update,delete on private.command_ingress from dartspoint_app'])
        if has_launch:
            launch=json.loads(run(['docker','exec',name,'psql','-U','postgres','-At','-c',"select json_build_object('launchSubscriptions',count(*),'badLaunchTokens',count(*) filter(where unsubscribe_hash !~ '^[0-9a-f]{64}$' or email<>lower(btrim(email)))) from private.launch_subscriptions"]))
            for role in ('anon','authenticated'):
                denied=subprocess.run(['docker','exec',name,'psql','-U','postgres','-At','-v','ON_ERROR_STOP=1','-c','set role '+role+';select email from private.launch_subscriptions limit 1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                if denied.returncode==0:raise RuntimeError('Restored subscriptions exposed to public role')
            launch['launchPrivateAccessVerified']=True
        # Exercise restored policies using the actual Auth uid function and JWT claim.
        isolation_sql="begin;select set_config('request.jwt.claim.sub',(select id::text from profiles order by id limit 1),true);select set_config('request.jwt.claims',json_build_object('sub',(select id from profiles order by id limit 1),'role','authenticated')::text,true);set local role authenticated;select count(*) from profiles;rollback;"
        isolated=run(['docker','exec',name,'psql','-U','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-c',isolation_sql]).decode().splitlines()
        if isolated[-1] not in ('0','1'):raise RuntimeError('Restored profile policies expose other accounts')
        checks="select json_build_object('profiles',(select count(*) from profiles),'authUsers',(select count(*) from auth.users),'results',(select count(*) from match_results),'ledger',(select count(*) from rating_ledger),'migrations',(select count(*) from dartspoint_migrations.applied),'badLedger',(select count(*) from(select match_id from rating_ledger group by match_id having count(*)<>2 or sum(delta)<>0) bad),'rlsMissing',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname<>'spatial_ref_sys' and not c.relrowsecurity));"
        result=json.loads(run(['docker','exec',name,'psql','-U','postgres','-At','-c',checks]))
        if result['badLedger'] or result['rlsMissing'] or not result['migrations']:raise RuntimeError('Restored integrity/RLS verification failed')
        if has_launch: result.update(launch)
        result['rlsIsolationVerified']=True
        result['extensionsRestored']=extensions
        return result
    finally:
        subprocess.run(['docker','rm','--force','--volumes',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

if __name__=='__main__':
    try:print(json.dumps(restore(sys.argv[1],sys.argv[2],json.loads(Path(sys.argv[3]).read_text())['extensions'] if len(sys.argv)==4 else None)))
    except Exception:print('Database restore drill failed',file=sys.stderr);sys.exit(1)
