import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
await access(new URL('../.env.local',import.meta.url));
const children=[spawn('npm',['run','dev:web'],{stdio:'inherit',detached:true}),...['apps/realtime/src/server.ts','apps/worker/src/worker.ts','apps/worker/src/support-worker.ts'].map(file=>spawn(process.execPath,['--env-file=.env.local','node_modules/tsx/dist/cli.mjs',file],{stdio:'inherit',detached:true}))];
let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const child of children){try{process.kill(-child.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}} }
process.on('SIGINT',stop);process.on('SIGTERM',stop);for(const child of children)child.on('exit',code=>{if(!stopping&&code){process.exitCode=code;stop();}});
const ready=spawn(process.execPath,['--env-file=.env.local','scripts/wait-local.mjs'],{stdio:'inherit',detached:true});children.push(ready);ready.on('exit',code=>{if(code){process.exitCode=code;stop();}});
