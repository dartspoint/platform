#!/usr/bin/env python3
"""Explicit app-user operations; unavailable through runner sudoers."""
import fcntl, json, os, re, subprocess, sys
from urllib.parse import urlsplit, unquote
sys.path.insert(0, '/usr/local/libexec/dartspoint')
from deployment_config import environment, read_env
from managed import context
from deploy import release_path, compose, control, execute
from postgres_client import client

def bootstrap_first_database(env, root, release, keep_migration=False):
    """Initialize only a proven empty environment; never reset an existing schema."""
    if (root/'current').exists() or (root/'database-bootstrapped.json').exists(): return False
    values=read_env(release/'migration.env');backup=read_env(release/'backup.env')
    import tempfile
    with tempfile.TemporaryDirectory(dir=release) as folder:
        args,pg=client({**backup,**values},folder,'MIGRATION_DATABASE_URL')
        sql="select (to_regclass('public.profiles') is null and to_regclass('public.matches') is null and to_regclass('dartspoint_migrations.applied') is null and to_regnamespace('private') is null)::text;"
        result=subprocess.run(args+['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],env=pg,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60)
        if result.returncode: raise RuntimeError('Cannot verify whether the first database is empty over verified TLS')
        if result.stdout.strip()!=b'true': return False
    try: compose(release,'run','--rm','--no-deps','migrate')
    finally:
        if not keep_migration: (release/'migration.env').unlink(missing_ok=True)
    (root/'database-bootstrapped.json').write_text(json.dumps({'release':release.name,'environment':env})+'\n')
    return True

def ensure_backup_repository(release):
    """Accept an accessible repository or initialize a new one; never overwrite."""
    values=read_env(release/'backup.env')
    from deployment_config import validate_backup
    validate_backup(values)
    restic={**os.environ,**{k:values[k] for k in ('RESTIC_REPOSITORY','RESTIC_PASSWORD','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_DEFAULT_REGION')}}
    existing=subprocess.run(['restic','snapshots','--json'],env=restic,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60)
    if existing.returncode==0: return
    initialized=subprocess.run(['restic','init'],env=restic,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60)
    if initialized.returncode: raise RuntimeError('Backup repository access or initialization failed; check Hetzner credentials and the original Restic password')

def main():
    if len(sys.argv)<3: raise ValueError('Specify environment and operator action')
    env=environment(sys.argv[1]);root=context(env);os.chdir(root)
    action=sys.argv[2]
    if action in ('status','drain','resume') and len(sys.argv)==3:
        with (root/'deploy.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            print(json.dumps(control(release_path(root/'current'),action)))
        return
    if action not in ('rollback','bootstrap','init-backup') or len(sys.argv)!=(4 if action=='rollback' else 5): raise ValueError('Invalid operator arguments')
    if not re.fullmatch('[0-9a-f]{40}-[1-9][0-9]*-[1-9][0-9]*',sys.argv[3]): raise ValueError('Invalid retained release identity')
    release=release_path(root/'releases'/sys.argv[3])
    if action=='rollback': execute(release,rollback=True);return
    if action=='init-backup':
        if sys.argv[4]!=env+':new-backup': raise ValueError('Explicit new repository confirmation required')
        with (root/'deploy.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            values=read_env(release/'backup.env')
            from deployment_config import validate_backup
            validate_backup(values)
            restic={**os.environ,**{k:values[k] for k in ('RESTIC_REPOSITORY','RESTIC_PASSWORD','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_DEFAULT_REGION')}}
            result=subprocess.run(['restic','init'],env=restic,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60)
            if result.returncode: raise RuntimeError('Backup initialization refused; existing repositories require their original password')
            print('Encrypted repository initialized in the operator-provisioned bucket')
        return
    if sys.argv[4]!=env+':first-database': raise ValueError('Explicit first-database confirmation required')
    with (root/'deploy.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if not bootstrap_first_database(env,root,release): raise ValueError('Database is not demonstrably a first empty DartsPoint environment')
        print('First-database migration completed; normal backup/deployment gate remains mandatory')

if __name__=='__main__':
    try: main()
    except Exception: sys.exit('Operator action refused; inspect private environment diagnostics')
