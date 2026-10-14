#!/usr/bin/env python3
"""Hosted-only amd64 image publication. Only public values enter builds/artifacts."""
import datetime, json, os, subprocess, tempfile
from pathlib import Path
from deployment_config import *

def main():
    env = environment(os.environ['DEPLOY_ENV'])
    sha, run, attempt = (os.environ[k] for k in ('GITHUB_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT'))
    release_id = identity(sha, run, attempt)
    if os.environ.get('GITHUB_REPOSITORY') != REPOSITORY or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted':
        raise ValueError('Publication requires the hosted repository workflow')
    if subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip() != sha:
        raise ValueError('Build checkout does not match trigger')
    if subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],text=True).strip():
        raise ValueError('Build checkout must be clean')
    public = validate_public(env, os.environ)
    pins = json.loads(Path('ops/image-pins.json').read_text())
    images = {}
    # Docker auth is created/removed by the workflow, outside source and image context.
    for service in SERVICES:
        image = f'ghcr.io/dartspoint/platform-{env}-{service}'
        with tempfile.TemporaryDirectory() as folder:
            metadata = Path(folder)/'metadata.json'
            args = ['docker','buildx','build','--platform','linux/amd64','--file','ops/Dockerfile.target','--target','runtime','--push','--provenance=mode=min','--metadata-file',str(metadata),'--tag',image+':'+release_id,'--build-arg','NODE_IMAGE='+pins['NODE_IMAGE'],'--build-arg','SERVICE='+service,'--build-arg','GIT_SHA='+sha,'--build-arg','DEPLOY_ENV='+env]
            # Explicit one-release user request; production always keeps full tests.
            skip = sha if env == 'staging' and os.environ.get('DARTSPOINT_SKIP_TESTS_ONCE_SHA') == sha else ''
            args += ['--build-arg','SKIP_TESTS_ONCE_SHA='+skip]
            for k, v in public.items(): args += ['--build-arg',k+'='+v]
            subprocess.run(args+['.'], check=True)
            images[service] = image+'@'+json.loads(metadata.read_text())['containerimage.digest']
    manifest = {'version':1,'environment':env,'sha':sha,'run':run,'attempt':attempt,'repository':REPOSITORY,'workflow':'.github/workflows/deploy.yml','platform':'linux/amd64','public':public,'pins':pins,'images':images,'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    validate_manifest(manifest, env, pins)
    Path('release-manifest').mkdir(mode=0o700)
    Path('release-manifest/release.json').write_text(json.dumps(manifest,indent=2)+'\n')

if __name__ == '__main__': main()
