#!/usr/bin/env python3
"""One-off admin staging acceptance. Carries a public key; no plaintext tokens."""
import base64, gzip, hashlib, json, os, pwd, re, subprocess, urllib.request
from pathlib import Path

PUBLIC_REQUEST=__PUBLIC_REQUEST__
BOOTSTRAP='__BOOTSTRAP_B64__'
BOOTSTRAP_SHA='__BOOTSTRAP_SHA__'
CALLBACK='__CALLBACK__'


def main():
    if os.geteuid()!=0: raise RuntimeError('Administrator execution required')
    os.umask(0o077)
    code=gzip.decompress(base64.b64decode(BOOTSTRAP,validate=True))
    if hashlib.sha256(code).hexdigest()!=BOOTSTRAP_SHA: raise RuntimeError('Bootstrap checksum mismatch')
    app=pwd.getpwnam('dartspoint-staging')
    release=Path('/srv/dartspoint/staging/current').resolve(strict=True)
    if not re.fullmatch(r'/srv/dartspoint/staging/releases/[a-f0-9]{40}-[0-9]+-[0-9]+',str(release)):
        raise RuntimeError('Unexpected staging release path')
    identity=json.loads((release/'release.json').read_text())
    if identity['environment']!='staging': raise RuntimeError('Staging only')
    env={'PATH':'/usr/bin:/bin','HOME':app.pw_dir,'USER':app.pw_name,'LOGNAME':app.pw_name,
         'LANG':'C.UTF-8','XDG_RUNTIME_DIR':f'/run/user/{app.pw_uid}',
         'DOCKER_HOST':f'unix:///run/user/{app.pw_uid}/docker.sock'}
    args=['docker','compose','--env-file',str(release/'deploy.env'),'-f','/etc/dartspoint/staging/compose.yml',
          'exec','-T','-e','DP_FIXTURE_PUBLIC_KEY='+PUBLIC_REQUEST,'worker','node','--input-type=module']
    result=subprocess.run(args,input=code,stdout=subprocess.PIPE,stderr=subprocess.PIPE,cwd=release,
                          env=env,user=app.pw_uid,group=app.pw_gid,timeout=90)
    if result.returncode: raise RuntimeError('Staging fixture failed; no credentials displayed')
    sealed=json.loads(result.stdout)
    if sealed.get('version')!=1 or not isinstance(sealed.get('ciphertext'),str): raise RuntimeError('Invalid sealed result')
    payload=json.dumps(sealed).encode()
    if len(payload)>65536: raise RuntimeError('Unexpected sealed size')
    req=urllib.request.Request(CALLBACK,data=payload,headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=15) as response:
        if response.status!=201: raise RuntimeError('Sealed transfer failed')
    print('Two separate staging player fixtures ready; no email sent')
    print('Encrypted browser sessions transferred; app credentials stayed on the VPS')
    print('Current release: '+identity['sha'])


if __name__=='__main__': main()
