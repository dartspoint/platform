#!/usr/bin/env python3
"""Actual isolated Caddy routing against the built web release; no live config changes."""
import json, os, ssl, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
TOOLS=Path(os.environ['DARTSPOINT_QA_TOOLS'])
with tempfile.TemporaryDirectory(prefix='dartspoint-landing-proxy-') as directory:
    folder=Path(directory)
    template=(ROOT/'ops/Caddyfile.landing.template').read_text().replace('__LANDING_HOST__','https://127.0.0.1:49444').replace('127.0.0.1:3001','127.0.0.1:4300')
    template=template.replace('https://127.0.0.1:49444 {','https://127.0.0.1:49444 {\n    bind 127.0.0.1\n    tls internal')
    config=folder/'Caddyfile';config.write_text('{\n admin off\n auto_https disable_redirects\n skip_install_trust\n}\n'+template)
    env={**os.environ,'XDG_DATA_HOME':str(folder/'data'),'XDG_CONFIG_HOME':str(folder/'config')}
    with (folder/'private.log').open('wb') as log:
        caddy=subprocess.Popen([str(TOOLS/'caddy'),'run','--config',str(config),'--adapter','caddyfile'],env=env,stdout=log,stderr=subprocess.STDOUT)
        try:
            ca=folder/'data/caddy/pki/authorities/local/root.crt'
            for _ in range(60):
                if ca.exists():break
                time.sleep(.1)
            ctx=ssl.create_default_context(cafile=str(ca));results=[]
            def request(method,path,status,body=None,origin='http://127.0.0.1:4300'):
                req=urllib.request.Request('https://127.0.0.1:49444'+path,data=body,headers={'Origin':origin,'Content-Type':'application/json'},method=method)
                try:
                    with urllib.request.urlopen(req,context=ctx,timeout=15) as response: actual=response.status;data=response.read()
                except urllib.error.HTTPError as error:actual=error.code;data=error.read()
                if actual!=status:raise RuntimeError(f'Landing routing {method} {path}: expected {status}, received {actual}')
                results.append({'method':method,'path':path,'status':actual});return data
            assert b'unsubscribeToken' in request('GET','/?afmelden='+'a'*43,200)
            request('HEAD','/',200)
            for path in ['/lobby','/spelen','/beheer','/readyz','/_next/static/app.js','/landing/index.html','/api/platform/bootstrap','/api/platform/auth/otp','/internal/deploy/status','/matchmake/joinOrCreate/match','/api/launch-signups','/api/launch-unsubscribe']:
                request('GET',path,404)
            for method,path in [('POST','/'),('OPTIONS','/api/launch-signups'),('PUT','/api/launch-signups'),('POST','/api/platform/onboard'),('POST','/api/launch-signups/extra')]:request(method,path,404,b'{}')
            request('POST','/api/launch-signups',400,b'{}')
            request('POST','/api/launch-signups',403,b'{}','https://evil.test')
            request('POST','/api/launch-unsubscribe',200,json.dumps({'token':'a'*43}).encode())
            (ROOT/'artifacts/landing-proxy-result.json').write_text(json.dumps({'ok':True,'queryPreserved':True,'routeMatrix':results},indent=2))
            print('Public landing Caddy host exposes only root and two exact POST endpoints')
        finally:caddy.terminate();caddy.wait(timeout=15)
