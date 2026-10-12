#!/usr/bin/env python3
"""Real libpq/Node TLS rejection, encrypted Restic restore and rootless limits.

Only disposable local fixtures and the owned development database are used.
No Hetzner/cloud acceptance is claimed by this test.
"""
import base64, importlib.util, json, os, secrets, subprocess, sys, tempfile, time
from pathlib import Path
from urllib.parse import urlsplit, unquote

os.umask(0o077)
ROOT=Path(__file__).resolve().parents[2]
PINS=json.loads((ROOT/'ops/image-pins.json').read_text())
TOOLS=Path(os.environ['DARTSPOINT_QA_TOOLS'])

def run(args, env=None, expected=True, timeout=120):
    result=subprocess.run(args,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    if expected and result.returncode: raise RuntimeError('Disposable infrastructure check failed; private provider details suppressed')
    return result

def docker(*args, **options): return run(['docker',*args],**options)

def tls_checks():
    network='dartspoint-tls-'+secrets.token_hex(5);name=network+'-db';password=secrets.token_hex(32)
    docker('network','create','--internal',network)
    try:
        with tempfile.TemporaryDirectory(prefix='dartspoint-tls-') as directory:
            folder=Path(directory)
            for stem in ('ca','wrong-ca'):
                run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(folder/(stem+'.key')),'-out',str(folder/(stem+'.crt')),'-days','1','-subj','/CN='+stem])
            run(['openssl','req','-new','-newkey','rsa:2048','-nodes','-keyout',str(folder/'server.key'),'-out',str(folder/'server.csr'),'-subj','/CN='+name])
            (folder/'extensions').write_text('subjectAltName=DNS:'+name+'\nextendedKeyUsage=serverAuth\n')
            run(['openssl','x509','-req','-in',str(folder/'server.csr'),'-CA',str(folder/'ca.crt'),'-CAkey',str(folder/'ca.key'),'-CAcreateserial','-out',str(folder/'server.crt'),'-days','1','-extfile',str(folder/'extensions')])
            envfile=folder/'server.env';envfile.write_text('POSTGRES_PASSWORD='+password+'\n')
            docker('run','-d','--name',name,'--network',network,'--network-alias','wrong-host','--memory','512m','--cpus','0.5','--pids-limit','128','--env-file',str(envfile),'--mount','type=bind,source='+str(folder)+',target=/certs,readonly',PINS['POSTGRES_IMAGE'],'sh','-c','cp /certs/server.key /certs/server.crt /tmp/; chown postgres:postgres /tmp/server.key /tmp/server.crt; chmod 0600 /tmp/server.key; exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key')
            for _ in range(60):
                if docker('exec',name,'pg_isready','-h','127.0.0.1','-U','postgres',expected=False).returncode==0:break
                time.sleep(1)
            else: raise RuntimeError('Disposable TLS database did not become ready')
            # Public CA files are read by libpq/Node clients, private keys remain 0600.
            for stem in ('ca','wrong-ca'): (folder/(stem+'.crt')).chmod(0o644)
            helper=folder/'client.ts'
            helper.write_text("import {Pool} from 'pg';import {postgresOptions} from "+json.dumps(str(ROOT/'packages/data/src/postgres.ts'))+";const p=new Pool({...postgresOptions(process.env.DATABASE_URL!),max:1});try{await p.query('select 1');}catch{process.exitCode=1;}finally{await p.end();}")
            run([str(ROOT/'node_modules/.bin/esbuild'),str(helper),'--bundle','--platform=node','--format=esm','--target=node24','--external:pg-native','--banner:js=import {createRequire} from "node:module";const require=createRequire(import.meta.url);','--outfile='+str(folder/'client.mjs')],env={**os.environ,'NODE_PATH':str(ROOT/'node_modules')})
            (folder/'client.mjs').chmod(0o644)
            for hostname,ca,good in ((name,'ca',True),(name,'wrong-ca',False),('wrong-host','ca',False)):
                sys.path.insert(0,str(ROOT/'ops/scripts'))
                from postgres_client import client
                args,pg=client({'BACKUP_DATABASE_URL':'postgresql://postgres:'+password+'@'+hostname+'/postgres?sslmode=verify-full','POSTGRES_IMAGE':PINS['POSTGRES_IMAGE'],'DATABASE_CA_CERT_BASE64':base64.b64encode((folder/(ca+'.crt')).read_bytes()).decode()},folder)
                result=run(args[:2]+['--network',network]+args[2:]+['psql','-X','-qAt','-c','select 1'],env=pg,expected=False)
                if (result.returncode==0)!=good: raise RuntimeError('libpq accepted an untrusted certificate or incorrect hostname')
                nodeenv=folder/'node.env';nodeenv.write_text('APP_ENV=staging\nDATABASE_URL=postgresql://postgres:'+password+'@'+hostname+'/postgres?sslmode=require\nDATABASE_CA_CERT_BASE64='+base64.b64encode((folder/(ca+'.crt')).read_bytes()).decode()+'\n')
                result=docker('run','--rm','--network',network,'--user','node','--memory','256m','--cpus','0.5','--pids-limit','128','--env-file',str(nodeenv),'--mount','type=bind,source='+str(folder/'client.mjs')+',target=/tmp/client.mjs,readonly',PINS['NODE_IMAGE'],'node','/tmp/client.mjs',expected=False)
                if (result.returncode==0)!=good: raise RuntimeError('Node database driver accepted an untrusted certificate or incorrect hostname')
            probe="const fs=require('node:fs');if(fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim()!=='268435456')process.exit(1);const [q,p]=fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim().split(' ').map(Number);if(q/p!==0.5||fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim()!=='128')process.exit(1);"
            docker('run','--rm','--memory','256m','--cpus','0.5','--pids-limit','128',PINS['NODE_IMAGE'],'node','-e',probe)
    finally:
        docker('rm','--force','--volumes',name,expected=False)
        docker('network','rm',network,expected=False)
    print('Real libpq and Node TLS: trusted CA works; wrong CA/hostname refused; cgroup limits enforced')

