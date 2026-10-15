import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {supportClamScan} from '../../packages/data/src/support-attachments';
assert.equal(process.env.APP_ENV,'development');
const pins=JSON.parse(await readFile(new URL('../../ops/image-pins.json',import.meta.url),'utf8')),name='dartspoint-support-scan-test-'+randomUUID().slice(0,8),network=name+'-private';
const run=(args:string[])=>{const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:1024*1024});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();};
const compose=JSON.parse(spawnSync('python3',['-c',"import yaml,json;print(json.dumps(yaml.safe_load(open('ops/compose.target.yml'))['services']['clamav']))"],{encoding:'utf8'}).stdout);
let started=false,networkCreated=false;
try{
 run(['network','create',network]);networkCreated=true;
 run(['run','-d','--name',name,'--network',network,'--publish','127.0.0.1::3310','--memory','3g','--cpus','0.5','--pids-limit','128','--user',compose.user,'--cap-drop','ALL','--security-opt','no-new-privileges:true','--entrypoint','/bin/sh',pins.CLAMAV_IMAGE,...compose.command]);started=true;
 const info=JSON.parse(run(['inspect',name]))[0],binding=info.NetworkSettings.Ports['3310/tcp']?.[0];if(!binding)throw new Error(run(['logs',name]));assert.equal(binding.HostIp,'127.0.0.1');if(!info.State.Running)throw new Error(run(['logs',name]));assert.equal(info.HostConfig.Memory,3*1024**3);assert.equal(info.Config.User,'100:101');process.env.CLAMAV_HOST='127.0.0.1';process.env.CLAMAV_PORT=binding.HostPort;
 const deadline=Date.now()+180000;let ready=false;while(Date.now()<deadline){try{ready=await supportClamScan(Buffer.from('DartsPoint schone scannercontrole.'));if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}assert.ok(ready,'Real pinned clamd must load its signatures and scan successfully');
 const eicar=Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');assert.equal(await supportClamScan(eicar),false,'Real scanner must detect the standard harmless EICAR test signature');
 const acceptance=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','tests/integration/support.ts'],{encoding:'utf8',maxBuffer:1024*1024,env:{...process.env,SUPPORT_REAL_SCANNER:'1'}});assert.equal(acceptance.status,0,acceptance.stdout+acceptance.stderr);process.stdout.write(acceptance.stdout);
 console.log(JSON.stringify({event:'support_real_scanner_passed',image:pins.CLAMAV_IMAGE,cleanPassed:true,eicarRejected:true,applicationQuarantineVerified:true,publicPort:false,memoryBytes:info.HostConfig.Memory}));
}catch(error){if(started)console.error(run(['logs',name]));throw error;}finally{if(started)run(['rm','-f','-v',name]);if(networkCreated)run(['network','rm',network]);}
