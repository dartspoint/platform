/** Runs inside the final pinned image with no network or service credentials. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,readdir,stat,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const directory='/var/log/dartspoint',uid=process.getuid();
assert.equal(uid,1000,'Runtime smoke must use the production node user');
const permissions=await stat(directory);
assert.equal(permissions.uid,uid);assert.equal(permissions.mode&0o777,0o700);
assert.deepEqual(await readdir(directory),[],'Smoke needs its own empty log directory');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVCkAAAAASUVORK5CYII=','base64');
const metadata=await sharp(png,{failOn:'warning'}).metadata();
assert.equal(metadata.format,'png');assert.equal(metadata.width,1);assert.equal(metadata.height,1);

// The actual entrypoint must finish its imports and enter its heartbeat/loop.
// Missing service configuration deliberately prevents all provider/DB access.
const child=spawn(process.execPath,[fileURLToPath(new URL('../retained-log.mjs',import.meta.url)),
 'support',process.execPath,fileURLToPath(new URL('./support-worker.mjs',import.meta.url))],
 {cwd:'/app',env:{PATH:'/usr/local/bin:/usr/bin:/bin',NODE_ENV:'production',DARTSPOINT_LOG_DIR:directory},stdio:['ignore','pipe','pipe']});
let exited=false,stderr='';child.stderr.on('data',bytes=>{stderr+=bytes.toString();});
const completion=new Promise(resolve=>child.once('close',code=>{exited=true;resolve(code);}));
let imported=false;
try{
 for(let attempt=0;attempt<120&&!exited;attempt++){
  const files=await readdir(directory);
  const body=(await Promise.all(files.map(file=>readFile(directory+'/'+file,'utf8')))).join('\n');
  if(body.includes('support_worker_heartbeat_failed')&&body.includes('support_worker_tick_failed')){imported=true;break;}
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 assert.equal(imported,true,'The packaged support entrypoint failed before its heartbeat/loop');
 assert.equal(stderr,'','The retained logger failed to start');
 for(const file of await readdir(directory))assert.equal((await stat(directory+'/'+file)).mode&0o777,0o600);
}finally{
 child.kill('SIGTERM');
 let timer;const stopped=await Promise.race([completion.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),3000);})]);
 clearTimeout(timer);if(!stopped){child.kill('SIGKILL');await completion;}
 // Remove only this smoke's private partitions; none enter the image layers.
 for(const file of await readdir(directory)){assert.match(file,/^support-\d{4}-\d{2}-\d{2}\.log$/);await unlink(directory+'/'+file);}
}
console.log(JSON.stringify({workerRuntimeVerified:true,pngMetadataVerified:true,supportEntrypointImported:true,runtimeUid:uid,privateLogModeVerified:true}));
