#!/usr/bin/env python3
"""Installed scheduled backup/retention, sharing the environment deployment lock."""
import fcntl, json, os, subprocess, sys
sys.path.insert(0, '/usr/local/libexec/dartspoint')
from deployment_config import environment, read_env
from managed import context, module
from deploy import release_path

def main():
    if len(sys.argv)!=3 or sys.argv[2] not in ('backup','retention'): raise ValueError('Invalid scheduled operation')
    env=environment(sys.argv[1]);root=context(env);os.chdir(root)
    with (root/'deploy.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        release=release_path(root/'current')
        if sys.argv[2]=='backup':
            evidence=module('backup-gate').backup(release)
            (root/'last-scheduled-backup.json').write_text(json.dumps(evidence)+'\n')
        else:
            values=read_env(release/'backup.env')
            restic={**os.environ,'GOMAXPROCS':'1',**{k:values[k] for k in ('RESTIC_REPOSITORY','RESTIC_PASSWORD','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_DEFAULT_REGION')}}
            for args in (['check','--read-data-subset=5%'],['forget','--tag','dartspoint-'+env,'--group-by','host','--keep-daily','14','--keep-weekly','8','--keep-monthly','12','--prune'],['check']):
                result=subprocess.run(['restic',*args],env=restic,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=1800)
                if result.returncode: raise RuntimeError('Scheduled retention/integrity check failed')
        print('Scheduled '+sys.argv[2]+' and integrity verification completed for '+env)

if __name__=='__main__':
    try: main()
    except Exception: sys.exit('Scheduled backup/retention failed; operator intervention required')
