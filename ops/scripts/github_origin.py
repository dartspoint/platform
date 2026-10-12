"""Validate the public manifest against this repository's actual hosted run."""
import json, urllib.request
from deployment_config import REPOSITORY, scalar

def get(path, token):
    request = urllib.request.Request('https://api.github.com/repos/'+REPOSITORY+'/'+path,
        headers={'Authorization':'Bearer '+scalar(token),'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)

def verify(manifest, token):
    run = get('actions/runs/'+manifest['run'], token)
    if (run.get('event') != 'push' or run.get('head_sha') != manifest['sha'] or run.get('head_branch') != manifest['environment']
        or run.get('run_attempt') != int(manifest['attempt']) or run.get('path') != '.github/workflows/deploy.yml'
        or run.get('head_repository', {}).get('full_name') != REPOSITORY):
        raise ValueError('Build does not originate from the allowed deployment workflow')
    jobs = get('actions/runs/'+manifest['run']+'/attempts/'+manifest['attempt']+'/jobs?per_page=100', token)['jobs']
    successful = {job['name'] for job in jobs if job['conclusion'] == 'success'}
    if not {'Verify / verify','Publish images'} <= successful:
        raise ValueError('Hosted acceptance and image publication must finish successfully')
    ref = get('git/ref/heads/'+manifest['environment'], token)
    if ref['object']['sha'] != manifest['sha']:
        raise ValueError('Delayed deployment no longer matches the environment branch')
    return scalar(run['actor']['login'])
