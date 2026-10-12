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

def restore(dump, image):
    if not re.fullmatch(r'[a-zA-Z0-9./:_-]+@sha256:[0-9a-f]{64}', image):
        raise ValueError('Restore PostgreSQL image must be pinned by digest')
    name='dartspoint-restore-'+secrets.token_hex(8)
    try:
        run(['docker','run','-d','--name',name,'--network','none','--env','POSTGRES_HOST_AUTH_METHOD=trust',image])
        for attempt in range(60):
            result=subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if result.returncode==0:break
            time.sleep(1)
        else:raise RuntimeError('Restore database did not become ready')
        run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],b'create role anon; create role authenticated; create role service_role; create role dartspoint_app; drop schema public cascade;')
        run(['docker','exec','-i',name,'pg_restore','-U','postgres','--dbname','postgres','--no-owner','--no-privileges','--exit-on-error'],Path(dump).read_bytes())
        # Reinstall the reviewed role grants (provider-specific ownership/ACLs are excluded).
        grants=b"grant usage on schema public,auth to authenticated;grant select on profiles,preferences,notifications,channels,chat_messages to authenticated;grant usage on schema public,private to dartspoint_app;grant select,insert,update,delete on all tables in schema public,private to dartspoint_app;grant usage,select on all sequences in schema public,private to dartspoint_app;revoke update,delete on private.audit_events,public.rating_ledger,public.match_events from dartspoint_app;"
        run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],grants)
        # Exercise restored policies using the actual Auth uid function and JWT claim.
        isolation_sql="begin;select set_config('request.jwt.claim.sub',(select id::text from profiles order by id limit 1),true);select set_config('request.jwt.claims',json_build_object('sub',(select id from profiles order by id limit 1),'role','authenticated')::text,true);set local role authenticated;select count(*) from profiles;rollback;"
        isolated=run(['docker','exec',name,'psql','-U','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-c',isolation_sql]).decode().splitlines()
        if isolated[-1] not in ('0','1'):raise RuntimeError('Restored profile policies expose other accounts')
        checks="select json_build_object('profiles',(select count(*) from profiles),'authUsers',(select count(*) from auth.users),'results',(select count(*) from match_results),'ledger',(select count(*) from rating_ledger),'migrations',(select count(*) from dartspoint_migrations.applied),'badLedger',(select count(*) from(select match_id from rating_ledger group by match_id having count(*)<>2 or sum(delta)<>0) bad),'rlsMissing',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname<>'spatial_ref_sys' and not c.relrowsecurity));"
        result=json.loads(run(['docker','exec',name,'psql','-U','postgres','-At','-c',checks]))
        if result['badLedger'] or result['rlsMissing'] or not result['migrations']:raise RuntimeError('Restored integrity/RLS verification failed')
        result['rlsIsolationVerified']=True
        return result
    finally:
        subprocess.run(['docker','rm','--force','--volumes',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

if __name__=='__main__':
    try:print(json.dumps(restore(sys.argv[1],sys.argv[2])))
    except Exception:print('Database restore drill failed',file=sys.stderr);sys.exit(1)
