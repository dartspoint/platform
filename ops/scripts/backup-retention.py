#!/usr/bin/env python3
"""Wall-clock maximum age, scoped to one environment and known backup kinds."""
import datetime as dt,json,re,subprocess

def expired_snapshots(snapshots,environment,now):
    ids=[];counts={'database':0,'ledger':0}
    for s in snapshots:
        if s.get('hostname')!='dartspoint-'+environment:continue
        tags=set(s.get('tags',[]));ledger='dartspoint-'+environment+'-privacy-ledger' in tags
        database='dartspoint-'+environment in tags
        if not ledger and not database:continue
        age=now-dt.datetime.fromisoformat(s['time'].replace('Z','+00:00'))
        # Daily execution gives <=30d database and <=37d marker maximum age.
        expiry=dt.datetime.fromisoformat(s['privacyExpiresAt'].replace('Z','+00:00')) if ledger and s.get('privacyExpiresAt') else None
        if age>=dt.timedelta(days=36 if ledger else 29) or expiry and now>=expiry-dt.timedelta(days=2):
            if not re.fullmatch('[0-9a-f]{64}',s['id']):raise ValueError('Invalid snapshot identity')
            ids.append(s['id']);counts['ledger' if ledger else 'database']+=1
    return ids,counts

def prune(env,environment):
    def command(args):
        p=subprocess.run(['restic',*args],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=1800)
        if p.returncode:raise RuntimeError('Scheduled retention/integrity check failed')
        return p.stdout
    command(['check','--read-data-subset=5%'])
    def snapshots_with_expiry():
        snapshots=json.loads(command(['snapshots','--json']))
        for item in snapshots:
            if item.get('hostname')!='dartspoint-'+environment or 'dartspoint-'+environment+'-privacy-ledger' not in item.get('tags',[]):continue
            expiry_tags=[tag for tag in item.get('tags',[]) if tag.startswith('privacy-expires-')]
            if len(expiry_tags)>1:raise RuntimeError('Ambiguous privacy marker expiry')
            if expiry_tags:
                if not re.fullmatch(r'privacy-expires-[0-9]{10}',expiry_tags[0]):raise RuntimeError('Invalid privacy marker expiry')
                expires=dt.datetime.fromtimestamp(int(expiry_tags[0].removeprefix('privacy-expires-')),dt.timezone.utc)
            else:
                # Older reviewed markers have no expiry tag; inspect the actual
                # encrypted payload instead of extending its life from upload time.
                identity=item['id']
                if not re.fullmatch('[0-9a-f]{64}',identity):raise ValueError('Invalid snapshot identity')
                payload=json.loads(command(['dump',identity,'/privacy-erasure.json']))
                created=dt.datetime.fromisoformat(payload['createdAt'].replace('Z','+00:00'));expires=dt.datetime.fromisoformat(payload['expiresAt'].replace('Z','+00:00'))
                if not created<expires<=created+dt.timedelta(days=37):raise RuntimeError('Invalid historical marker lifetime')
            item['privacyExpiresAt']=expires.isoformat()
        return snapshots
    snapshots=snapshots_with_expiry()
    ids,counts=expired_snapshots(snapshots,environment,dt.datetime.now(dt.timezone.utc))
    for start in range(0,len(ids),100):command(['forget',*ids[start:start+100]])
    if ids:command(['prune','--max-unused','0'])
    remaining=snapshots_with_expiry()
    if expired_snapshots(remaining,environment,dt.datetime.now(dt.timezone.utc))[0]:raise RuntimeError('Backup maximum age exceeded')
    command(['check'])
    return counts
