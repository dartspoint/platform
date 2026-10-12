#!/usr/bin/env python3
"""Build all three production images and run them against owned local QA services."""
import json, os, subprocess, time, urllib.request
from pathlib import Path
root=Path.cwd();artifacts=root/'artifacts';artifacts.mkdir(exist_ok=True);os.umask(0o077)
values=dict(line.split('=',1) for line in (root/'.env.local').read_text().splitlines() if line and not line.startswith('#'))
values.update(NEXT_PUBLIC_APP_URL='http://127.0.0.1:4302',NEXT_PUBLIC_REALTIME_URL='ws://127.0.0.1:42569',RELEASE_SHA='container-acceptance',WORKER_ID='container-acceptance',BIND_HOST='0.0.0.0',REALTIME_HEALTH_URL='http://dartspoint-acceptance-realtime:2567',NODE_OPTIONS='--import=/tmp/local-test-proxy.mjs')
public=[key for key in values if key.startswith('NEXT_PUBLIC_')];pins=json.loads((root/'ops/image-pins.json').read_text());build_env={**os.environ,**{key:values[key] for key in public},'NODE_IMAGE':pins['NODE_IMAGE']}
network='supabase_network_dartspoint-development';names=['dartspoint-acceptance-'+s for s in ('worker','realtime','web')]
proxy=artifacts/'local-test-proxy.mjs';proxy.write_text("""// QA-only transport: loopback URLs keep the real local Auth issuer intact.
import http from 'node:http';import net from 'node:net';
for(const [port,host,target] of [[62422,'supabase_db_dartspoint-development',5432],[62479,'dartspoint-development-redis',6379]])net.createServer(socket=>{const upstream=net.connect(target,host);socket.pipe(upstream).pipe(socket);upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());}).listen(port,'127.0.0.1');
for(const [port,host,target] of [[62421,'supabase_kong_dartspoint-development',8000],[62424,'supabase_inbucket_dartspoint-development',8025]])http.createServer((request,response)=>{const upstream=http.request({host,port:target,path:request.url,method:request.method,headers:request.headers},result=>{response.writeHead(result.statusCode,result.headers);result.pipe(response);});upstream.on('error',()=>{response.writeHead(503);response.end();});request.pipe(upstream);}).listen(port,'127.0.0.1');
""")
proxy.chmod(0o644)
envfile=artifacts/'container-private.env';envfile.write_text('\n'.join(key+'='+value for key,value in values.items())+'\n');envfile.chmod(0o600)
log=artifacts/'container-build-private.log'
def docker(args,timeout=300):
    r=subprocess.run(['docker',*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    if r.returncode:raise RuntimeError('Container acceptance command failed; inspect private diagnostics')
    return r.stdout.decode().strip()
try:
    with log.open('wb') as output:
        for service in ('worker','realtime','web'):
            print('Building production image: '+service,flush=True)
            args=['docker','build','--file','ops/Dockerfile.target','--build-arg','NODE_IMAGE','--build-arg','SERVICE='+service,'--build-arg','GIT_SHA=container-acceptance','--build-arg','DEPLOY_ENV=development',*[item for key in public for item in ('--build-arg',key)],'--tag','dartspoint-local-'+service+':test','.']
            r=subprocess.run(args,env=build_env,stdout=output,stderr=subprocess.STDOUT)
            if r.returncode:raise RuntimeError('Production image build failed; inspect private build log')
    log.chmod(0o600)
    connected=subprocess.run(['docker','network','connect',network,'dartspoint-development-redis'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
    for service in ('worker','realtime','web'):
        ports=['--publish','127.0.0.1:4302:3000'] if service=='web' else ['--publish','127.0.0.1:42569:2567'] if service=='realtime' else []
        docker(['run','-d','--name','dartspoint-acceptance-'+service,'--network',network,'--env-file',str(envfile),'--env','PORT='+('3000' if service=='web' else '2567'),'--mount','type=bind,source='+str(proxy)+',target=/tmp/local-test-proxy.mjs,readonly',*ports,'dartspoint-local-'+service+':test'])
    for attempt in range(90):
        try:
            for port in (4302,42569):
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/readyz',timeout=3) as response:status=json.load(response)
                if status!={'ok':True,'release':'container-acceptance'}:raise RuntimeError('Wrong image release/readiness')
            break
        except Exception:time.sleep(1)
    else:raise RuntimeError('Production containers did not become ready')
    docker(['exec','--env','NODE_OPTIONS=','dartspoint-acceptance-worker','node','scripts/health.mjs'])
    control="fetch('http://127.0.0.1:2567/internal/deploy/status',{headers:{Authorization:'Bearer '+process.env.INTERNAL_DEPLOY_TOKEN}}).then(async r=>{if(!r.ok)process.exit(1);const s=await r.json();console.log(JSON.stringify({protectedControlWorks:typeof s.activeMatches==='number'}));}).catch(()=>process.exit(1))"
    assert json.loads(docker(['exec','--env','NODE_OPTIONS=','dartspoint-acceptance-realtime','node','-e',control]))['protectedControlWorks']
    with urllib.request.urlopen('http://127.0.0.1:4302',timeout=10) as response:assert response.status==200
    with urllib.request.urlopen('http://127.0.0.1:4302/inloggen',timeout=10) as response:assert response.status==200
    # Export/list rather than inspect container environments containing credentials.
    for service in ('worker','realtime','web'):
        docker(['exec','--env','NODE_OPTIONS=','dartspoint-acceptance-'+service,'node','-e',"const f=require('fs');if(f.existsSync('/app/.env')||f.existsSync('/app/.env.local')||f.existsSync('/app/reference'))process.exit(1);if(process.getuid()===0)process.exit(1);"])
    (artifacts/'containers-result.json').write_text(json.dumps({'ok':True,'threeProductionImagesBuilt':True,'webAndRealtimeSameRelease':True,'realDatabaseRedisWorkerReadiness':True,'workerHealth':True,'loopbackControlInsideContainer':True,'productionPagesRender':True,'nonRootRuntime':True,'noEnvOrReferenceInImages':True},indent=2))
    print('Three standalone production images, real readiness and private control passed',flush=True)
finally:
    for name in names:
        output=subprocess.run(['docker','logs','--tail','30',name],stdout=subprocess.PIPE,stderr=subprocess.STDOUT).stdout
        (artifacts/(name+'-private.log')).write_bytes(output)
    for name in names:subprocess.run(['docker','rm','--force',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if 'connected' in locals() and connected:subprocess.run(['docker','network','disconnect',network,'dartspoint-development-redis'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    envfile.unlink(missing_ok=True)
