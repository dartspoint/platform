#!/usr/bin/env python3
"""Runner-side private handoff; no repository checkout or execution on the VPS."""
import fcntl, json, os, pwd, subprocess, sys
from pathlib import Path
from deployment_config import *

def main():
    env = environment(os.environ['DEPLOY_ENV'])
    if pwd.getpwuid(os.getuid()).pw_name != 'runner-'+env:
        raise ValueError('Wrong delivery account')
    pins = json.loads((CONFIG/'image-pins.json').read_text())
    manifest = validate_manifest(json.loads(Path(os.environ['RELEASE_MANIFEST']).read_text()), env, pins)
    if (manifest['sha'],manifest['run'],manifest['attempt']) != tuple(os.environ[k] for k in ('GITHUB_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT')):
        raise ValueError('Artifact identity differs from current workflow')
    values = {k:os.environ.get(k,'') for k in SECRETS+VARIABLES+OPTIONAL}
    values = validate_values(env, values)
    bundle = {'manifest':manifest,'values':values,'registryToken':scalar(os.environ['GITHUB_TOKEN'])}
    spool = SPOOL/env
    # Per-environment group grants only the corresponding app account read access.
    if spool.is_symlink() or spool.stat().st_uid != os.getuid() or spool.stat().st_mode & 0o027:
        raise ValueError('Provision a private runner-owned delivery directory first')
    with (spool/'delivery.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        temporary = spool/'pending.next'
        pending = spool/'pending.json'
        temporary.unlink(missing_ok=True)
        try:
            fd = os.open(temporary, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o640)
            with os.fdopen(fd,'w') as f: json.dump(bundle,f)
            os.chmod(temporary,0o640)
            temporary.replace(pending)
            subprocess.run(['/usr/bin/sudo','-n','-u','dartspoint-'+env,'/usr/local/libexec/dartspoint-deploy-'+env],check=True)
        finally:
            temporary.unlink(missing_ok=True)
            pending.unlink(missing_ok=True)

if __name__ == '__main__':
    try: main()
    except Exception: sys.exit('Delivery failed; inspect private per-environment diagnostics')
