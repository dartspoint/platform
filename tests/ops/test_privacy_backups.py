import datetime as dt,importlib.util,json,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
import sys
sys.path.insert(0,str(ROOT/'ops/scripts'))
def load(name):
 spec=importlib.util.spec_from_file_location(name.replace('-','_'),ROOT/'ops/scripts'/(name+'.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
retention=load('backup-retention');ledger=load('privacy-ledger')
class PrivacyBackupPolicy(unittest.TestCase):
 def test_fixed_wall_clock_and_environment_scope(self):
  now=dt.datetime(2026,10,15,tzinfo=dt.timezone.utc)
  def snapshot(age,tag='dartspoint-staging',host='dartspoint-staging',identity='a'):
   return {'id':identity*64,'time':(now-dt.timedelta(days=age)).isoformat(),'hostname':host,'tags':[tag]}
  items=[snapshot(40),snapshot(10,identity='b'),snapshot(36,'dartspoint-staging-privacy-ledger',identity='c'),snapshot(35,'dartspoint-staging-privacy-ledger',identity='d'),snapshot(300,'dartspoint-production','dartspoint-production','e'),snapshot(300,'unrelated',identity='f')]
  ids,counts=retention.expired_snapshots(items,'staging',now)
  self.assertEqual(ids,['a'*64,'c'*64]);self.assertEqual(counts,{'database':1,'ledger':1})
  # A repository with only an old latest snapshot still loses the expired data.
  self.assertEqual(retention.expired_snapshots([items[0]],'staging',now)[0],['a'*64])
  recently_uploaded_expired={**snapshot(0,'dartspoint-staging-privacy-ledger',identity='9'),'privacyExpiresAt':(now-dt.timedelta(days=1)).isoformat()}
  self.assertEqual(retention.expired_snapshots([recently_uploaded_expired],'staging',now)[0],['9'*64])
 def test_minimal_marker_validation_rejects_personal_payload_or_unbounded_lifetime(self):
  item={'id':'10000000-0000-4000-8000-000000000001','requestId':'10000000-0000-4000-8000-000000000002','userId':'10000000-0000-4000-8000-000000000003','scopes':['account','chat','support','technical'],'createdAt':'2026-10-15T00:00:00Z','expiresAt':'2026-11-21T00:00:00Z'}
  self.assertEqual(ledger.marker(item),item)
  for changed in [{**item,'email':'private@example.test'},{**item,'expiresAt':'2026-11-22T00:00:00Z'},{**item,'scopes':['all']},{**item,'id':'bad'}]:
   with self.assertRaises(ValueError):ledger.marker(changed)
if __name__=='__main__':unittest.main(verbosity=2)
