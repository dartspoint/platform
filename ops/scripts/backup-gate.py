#!/usr/bin/env python3
"""Encrypted S3/Restic offsite backup plus a real restore before every deployment."""
import base64, contextlib, datetime as dt, importlib.util, json, os, re, secrets, select, subprocess, sys, tempfile
from deployment_config import read_env, validate_backup
from deploy import release_path, meta
from postgres_client import client
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote
os.umask(0o077)

def command(args, env):
    result=subprocess.run(args,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=1200)
    if result.returncode:raise RuntimeError('Backup provider/restore operation failed')
    return result.stdout

def backup(release):
    release=release_path(release)
    environment,sha=meta(release)['environment'],meta(release)['sha']
    values=read_env(release/'backup.env')
    validate_backup(values)
    repository=values['RESTIC_REPOSITORY']
    if not repository.startswith('s3:https://') or urlsplit(repository[3:]).hostname in ('localhost','127.0.0.1'):raise ValueError('An HTTPS offsite S3 repository is required')
    env={**os.environ,'GOMAXPROCS':'1',**{k:values[k] for k in ('RESTIC_REPOSITORY','RESTIC_PASSWORD','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_DEFAULT_REGION')}}
    with tempfile.TemporaryDirectory(prefix='dartspoint-backup-',dir=release) as directory, contextlib.ExitStack() as cleanup:
        folder=Path(directory);dump=folder/'database.dump'
        names={operation:'dartspoint-backup-'+operation+'-'+secrets.token_hex(8) for operation in ('version','snapshot','dump')}
        for name in names.values():
            cleanup.callback(subprocess.run,['docker','rm','--force','--volumes',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        pgargs,pg=client(values,folder)

        # Counts and dump share one exported PG snapshot while games keep writing.
        snapshot_sql="select json_build_object('snapshot',pg_export_snapshot(),'counts',json_build_object('profiles',(select count(*) from profiles),'authUsers',(select count(*) from auth.users),'results',(select count(*) from match_results),'ledger',(select count(*) from rating_ledger),'migrations',(select count(*) from dartspoint_migrations.applied)),'extensions',coalesce((select json_agg(json_build_object('name',e.extname,'schema',n.nspname,'version',e.extversion)) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname in ('pgcrypto','citext','uuid-ossp')),'[]'::json));"
        named=lambda operation:pgargs[:-1]+['--name',names[operation],pgargs[-1]]
        version=command(named('version')+['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-c','show server_version_num'],pg).decode().strip()
        if not version.isdigit() or int(version)//10000!=17:raise RuntimeError('External database must match tested PostgreSQL major 17')
        exporter=subprocess.Popen(named('snapshot')[:-1]+['-i',pgargs[-1],'psql','-X','-qAt','-v','ON_ERROR_STOP=1'],env=pg,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            exporter.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'+snapshot_sql+'\n');exporter.stdin.flush()
            if not select.select([exporter.stdout],[],[],30)[0]:raise RuntimeError('Database snapshot timed out')
            captured=json.loads(exporter.stdout.readline());expected=captured['counts']
            if not re.fullmatch('[0-9A-Fa-f-]+',captured['snapshot']):raise ValueError('Invalid database snapshot')
            with dump.open('wb') as output:
                p=subprocess.run(named('dump')+['pg_dump','--snapshot='+captured['snapshot'],'--format=custom','--schema=auth','--schema=public','--schema=private','--schema=dartspoint_migrations','--no-owner','--no-privileges'],env=pg,stdout=output,stderr=subprocess.PIPE,timeout=900)
                if p.returncode:raise RuntimeError('Database backup failed')
        finally:
            try:exporter.communicate('ROLLBACK;\n',timeout=10)
            except Exception:exporter.kill();exporter.wait()
        (folder/'metadata.json').write_text(json.dumps({'environment':environment,'release':sha,'counts':expected,'extensions':captured['extensions']}))
        # A missing repository fails closed. Initialize deliberately during provisioning.
        output=command(['restic','backup','--json','--host','dartspoint-'+environment,'--tag','dartspoint-'+environment,'--tag',sha,str(folder)],env).decode()
        summary=[json.loads(line) for line in output.splitlines() if json.loads(line).get('message_type')=='summary'][-1]
        snapshot=summary['snapshot_id'];restored=folder/'restored'
        command(['restic','restore',snapshot,'--target',str(restored),'--verify'],env)
        recovered=list(restored.rglob('database.dump'))
        if len(recovered)!=1:raise RuntimeError('Offsite snapshot did not restore exactly one database')
        spec=importlib.util.spec_from_file_location('restore_db',Path(__file__).with_name('restore-db.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        counts=module.restore(recovered[0],values['POSTGRES_IMAGE'],captured['extensions'])
        if any(counts[k]!=value for k,value in expected.items()):raise RuntimeError('Restored row counts differ from the backup')
        now=dt.datetime.now(dt.timezone.utc).isoformat()
        return {'ok':True,'environment':environment,'storage':'offsite','backupCompletedAt':now,'restoreVerifiedAt':now,'providerBackupId':snapshot,'release':sha,'verifiedCounts':counts}
if __name__=='__main__':
    try:
        if len(sys.argv)!=2:raise ValueError('Backup accepts one validated release path')
        print(json.dumps(backup(sys.argv[1])))
    except Exception:print('Offsite backup/restore gate failed; deployment refused',file=sys.stderr);sys.exit(1)
