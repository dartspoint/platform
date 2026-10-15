"""Actual encrypted local Restic round trip; no S3/cloud credentials are used."""
import datetime as dt,importlib.util,json,os,secrets,shutil,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import sys
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'ops/scripts'))
def load(name):
 spec=importlib.util.spec_from_file_location(name.replace('-','_'),ROOT/'ops/scripts'/(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
ledger=load('privacy-ledger');retention=load('backup-retention')
@unittest.skipUnless(shutil.which('restic'),'Actual Restic binary is required for the encrypted round trip')
class ActualResticPrivacy(unittest.TestCase):
 def test_encrypted_readback_and_scoped_wall_clock_pruning(self):
  with tempfile.TemporaryDirectory(prefix='dartspoint-restic-qa-') as d:
   env={**os.environ,'RESTIC_REPOSITORY':str(Path(d)/'repository'),'RESTIC_PASSWORD':secrets.token_urlsafe(32),'RESTIC_CACHE_DIR':str(Path(d)/'cache'),'GOMAXPROCS':'1'}
   def run(args,data=None):
    p=subprocess.run(['restic',*args],env=env,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120)
    self.assertEqual(p.returncode,0,'Owned encrypted Restic operation failed');return p.stdout
   run(['init']);now=dt.datetime.now(dt.timezone.utc)
   def backup(age,tag,host,payload,filename):
    output=run(['backup','--json','--stdin','--stdin-filename',filename,'--host',host,'--tag',tag,'--time',(now-dt.timedelta(days=age)).strftime('%Y-%m-%d %H:%M:%S')],payload)
    return [json.loads(line)['snapshot_id'] for line in output.splitlines() if json.loads(line).get('message_type')=='summary'][0]
   old=backup(40,'dartspoint-staging','dartspoint-staging',b'old database','database.dump')
   current=backup(0,'dartspoint-staging','dartspoint-staging',b'current database','database.dump')
   protected=backup(40,'dartspoint-production','dartspoint-production',b'unrelated production','database.dump')
   item={'id':'10000000-0000-4000-8000-000000000001','requestId':'10000000-0000-4000-8000-000000000002','userId':'10000000-0000-4000-8000-000000000003','scopes':['account','chat'],'createdAt':now.isoformat(),'expiresAt':(now+dt.timedelta(days=37)).isoformat()}
   raw=json.dumps(item,separators=(',',':'),sort_keys=True).encode();snapshot=backup(0,'dartspoint-staging-privacy-ledger','dartspoint-staging',raw,'privacy-erasure.json')
   self.assertEqual(run(['dump',snapshot,'/privacy-erasure.json']),raw)
   with patch.object(ledger,'restic_environment',return_value=env):self.assertEqual(ledger.recover({},'staging'),[item])
   counts=retention.prune(env,'staging');self.assertEqual(counts,{'database':1,'ledger':0})
   snapshots=json.loads(run(['snapshots','--json']));ids=[s['id'] for s in snapshots]
   self.assertNotIn(old,ids);self.assertIn(current,ids);self.assertIn(protected,ids);self.assertIn(snapshot,ids)
   run(['check','--read-data'])
if __name__=='__main__':unittest.main(verbosity=2)
