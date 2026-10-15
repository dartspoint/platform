#!/usr/bin/env python3
"""Installed scheduled backup/retention, sharing the environment deployment lock."""
import fcntl, json, os, subprocess, sys
sys.path.insert(0, '/usr/local/libexec/dartspoint')
from deployment_config import environment, read_env
from managed import context, module
from deploy import release_path

def main():
    if len(sys.argv)!=3 or sys.argv[2] not in ('backup','retention','privacy-ledger'): raise ValueError('Invalid scheduled operation')
    env=environment(sys.argv[1]);root=context(env);os.chdir(root)
    with (root/'deploy.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        release=release_path(root/'current')
        if sys.argv[2]=='privacy-ledger':
            evidence=module('privacy-ledger').publish(release,env)
            (root/'last-privacy-ledger.json').write_text(json.dumps(evidence)+'\n')
        elif sys.argv[2]=='backup':
            evidence=module('backup-gate').backup(release)
            (root/'last-scheduled-backup.json').write_text(json.dumps(evidence)+'\n')
        else:
            values=read_env(release/'backup.env')
            restic={**os.environ,'GOMAXPROCS':'1',**{k:values[k] for k in ('RESTIC_REPOSITORY','RESTIC_PASSWORD','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_DEFAULT_REGION')}}
            module('backup-retention').prune(restic,env)
            module('log-retention').prune(root)
            module('log-retention').prune_runtime_logs(release)
        print('Scheduled '+sys.argv[2]+' and integrity verification completed for '+env)

if __name__=='__main__':
    try: main()
    except Exception: sys.exit('Scheduled backup/retention failed; operator intervention required')
