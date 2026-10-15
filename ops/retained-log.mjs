#!/usr/bin/env node
/** Private bounded UTC partitions; Docker never retains a second copy of application output. */
import {spawn} from 'node:child_process';
import {constants} from 'node:fs';
import {constants as osConstants} from 'node:os';
import * as fs from 'node:fs/promises';
import {join} from 'node:path';
import {Writable} from 'node:stream';
import {StringDecoder} from 'node:string_decoder';
const directory=process.env.DARTSPOINT_LOG_DIR??'/var/log/dartspoint';
const services=new Set(['web','realtime','worker','support']),maximumBytes=2*1024*1024,maximumLine=16384;
const uid=process.getuid();
async function privateDirectory(){await fs.mkdir(directory,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});const info=await fs.lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==uid||(info.mode&0o077))throw new Error('private_log_directory_required');}
async function prune(){await privateDirectory();const cutoff=Date.now()-28*86400000;let removed=0;for(const name of await fs.readdir(directory)){const match=/^(web|realtime|worker|support)-(\d{4}-\d{2}-\d{2})\.log$/.exec(name);if(!match)continue;const date=Date.parse(match[2]+'T00:00:00Z');if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==match[2]||date>=cutoff)continue;const path=join(directory,name),info=await fs.lstat(path);if(info.isFile()&&!info.isSymbolicLink()&&info.uid===uid&&info.nlink===1&&!(info.mode&0o077)){await fs.unlink(path);removed++;}}return removed;}
async function run(){
 await privateDirectory();const removed=await prune();
 if(process.argv[2]==='--prune'){process.stdout.write(JSON.stringify({removedLogPartitions:removed,pruneAfterDays:28,maximumRetentionDays:30})+'\n');return;}
 const service=process.argv[2],command=process.argv[3],args=process.argv.slice(4);if(!services.has(service)||!command)throw new Error('invalid_log_launcher_command');
 let failed=false,queue=Promise.resolve(),dateKey='',written=0,limited=false;
 const child=spawn(command,args,{stdio:['inherit','pipe','pipe'],env:process.env});
 const fatal=()=>{if(failed)return;failed=true;process.stderr.write('retained_log_failed\n');child.kill('SIGTERM');};
 function append(stream,text){queue=queue.then(async()=>{if(failed)return;const now=new Date(),day=now.toISOString().slice(0,10),path=join(directory,service+'-'+day+'.log');const file=await fs.open(path,constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW,0o600);try{const info=await file.stat();if(!info.isFile()||info.uid!==uid||info.nlink!==1||(info.mode&0o077)||info.size>maximumBytes)throw new Error('private_log_file_required');if(dateKey!==day){dateKey=day;limited=false;}written=info.size;let record=JSON.stringify({at:now.toISOString(),service,stream,text})+'\n';if(Buffer.byteLength(record)>maximumBytes-written){if(limited)return;limited=true;record=JSON.stringify({at:now.toISOString(),service,event:'daily_log_limit'})+'\n';if(Buffer.byteLength(record)>maximumBytes-written)return;}await file.write(record);}finally{await file.close();}}).catch(fatal);return queue;}
 function sink(stream){const decoder=new StringDecoder('utf8');let pending='';return new Writable({write(chunk,_encoding,done){pending+=decoder.write(chunk);const records=[];for(;;){const newline=pending.indexOf('\n');if(newline>=0&&newline<=maximumLine){records.push(pending.slice(0,newline));pending=pending.slice(newline+1);}else if(pending.length>maximumLine){records.push(pending.slice(0,maximumLine));pending=pending.slice(maximumLine);}else break;}Promise.all(records.map(text=>append(stream,text))).then(()=>done(),()=>done(new Error('retained_log_failed')));},final(done){pending+=decoder.end();(pending?append(stream,pending):queue).then(()=>done(),()=>done(new Error('retained_log_failed')));}}).on('error',fatal);}
 const stdout=sink('stdout'),stderr=sink('stderr');child.stdout.pipe(stdout);child.stderr.pipe(stderr);
 const interval=setInterval(()=>{prune().catch(fatal);},3600000);interval.unref();
 for(const signal of ['SIGTERM','SIGINT','SIGHUP'])process.on(signal,()=>child.kill(signal));
 child.on('error',fatal);
 const result=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
 await queue;clearInterval(interval);if(failed)process.exitCode=1;else if(result.code!==null)process.exitCode=result.code;else process.exitCode=128+(osConstants.signals[result.signal]??1);
}
run().catch(()=>{process.stderr.write('retained_log_start_failed\n');process.exitCode=78;});
