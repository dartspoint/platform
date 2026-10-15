"""Real old PostgreSQL dump + encrypted Restic marker restore, invoked by erasure.ts.

The observer only adds read-only assertions to actual Docker/pg_restore calls.
There are no provider API calls or cloud repositories in this drill.
"""
import importlib.util, json, os, secrets, subprocess, sys, tempfile
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'ops/scripts'))
def load(name):
    spec=importlib.util.spec_from_file_location(name.replace('-','_'),ROOT/'ops/scripts'/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def main():
    dump,marker_path,image=sys.argv[1:]
    marker=json.loads(Path(marker_path).read_text())
    ledger=load('privacy-ledger');restore=load('restore-db')
    ledger.marker(marker)
    with tempfile.TemporaryDirectory(prefix='dartspoint-encrypted-restore-') as folder:
        env={**os.environ,'RESTIC_REPOSITORY':str(Path(folder)/'repository'),'RESTIC_PASSWORD':secrets.token_urlsafe(32),'RESTIC_CACHE_DIR':str(Path(folder)/'cache'),'GOMAXPROCS':'1'}
        def restic(args,data=None):
            result=subprocess.run(['restic',*args],env=env,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120)
            if result.returncode:raise AssertionError('Owned encrypted Restic operation failed')
            return result.stdout
        def backup(filename,data,tag):
            lines=restic(['backup','--json','--stdin','--stdin-filename',filename,'--host','dartspoint-staging','--tag',tag],data).splitlines()
            return [json.loads(line)['snapshot_id'] for line in lines if json.loads(line).get('message_type')=='summary'][0]
        restic(['init'])
        database_snapshot=backup('database.dump',Path(dump).read_bytes(),'dartspoint-staging')
        marker_snapshot=backup('privacy-erasure.json',json.dumps(marker).encode(),'dartspoint-staging-privacy-ledger')
        # Recover the two independent artifacts through the actual encrypted repo.
        recovered=Path(folder)/'recovered.dump'
        recovered.write_bytes(restic(['dump',database_snapshot,'/database.dump']))
        with patch.object(ledger,'restic_environment',return_value=env):markers=ledger.recover({},'staging')
        assert markers==[marker]
        assert json.loads(restic(['dump',marker_snapshot,'/privacy-erasure.json']))==marker
        observed={'before':False,'after':False}
        original_run=restore.run
        def inspect(args,data=None):
            output=original_run(args,data)
            if args[:2]==['docker','exec'] and '-c' in args:
                sql=args[-1];container=args[2]
                if "to_regprocedure('private.replay_erasure_marker(jsonb)')" in sql:
                    value=json.loads(original_run(['docker','exec',container,'psql','-U','postgres','-At','-c',"select json_build_object('auth',(select count(*) from auth.users where id='"+marker['userId']+"'),'futureRequest',(select count(*) from private.privacy_requests where id='"+marker['requestId']+"'),'chats',(select count(*) from chat_messages where sender_id='"+marker['userId']+"'),'outbox',(select count(*) from private.outbox_events))"]))
                    assert value['auth']==1 and value['chats']==1 and value['futureRequest']==0,'Dump must contain the old identity and no future deletion request'
                    observed['before']=True;observed['outbox']=value['outbox']
                if sql.startswith('select private.replay_erasure_marker('):
                    value=json.loads(original_run(['docker','exec',container,'psql','-U','postgres','-At','-c',"select json_build_object('auth',(select count(*) from auth.users where id='"+marker['userId']+"'),'chats',(select count(*) from chat_messages where sender_id='"+marker['userId']+"'),'profile',(select json_build_object('username',username,'status',status) from profiles where id='"+marker['userId']+"'),'outbox',(select count(*) from private.outbox_events),'appOutcomeWrites',has_table_privilege('dartspoint_app','private.privacy_erasure_outcomes','UPDATE'),'appReplay',has_function_privilege('dartspoint_app','private.replay_erasure_marker(jsonb)','EXECUTE'))"]))
                    assert value['auth']==0 and value['chats']==0
                    assert value['profile']=={'username':None,'status':'deleted'}
                    assert value['outbox']==observed['outbox'],'Restore must never queue subject mail'
                    assert not value['appOutcomeWrites'] and not value['appReplay'],'Restore must preserve erasure capabilities'
                    observed['after']=True
            return output
        with patch.object(restore,'run',side_effect=inspect):proof=restore.restore(recovered,image,erasure_markers=markers)
        assert observed['before'] and observed['after']
        assert proof['privacyRestoreVerified'] and proof['retentionReplayVerified'] and proof['rlsIsolationVerified']
        assert proof['postPrivacyCounts']['authUsers']==proof['authUsers']-1
        restic(['check','--read-data'])
        print('Actual encrypted old-dump restore passed: marker recovered independently, identity/chat purged, ACLs preserved, no mail, post-retention integrity verified.')

if __name__=='__main__':main()
