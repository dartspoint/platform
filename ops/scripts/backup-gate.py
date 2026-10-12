#!/usr/bin/env python3
"""Encrypted S3/Restic offsite backup plus a real restore before every deployment."""
import base64, datetime as dt, importlib.util, json, os, re, subprocess, sys, tempfile
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote
os.umask(0o077)

def command(args, env):
    result=subprocess.run(args,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:raise RuntimeError('Backup provider/restore operation failed')
    return result.stdout

def main():
    environment,sha=sys.argv[1:3]
    if environment not in ('staging','production') or not re.fullmatch('[0-9a-f]{40}',sha):raise ValueError('Invalid backup release')
    root=Path('/opt/dartspoint')/environment
    releases=sorted((root/'releases').glob(sha+'-*'),key=lambda p:p.stat().st_mtime,reverse=True)
    if not releases:raise ValueError('Release configuration missing')
    release=releases[0];configuration=release/'backup.env'
    if configuration.is_symlink() or configuration.stat().st_mode&0o077:raise ValueError('Backup configuration must be owner-only')
    values=dict(line.split('=',1) for line in configuration.read_text().splitlines())
    repository=values['RESTIC_REPOSITORY']
    if not repository.startswith('s3:https://') or urlsplit(repository[3:]).hostname in ('localhost','127.0.0.1'):raise ValueError('An HTTPS offsite S3 repository is required')
    env={**os.environ,**{k:values[k] for k in ('RESTIC_REPOSITORY','RESTIC_PASSWORD','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY')}}
    parsed=urlsplit(values['BACKUP_DATABASE_URL']);tls=parse_qs(parsed.query).get('sslmode')
    if tls not in (['require'],['verify-full']):raise ValueError('Backup database TLS is required')
    pg={**env,'PGHOST':parsed.hostname,'PGPORT':str(parsed.port or 5432),'PGUSER':unquote(parsed.username),'PGPASSWORD':unquote(parsed.password),'PGDATABASE':parsed.path[1:],'PGSSLMODE':'verify-full'}
    with tempfile.TemporaryDirectory(prefix='dartspoint-backup-',dir=release) as directory:
        folder=Path(directory);dump=folder/'database.dump'
        pgargs=['docker','run','--rm',*[arg for k in ('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE') for arg in ('--env',k)],values['POSTGRES_IMAGE']]
        if values.get('DATABASE_CA_CERT_BASE64'):
            certificate=folder/'database-ca.crt';certificate.write_bytes(base64.b64decode(values['DATABASE_CA_CERT_BASE64'],validate=True));certificate.chmod(0o644)
            pg['PGSSLROOTCERT']='/tmp/database-ca.crt';pgargs=pgargs[:-1]+['--env','PGSSLROOTCERT','--mount','type=bind,source='+str(certificate)+',target=/tmp/database-ca.crt,readonly',pgargs[-1]]

        # Counts and dump share one exported PG snapshot while games keep writing.
        snapshot_sql="select json_build_object('snapshot',pg_export_snapshot(),'counts',json_build_object('profiles',(select count(*) from profiles),'authUsers',(select count(*) from auth.users),'results',(select count(*) from match_results),'ledger',(select count(*) from rating_ledger),'migrations',(select count(*) from dartspoint_migrations.applied)));"
        exporter=subprocess.Popen(pgargs[:-1]+['-i',pgargs[-1],'psql','-X','-qAt','-v','ON_ERROR_STOP=1'],env=pg,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            exporter.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'+snapshot_sql+'\n');exporter.stdin.flush()
            captured=json.loads(exporter.stdout.readline());expected=captured['counts']
            if not re.fullmatch('[0-9A-Fa-f-]+',captured['snapshot']):raise ValueError('Invalid database snapshot')
            with dump.open('wb') as output:
                p=subprocess.run(pgargs+['pg_dump','--snapshot='+captured['snapshot'],'--format=custom','--schema=auth','--schema=public','--schema=private','--schema=dartspoint_migrations','--no-owner','--no-privileges'],env=pg,stdout=output,stderr=subprocess.PIPE)
                if p.returncode:raise RuntimeError('Database backup failed')
        finally:
            try:exporter.communicate('ROLLBACK;\n',timeout=10)
            except Exception:exporter.kill();exporter.wait()
        (folder/'metadata.json').write_text(json.dumps({'environment':environment,'release':sha,'counts':expected}))
        # A missing repository fails closed. Initialize deliberately during provisioning.
        output=command(['restic','backup','--json','--tag','dartspoint-'+environment,'--tag',sha,str(folder)],env).decode()
        summary=[json.loads(line) for line in output.splitlines() if json.loads(line).get('message_type')=='summary'][-1]
        snapshot=summary['snapshot_id'];restored=folder/'restored'
        command(['restic','restore',snapshot,'--target',str(restored),'--verify'],env)
        recovered=list(restored.rglob('database.dump'))
        if len(recovered)!=1:raise RuntimeError('Offsite snapshot did not restore exactly one database')
        spec=importlib.util.spec_from_file_location('restore_db',Path(__file__).with_name('restore-db.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        counts=module.restore(recovered[0],values['POSTGRES_IMAGE'])
        if any(counts[k]!=value for k,value in expected.items()):raise RuntimeError('Restored row counts differ from the backup')
        now=dt.datetime.now(dt.timezone.utc).isoformat()
        print(json.dumps({'ok':True,'environment':environment,'storage':'offsite','backupCompletedAt':now,'restoreVerifiedAt':now,'providerBackupId':snapshot,'release':sha,'verifiedCounts':counts}))
if __name__=='__main__':
    try:main()
    except Exception:print('Offsite backup/restore gate failed; deployment refused',file=sys.stderr);sys.exit(1)
