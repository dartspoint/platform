#!/usr/bin/env python3
"""Durable, encrypted erasure markers independent from application snapshots."""
import datetime as dt, hashlib, json, os, re, subprocess, tempfile
from pathlib import Path
from deployment_config import read_env,validate_backup
from postgres_client import client
UUID=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}')
SCOPES={'account','chat','support','technical'}
def marker(value):
    if not isinstance(value,dict) or set(value)!={'id','requestId','userId','scopes','createdAt','expiresAt'}:raise ValueError('Invalid erasure marker')
    if any(not isinstance(value[k],str) or not UUID.fullmatch(value[k]) for k in ('id','requestId','userId')):raise ValueError('Invalid marker identity')
    if not isinstance(value['scopes'],list) or not value['scopes'] or not set(value['scopes'])<=SCOPES or len(value['scopes'])!=len(set(value['scopes'])):raise ValueError('Invalid marker scopes')
    created=dt.datetime.fromisoformat(value['createdAt'].replace('Z','+00:00'));expires=dt.datetime.fromisoformat(value['expiresAt'].replace('Z','+00:00'))
    if created.tzinfo is None or expires.tzinfo is None or created>dt.datetime.now(dt.timezone.utc)+dt.timedelta(minutes=1) or not created<expires<=created+dt.timedelta(days=37):raise ValueError('Invalid marker expiry')
    return value

def run(args,env,data=None):
    p=subprocess.run(args,env=env,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=1200)
    if p.returncode:raise RuntimeError('Encrypted privacy ledger operation failed')
    return p.stdout

def restic_environment(values):
    validate_backup(values)
    return {**os.environ,'GOMAXPROCS':'1',**{k:values[k] for k in ('RESTIC_REPOSITORY','RESTIC_PASSWORD','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_DEFAULT_REGION')}}

def publish(release,environment):
    values=read_env(Path(release)/'backup.env');restic=restic_environment(values)
    with tempfile.TemporaryDirectory(prefix='privacy-ledger-',dir=release) as folder:
        args,pg=client(values,Path(folder))
        def query(sql):return run(args[:-1]+['-i',args[-1],'psql','-X','-qAt','-v','ON_ERROR_STOP=1'],pg,sql.encode()).decode().strip()
        exists=query("select to_regclass('private.privacy_erasure_ledger') is not null;")
        if exists!='t':return {'published':0,'featureAvailable':False}
        pending=json.loads(query("select coalesce(json_agg(m),'[]') from (select json_build_object('id',id,'requestId',request_id,'userId',user_id,'scopes',scopes,'createdAt',created_at,'expiresAt',expires_at) m from private.privacy_erasure_ledger where durable_at is null and completed_at is null and expires_at>now()+interval '35 days' order by created_at limit 20) x;"))
        published=0;superseded=0
        for item in pending:
            item=marker(item);raw=json.dumps(item,separators=(',',':'),sort_keys=True).encode();checksum=hashlib.sha256(raw).hexdigest()
            result=run(['restic','backup','--json','--stdin','--stdin-filename','privacy-erasure.json','--host','dartspoint-'+environment,'--tag','dartspoint-'+environment+'-privacy-ledger','--tag','erasure-'+item['id'],'--tag','privacy-expires-'+str(int(dt.datetime.fromisoformat(item['expiresAt'].replace('Z','+00:00')).timestamp()))],restic,raw)
            summary=[json.loads(line) for line in result.splitlines() if json.loads(line).get('message_type')=='summary'][-1];snapshot=summary['snapshot_id']
            if not re.fullmatch('[0-9a-f]{8,64}',snapshot):raise RuntimeError('Invalid ledger receipt')
            recovered=run(['restic','dump',snapshot,'/privacy-erasure.json'],restic)
            if hashlib.sha256(recovered).hexdigest()!=checksum:raise RuntimeError('Ledger readback differs')
            # Only validated UUID/digest characters enter this fixed operator SQL.
            receipt=snapshot+':'+checksum
            created=dt.datetime.fromisoformat(item['createdAt'].replace('Z','+00:00')).isoformat()
            expires=dt.datetime.fromisoformat(item['expiresAt'].replace('Z','+00:00')).isoformat()
            selected='array['+','.join("'"+scope+"'" for scope in item['scopes'])+']::text[]'
            acknowledged=query("update private.privacy_erasure_ledger set durable_at=now(),receipt='"+receipt+"' where id='"+item['id']+"' and request_id='"+item['requestId']+"' and user_id='"+item['userId']+"' and scopes="+selected+" and created_at='"+created+"'::timestamptz and expires_at='"+expires+"'::timestamptz and expires_at>now()+interval '30 days' and durable_at is null and completed_at is null returning id;")
            if acknowledged==item['id']:published+=1
            else:superseded+=1
    return {'published':published,'supersededMarkers':superseded,'featureAvailable':True}

def recover(values,environment):
    env=restic_environment(values);now=dt.datetime.now(dt.timezone.utc)
    snapshots=json.loads(run(['restic','snapshots','--json','--host','dartspoint-'+environment,'--tag','dartspoint-'+environment+'-privacy-ledger'],env))
    result={}
    for snapshot in snapshots:
        when=dt.datetime.fromisoformat(snapshot['time'].replace('Z','+00:00'))
        if when<now-dt.timedelta(days=37):continue
        if 'dartspoint-'+environment+'-privacy-ledger' not in snapshot.get('tags',[]):raise RuntimeError('Unexpected ledger scope')
        item=marker(json.loads(run(['restic','dump',snapshot['id'],'/privacy-erasure.json'],env)))
        if dt.datetime.fromisoformat(item['expiresAt'].replace('Z','+00:00'))>now:
            existing=result.get(item['id'])
            if existing is None or dt.datetime.fromisoformat(item['createdAt'].replace('Z','+00:00'))>dt.datetime.fromisoformat(existing['createdAt'].replace('Z','+00:00')):result[item['id']]=item
    return list(result.values())