def encrypted_restore():
    values=dict(line.split('=',1) for line in (ROOT/'.env.local').read_text().splitlines() if line and not line.startswith('#'))
    p=urlsplit(values['MIGRATION_DATABASE_URL'])
    if values['APP_ENV']!='development' or p.hostname not in ('localhost','127.0.0.1'): raise ValueError('Only the owned local development database is allowed')
    role_command=['node','--import','tsx',str(ROOT/'scripts/verify-database.ts')]
    run(role_command,{**os.environ,**values})
    if run(role_command,{**os.environ,**values,'DATABASE_URL':values['MIGRATION_DATABASE_URL']},expected=False).returncode==0:
        raise RuntimeError('Application role verification accepted a superuser')
    with tempfile.TemporaryDirectory(prefix='dartspoint-restic-') as directory:
        folder=Path(directory);source=folder/'source';source.mkdir();dump=source/'database.dump'
        pg={**os.environ,'PGHOST':'supabase_db_dartspoint-development','PGPORT':'5432','PGUSER':unquote(p.username),'PGPASSWORD':unquote(p.password),'PGDATABASE':'postgres'}
        args=['run','--rm','--network','supabase_network_dartspoint-development',*[x for k in ('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE') for x in ('--env',k)],PINS['POSTGRES_IMAGE'],'pg_dump','--format=custom','--schema=auth','--schema=public','--schema=private','--schema=dartspoint_migrations','--no-owner','--no-privileges']
        dump.write_bytes(docker(*args,env=pg).stdout)
        extension_sql="select coalesce(json_agg(json_build_object('name',e.extname,'schema',n.nspname,'version',e.extversion)),'[]'::json) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname in ('pgcrypto','citext','uuid-ossp');"
        required_extensions=json.loads(docker(*args[:args.index('pg_dump')],'psql','-X','-qAt','-c',extension_sql,env=pg).stdout)
        env={**os.environ,'RESTIC_REPOSITORY':str(folder/'encrypted-repository'),'RESTIC_PASSWORD':secrets.token_urlsafe(32),'RESTIC_CACHE_DIR':str(folder/'cache')}
        restic=str(TOOLS/'restic');run([restic,'init'],env)
        backup_command=[restic,'backup','--json','--host','dartspoint-staging','--tag','dartspoint-staging',str(source)]
        output=run(backup_command,env).stdout.decode()
        snapshot=[json.loads(x)['snapshot_id'] for x in output.splitlines() if json.loads(x).get('message_type')=='summary'][0]
        result=run([restic,'snapshots'],{**env,'RESTIC_PASSWORD':'incorrect-test-password'},expected=False)
        if result.returncode==0: raise RuntimeError('Encrypted repository accepted an incorrect password')
        run([restic,'check','--read-data'],env)
        restored=folder/'restored';run([restic,'restore',snapshot,'--target',str(restored),'--verify'],env)
        recovered=list(restored.rglob('database.dump'))
        if len(recovered)!=1 or recovered[0].read_bytes()!=dump.read_bytes(): raise RuntimeError('Restic did not restore the exact database dump')
        spec=importlib.util.spec_from_file_location('restore_db',ROOT/'ops/scripts/restore-db.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        result=module.restore(recovered[0],PINS['POSTGRES_IMAGE'],required_extensions)
        if not result['rlsIsolationVerified'] or result['badLedger'] or result['rlsMissing']: raise RuntimeError('Actual restored database integrity failed')
        run(backup_command,env)
        run([restic,'check','--read-data-subset=5%'],env)
        run([restic,'forget','--tag','dartspoint-staging','--group-by','host','--keep-daily','14','--keep-weekly','8','--keep-monthly','12','--prune'],env)
        run([restic,'check','--read-data'],env)
    print('Real encrypted Restic backup/check/verified restore/retention; wrong password refused; Auth/RLS/ledger/extensions restored in isolated PG17')

if __name__=='__main__':
    try:
        tls_checks();encrypted_restore()
        (ROOT/'artifacts/deployment-infrastructure-result.json').write_text(json.dumps({'ok':True,'libpqAndNodeTLSVerified':True,'untrustedCAAndHostnameRejected':True,'rootlessLimitsEnforced':True,'encryptedResticRealDatabaseRestored':True,'wrongResticPasswordRejected':True,'externalHetznerTested':False},indent=2))
    except Exception:
        print('Deployment infrastructure acceptance failed; credentials/provider diagnostics suppressed',file=sys.stderr);sys.exit(1)
