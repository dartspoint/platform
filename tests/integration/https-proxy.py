#!/usr/bin/env python3
"""Real Caddy HTTPS + native Colyseus fixture; no live DNS/ACME or trust changes."""
import json, math, os, ssl, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
TOOLS=Path(os.environ['DARTSPOINT_QA_TOOLS'])
os.umask(0o077)
PHASES={'auth_actor_0','auth_actor_1','create_room','join_room_0','join_room_1','create_invite','accept_invite','invalid_join','join_seat_0','join_seat_1','ready_seat_0','ready_seat_1','verify_playing','drop_seat_0','reconnect_seat_0','forfeit_seat_1','verify_completed','cleanup_room_0','cleanup_room_1','cleanup_room_2','cleanup_reservations','cleanup_match','cleanup_database','cleanup_redis'}
CATEGORIES={'assertion_failed','operation_failed','phase_timeout','cleanup_timeout','cleanup_failed','metadata_write_failed'}

def child_diagnostic(elapsed,stdout=b''):
    """Only fixed labels and finite timings may reach hosted stdout."""
    safe={'event':'https_sdk_failure_diagnostic','phase':'unavailable','status':'unavailable','recordCount':0,'elapsedMs':round(elapsed*1000),'records':[]}
    # This exact constant event remains available when the metadata file cannot
    # be written. Never forward arbitrary child stdout or exception messages.
    if b'{"event":"https_sdk_metadata_failure","errorCategory":"metadata_write_failed"}' in stdout.splitlines():
        safe['metadataFailure']='metadata_write_failed'
    path=ROOT/'artifacts/https-sdk-progress.json'
    try:
        data=json.loads(path.read_text())
        records=data.get('records',[])
        if not isinstance(records,list) or len(records)>64:return safe
        for row in records:
            if not isinstance(row,dict) or row.get('phase') not in PHASES or row.get('status') not in {'started','done','failed'}:return safe
            duration=row.get('elapsedMs')
            if isinstance(duration,bool) or not isinstance(duration,(int,float)) or not math.isfinite(duration) or duration<0:return safe
            record={key:row[key] for key in ('phase','status','elapsedMs')}
            if 'errorCategory' in row:
                if row['errorCategory'] not in CATEGORIES:return safe
                record['errorCategory']=row['errorCategory']
            safe['records'].append(record)
        safe['recordCount']=len(safe['records'])
        if safe['records']:safe.update({key:safe['records'][-1][key] for key in ('phase','status')})
        if data.get('originalFailure') in CATEGORIES:safe['originalFailure']=data['originalFailure']
        failures=data.get('cleanupFailures',[])
        if isinstance(failures,list) and len(failures)<=24 and all(isinstance(row,dict) and row.get('phase') in PHASES and row.get('errorCategory') in CATEGORIES for row in failures):
            safe['cleanupFailures']=[{key:row[key] for key in ('phase','errorCategory')} for row in failures]
    except (OSError,ValueError,TypeError):pass
    return safe

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
                progress=ROOT/'artifacts/https-sdk-progress.json'
                if progress.exists():progress.replace(ROOT/'artifacts'/('https-sdk-progress-previous-'+str(time.time_ns())+'.json'))
                started=time.monotonic()
                try:
                    result=subprocess.run(['node','--env-file=.env.local','--import','tsx','tests/integration/https-realtime.ts'],cwd=ROOT,env={**os.environ,'NODE_EXTRA_CA_CERTS':str(ca)},stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
                except subprocess.TimeoutExpired as error:
                    private=ROOT/'artifacts/https-sdk-private.log';private.write_bytes((error.stdout or b'')+(error.stderr or b''));private.chmod(0o600)
                    diagnostic=child_diagnostic(time.monotonic()-started,error.stdout or b'');print(json.dumps(diagnostic),flush=True)
                    raise RuntimeError('HTTPS SDK fixture timed out; phase='+diagnostic['phase']+' status='+diagnostic['status']+' records='+str(diagnostic['recordCount'])+' elapsedMs='+str(diagnostic['elapsedMs']))
                private=ROOT/'artifacts/https-sdk-private.log';private.write_bytes(result.stdout+result.stderr);private.chmod(0o600)
                if result.returncode:
                    diagnostic=child_diagnostic(time.monotonic()-started,result.stdout);print(json.dumps(diagnostic),flush=True)
                    raise RuntimeError('Real HTTPS authentication/matchmaking/reconnect fixture failed; phase='+diagnostic['phase']+' status='+diagnostic['status'])
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
