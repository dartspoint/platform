#!/usr/bin/env python3
"""Fixed root-owned entrypoint, executed as the environment app user, never root."""
import fcntl, importlib.util, json, os, pwd, stat, subprocess, sys, tempfile
from pathlib import Path
# -I excludes PYTHONPATH and the script directory; add only this reviewed fixed path.
sys.path.insert(0, '/usr/local/libexec/dartspoint')
from deployment_config import *
from github_origin import verify

def module(name):
    spec = importlib.util.spec_from_file_location(name.replace('-','_'), MANAGED/(name+'.py'))
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result

def context(env):
    env = environment(env)
    app = pwd.getpwnam('dartspoint-'+env)
    if os.getuid() != app.pw_uid or os.geteuid() == 0: raise ValueError('Wrong application account')
    os.environ.clear()
    os.environ.update({'PATH':'/usr/bin:/bin','HOME':app.pw_dir,'USER':app.pw_name,'LOGNAME':app.pw_name,
                       'XDG_RUNTIME_DIR':f'/run/user/{app.pw_uid}','DOCKER_HOST':f'unix:///run/user/{app.pw_uid}/docker.sock','LANG':'C.UTF-8'})
    os.umask(0o077)
    root = ROOT/env
    if root.is_symlink() or root.stat().st_uid != app.pw_uid or root.stat().st_mode & 0o077: raise ValueError('Private app-owned runtime directory required')
    info = json.loads(subprocess.check_output(['docker','info','--format','{{json .}}'],stderr=subprocess.DEVNULL))
    if 'name=rootless' not in info['SecurityOptions'] or info['CgroupVersion'] != '2' or info['CgroupDriver'] != 'systemd':
        raise ValueError('Rootless Docker with enforced cgroup v2/systemd limits is required')
    return root

def pending(env):
    spool = SPOOL/env
    runner = pwd.getpwnam('runner-'+env)
    if spool.is_symlink() or spool.stat().st_uid != runner.pw_uid or spool.stat().st_mode & 0o027: raise ValueError('Invalid handoff directory')
    fd = os.open(spool/'pending.json',os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,'r') as f:
        s = os.fstat(f.fileno())
        if not stat.S_ISREG(s.st_mode) or s.st_uid != runner.pw_uid or s.st_nlink != 1 or s.st_mode & 0o027 or s.st_size > 65536:
            raise ValueError('Invalid private delivery file')
        result = json.load(f)
    if set(result) != {'manifest','values','registryToken'}: raise ValueError('Unexpected delivery fields')
    return result

def reject_old(root, manifest):
    watermark = root/'newest-run.json'
    sequence = (int(manifest['run']),int(manifest['attempt']))
    if watermark.exists():
        previous = json.loads(watermark.read_text())
        if sequence <= tuple(previous['sequence']): raise ValueError('Release is stale or already attempted; rerun the workflow for an explicit retry')
    temporary = root/'newest-run.next'
    temporary.write_text(json.dumps({'sequence':sequence,'sha':manifest['sha']}));temporary.replace(watermark)

def pull(manifest, token, release, username):
    with tempfile.TemporaryDirectory(prefix='registry-',dir=release) as directory:
        registry_env = {**os.environ,'DOCKER_CONFIG':directory}
        login = subprocess.run(['docker','login','ghcr.io','--username',username,'--password-stdin'],input=token.encode(),env=registry_env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if login.returncode: raise RuntimeError('Temporary GHCR authentication failed')
        for service in SERVICES:
            result = subprocess.run(['docker','pull','--platform','linux/amd64',manifest['images'][service]],env=registry_env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            if result.returncode: raise RuntimeError('Immutable release image pull failed')
    # Temporary registry credentials have been removed before application startup.
    module('deploy').verify_images(release)
    probe="const fs=require('node:fs');const memory=fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim();const [quota,period]=fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim().split(' ').map(Number);const pids=fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim();if(memory!=='268435456'||quota/period!==0.5||pids!=='128')process.exit(1);"
    result=subprocess.run(['docker','run','--rm','--cpus','0.5','--memory','256m','--pids-limit','128',manifest['images']['worker'],'node','-e',probe],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode: raise RuntimeError('Rootless CPU, memory and process limits are not enforced')

def main():
    if len(sys.argv) != 2: raise ValueError('Deployment entrypoint accepts no caller arguments')
    env = environment(sys.argv[1]); root = context(env)
    os.chdir(root)
    with (root/'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        bundle = pending(env)
        pins = json.loads((CONFIG/'image-pins.json').read_text())
        manifest = validate_manifest(bundle['manifest'],env,pins)
        policy=json.loads((CONFIG/env/'public.json').read_text())
        if manifest['public']!=validate_public(env,policy):
            raise ValueError('Build public configuration differs from administrator-installed environment policy')
        bundle['values'] = validate_values(env,bundle['values'])
        username=verify(manifest,bundle['registryToken'])
        reject_old(root,manifest)
        release = module('prepare-release').prepare(manifest,bundle['values'],root)
        try:
            pull(manifest,bundle['registryToken'],release,username)
            verify(manifest,bundle['registryToken'])
            del bundle['registryToken']
            first_start = module('operator-actions')
            if first_start.bootstrap_first_database(env,root,release,keep_migration=True):
                print('Proven empty database initialized; normal database/backup/restore gates remain mandatory',flush=True)
            if not (root/'current').exists() and (root/'database-bootstrapped.json').exists():
                first_start.ensure_backup_repository(release)
            module('deploy').execute(release,locked=True)
        except Exception:
            # Retain role config for deliberate recovery, but never retain registry tokens.
            raise

if __name__ == '__main__':
    try: main()
    except Exception as error:
        detail=str(error) if type(error) in (ValueError,RuntimeError) else type(error).__name__
        sys.exit('Controlled deployment refused: '+detail+'; inspect private environment diagnostics')
