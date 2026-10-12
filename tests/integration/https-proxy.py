#!/usr/bin/env python3
"""Real Caddy HTTPS + native Colyseus fixture; no live DNS/ACME or trust changes."""
import json, os, ssl, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
TOOLS=Path(os.environ['DARTSPOINT_QA_TOOLS'])
os.umask(0o077)

def main():
    with tempfile.TemporaryDirectory(prefix='dartspoint-https-') as directory:
        folder=Path(directory);config=folder/'Caddyfile'
        config.write_text('''{
    admin off
    auto_https disable_redirects
    skip_install_trust
}
https://127.0.0.1:49443 {
    bind 127.0.0.1
    tls internal
    @internal path /internal /internal/*
    respond @internal 404
    @wrong_origin {
        header Origin *
        not header Origin https://dartspoint.nl
    }
    respond @wrong_origin 403
    reverse_proxy 127.0.0.1:42567 {
        stream_close_delay 5m
    }
}
''')
        env={**os.environ,'XDG_DATA_HOME':str(folder/'data'),'XDG_CONFIG_HOME':str(folder/'config')}
        with (folder/'private.log').open('wb') as log:
            caddy=subprocess.Popen([str(TOOLS/'caddy'),'run','--config',str(config),'--adapter','caddyfile'],env=env,stdout=log,stderr=subprocess.STDOUT)
            try:
                ca=folder/'data/caddy/pki/authorities/local/root.crt'
                for _ in range(50):
                    try:
                        context=ssl.create_default_context(cafile=str(ca))
                        with urllib.request.urlopen('https://127.0.0.1:49443/readyz',context=context,timeout=2) as response:
                            if json.load(response).get('ok') is True:break
                    except Exception:time.sleep(.1)
                else:raise RuntimeError('Disposable HTTPS proxy did not become ready')
                for path,headers,status in (('/internal/deploy/status',{},404),('/readyz',{'Origin':'https://staging.dartspoint.nl'},403),('/readyz',{'Origin':'https://dartspoint.nl'},200)):
                    request=urllib.request.Request('https://127.0.0.1:49443'+path,headers=headers)
                    try:
                        with urllib.request.urlopen(request,context=context,timeout=5) as response: actual=response.status
                    except urllib.error.HTTPError as error:actual=error.code
                    if actual!=status:raise RuntimeError('Caddy route/origin/control protection failed')
                try:
                    result=subprocess.run(['node','--env-file=.env.local','--import','tsx','tests/integration/https-realtime.ts'],cwd=ROOT,env={**os.environ,'NODE_EXTRA_CA_CERTS':str(ca)},stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
                except subprocess.TimeoutExpired as error:
                    private=ROOT/'artifacts/https-sdk-private.log';private.write_bytes((error.stdout or b'')+(error.stderr or b''));private.chmod(0o600)
                    raise RuntimeError('HTTPS SDK fixture timed out')
                private=ROOT/'artifacts/https-sdk-private.log';private.write_bytes(result.stdout+result.stderr);private.chmod(0o600)
                if result.returncode:raise RuntimeError('Real HTTPS authentication/matchmaking/reconnect fixture failed')
                print('Real Caddy HTTPS, protected internal paths/origins, authenticated Colyseus matchmaking/WebSocket/reconnect passed')
                (ROOT/'artifacts/https-proxy-result.json').write_text(json.dumps({'ok':True,'HTTPSCertificateVerified':True,'internalPathsBlocked':True,'wrongOriginBlocked':True,'realAuthenticatedMatchmakingWebSocketReconnect':True,'liveDNSAndACMETested':False},indent=2))
            finally:
                caddy.terminate()
                try:caddy.wait(timeout=10)
                except subprocess.TimeoutExpired:caddy.kill();caddy.wait()

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('Disposable HTTPS acceptance failed: '+(str(error) if isinstance(error,RuntimeError) else type(error).__name__),file=sys.stderr);sys.exit(1)
