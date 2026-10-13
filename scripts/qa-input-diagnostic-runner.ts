/** Separate, encrypted-only QA investigation; never a normal acceptance result. */
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chmod,lstat,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,type Browser,type BrowserContext,type Page,type APIResponse} from '@playwright/test';
import {forfeitGame} from '../tests/e2e/game-command';

const root=process.cwd(),privateDirectory=resolve(root,'artifacts/qa-input-diagnostic/private');
const sandbox=join(privateDirectory,'sandbox'),reportPath=join(privateDirectory,'runner-report.json');
const normalArtifacts=join(root,'artifacts'),fixturePath=join(root,'tests/e2e/game-timing.ts');
const sourcePaths=[
 'tests/e2e/game-timing.ts','tests/e2e/helpers.ts','tests/e2e/game-command.ts',
 'tests/e2e/throw-performance-profile.ts','tests/e2e/throw-presentation-profile.ts',
 'apps/web/components/darts-game.tsx','apps/web/components/darts-practice.tsx',
 'apps/web/lib/use-server-game.ts','apps/web/lib/drawn-meter.ts','apps/web/lib/use-timing-input.ts',
];
const cleanupAccess=new AsyncLocalStorage<boolean>();
const creationFlights=new Set<Promise<APIResponse>>(),pages:Page[]=[];
const pendingInvitations=new Map<string,Page>(),ownedMatches=new Map<string,Page>();
const clockRecords:Record<string,number|boolean>[]=[];
const hookedPages=new WeakSet<Page>(),hookedRequests=new WeakSet<object>();
const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
let browser:Browser|undefined,browserLaunchFlight:Promise<Browser>|undefined,nativeBrowserClose:(()=>Promise<void>)|undefined;
let interrupted=false,ambiguousCreation=false,clockDropped=0,reportWritable=false;
let cleanupTask:Promise<void>|undefined;
const report:any={schemaVersion:1,diagnostic:true,neverNormalAcceptance:true,
 physicalHardwareTested:false,normalOriginalExitCode:null,diagnosticExitCode:1,
 normalArtifactsUnchanged:false,interrupted:false,manualReviewRequired:false,
 cleanup:{attempted:false,ownedMatches:0,ownedMatchesReleased:0,pendingInvitationsCancelled:0,ok:false}};

function sha(bytes:Buffer){return createHash('sha256').update(bytes).digest('hex');}
function fail(category:string):never{throw new Error(category);}
async function bounded<T>(operation:Promise<T>,milliseconds:number,category:string):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(category)),milliseconds);})]);}
 finally{if(timer)clearTimeout(timer);}
}
async function save(path:string,data:unknown){await writeFile(path,JSON.stringify(data,null,2)+'\n',{mode:0o600});await chmod(path,0o600);}
async function regular(path:string){const metadata=await lstat(path);assert.ok(metadata.isFile()&&!metadata.isSymbolicLink()&&metadata.nlink===1,'diagnostic_artifact_not_regular');return metadata;}
async function normalSnapshot(){
 const result:{relativePath:string;sha256:string;bytes:number}[]=[];
 async function visit(path:string){const metadata=await lstat(path);assert.ok(!metadata.isSymbolicLink(),'normal_artifact_symlink');
  if(metadata.isDirectory()){for(const name of(await readdir(path)).sort())await visit(join(path,name));return;}
  await regular(path);const bytes=await readFile(path);result.push({relativePath:relative(normalArtifacts,path),sha256:sha(bytes),bytes:bytes.byteLength});
 }
 for(const name of(await readdir(normalArtifacts)).sort())if(name.startsWith('game-timing-'))await visit(join(normalArtifacts,name));
 return result;
}
function allowed(){if(interrupted&&!cleanupAccess.getStore())fail('diagnostic_interrupted');}
function recordClock(page:Page,data:unknown){
 if(!data||typeof data!=='object')fail('diagnostic_clock_record_invalid');
 const expected=['kind','timeOrigin','observedAt','wallClockAt','wallClockObservedAt','eventTimeStamp','isTrusted','pointerType'];
 const value=data as Record<string,unknown>;assert.deepEqual(Object.keys(value).sort(),expected.sort());
 for(const [key,item]of Object.entries(value))assert.ok(key==='isTrusted'?typeof item==='boolean':typeof item==='number'&&Number.isFinite(item),'diagnostic_clock_record_invalid');
 if(clockRecords.length>=128){clockDropped++;return;}
 clockRecords.push({pageIndex:pages.indexOf(page),...(value as Record<string,number|boolean>)});
}
function guardedLocator(locator:any){
 for(const method of['click','tap','press']){const original=locator[method].bind(locator);locator[method]=(...args:unknown[])=>{allowed();return original(...args);};}
 return locator;
}
function hookPage(page:Page){
 if(hookedPages.has(page))return;hookedPages.add(page);pages.push(page);
 for(const method of['getByRole','locator']as const){const original=(page[method]as Function).bind(page);(page as any)[method]=(...args:unknown[])=>guardedLocator(original(...args));}
 const request=page.request;if(hookedRequests.has(request))return;hookedRequests.add(request);
 const original=request.post.bind(request);
 request.post=async(url,options)=>{
  allowed();const path=new URL(url,'http://127.0.0.1:4300').pathname,input=options?.data;
  const creation=path==='/api/platform/invite'||path==='/api/platform/invite/respond'&&(input as any)?.action==='accept';
  const task=(async()=>{
   const response=await original(url,options);
   if(creation&&response.ok()){
    try{const data=await response.json();
     if(path==='/api/platform/invite'){assert.ok(uuid.test(data.id),'diagnostic_invitation_id_invalid');pendingInvitations.set(data.id,page);}
     else{const inviteId=(input as any)?.inviteId;assert.ok(pendingInvitations.has(inviteId)&&uuid.test(data.matchId),'diagnostic_match_identity_invalid');ownedMatches.set(data.matchId,page);pendingInvitations.delete(inviteId);}
    }catch(error){ambiguousCreation=true;throw error;}
   }
   return response;
  })();
  if(creation)creationFlights.add(task);
  try{return await task;}catch(error){if(creation)ambiguousCreation=true;throw error;}finally{creationFlights.delete(task);}
 };
}
async function hookContext(context:BrowserContext){
 await context.exposeBinding('__qaInputClockRecord',({page},data)=>recordClock(page,data));
 await context.addInitScript(()=>{
  const scope=window as any;
  scope.__name=(value:unknown)=>value;
  const record=(kind:number,event?:PointerEvent|KeyboardEvent)=>{
   const observedAt=performance.now(),wallClockAt=Date.now(),wallClockObservedAt=performance.now();
   const data={kind,timeOrigin:performance.timeOrigin,observedAt,wallClockAt,wallClockObservedAt,
    eventTimeStamp:event?.timeStamp??0,isTrusted:event?.isTrusted??false,
    pointerType:event instanceof PointerEvent?(event.pointerType==='touch'?1:event.pointerType==='pen'?2:0):-1};
   performance.mark('qa-input-diagnostic-clock',{detail:data});
   void scope.__qaInputClockRecord(data).catch(()=>{});
  };
  record(0);
  const capture=(event:Event)=>{
   if(!(event.target instanceof Element)||!event.target.closest('.dp-throw-button'))return;
   if(event instanceof PointerEvent){if(!event.isPrimary||event.button!==0)return;record(1,event);}
   else if(event instanceof KeyboardEvent&&['Enter',' '].includes(event.key)&&!event.repeat&&!event.isComposing)record(2,event);
  };
  window.addEventListener('pointerdown',capture,true);window.addEventListener('keydown',capture,true);
  // Only retain the authenticated socket handle, for our match's normal cleanup.
  const send=WebSocket.prototype.send;
  WebSocket.prototype.send=function(data){
   const text=data instanceof ArrayBuffer?new TextDecoder().decode(data):ArrayBuffer.isView(data)?new TextDecoder().decode(data):String(data);
   if(text.includes('command')||text.includes('clock.ping'))scope.__qaGameSocket=this;
   return send.call(this,data);
  };
 });
 context.on('page',hookPage);for(const page of context.pages())hookPage(page);
}
async function cleanupOwned(){
 return cleanupTask??=(async()=>{
  report.cleanup.attempted=true;
  try{
   if(browserLaunchFlight)await bounded(browserLaunchFlight,10000,'diagnostic_browser_launch_cleanup_timeout');
   await bounded(Promise.allSettled([...creationFlights]),10000,'diagnostic_creation_cleanup_timeout');
   if(ambiguousCreation){report.manualReviewRequired=true;fail('diagnostic_creation_identity_uncertain');}
   report.cleanup.ownedMatches=ownedMatches.size;
   await cleanupAccess.run(true,async()=>{
    for(const[id,page]of pendingInvitations){const response=await bounded(page.request.post('http://127.0.0.1:4300/api/platform/invite/respond',{data:{inviteId:id,action:'cancel'}}),4000,'diagnostic_invitation_cleanup_timeout');assert.ok(response.ok(),'diagnostic_invitation_cleanup_failed');report.cleanup.pendingInvitationsCancelled++;}
    for(const[id,page]of ownedMatches){await bounded(forfeitGame(page,id,pages),15000,'diagnostic_forfeit_cleanup_timeout');report.cleanup.ownedMatchesReleased++;}
   });
   report.cleanup.ok=true;
  }catch(error){report.cleanup.category=error instanceof Error&&/^diagnostic_[a-z_]+$/.test(error.message)?error.message:'diagnostic_owned_cleanup_failed';report.manualReviewRequired=true;}
  finally{if(nativeBrowserClose)try{await bounded(nativeBrowserClose(),3000,'diagnostic_browser_close_timeout');}catch{report.cleanup.ok=false;report.cleanup.category='diagnostic_browser_close_failed';}}
 })();
}
function requestStop(){interrupted=true;report.interrupted=true;void cleanupOwned().catch(()=>{report.manualReviewRequired=true;});}

let originalLaunch:typeof chromium.launch|undefined;
try{
 assert.equal(process.env.DARTSPOINT_QA_RUNNER,'true');assert.equal(process.env.DARTSPOINT_QA_INPUT_DIAGNOSTIC,'true');assert.equal(process.env.DARTSPOINT_QA_INPUT_NORMAL_GAME_REACHED,'true');
 assert.equal(root,'/home/runner-qa/actions-runner/_work/platform/platform');assert.equal(process.env.HOME,'/home/runner-qa');
 assert.equal(execFileSync('id',['-un'],{encoding:'utf8'}).trim(),'runner-qa');assert.ok(process.getuid!()>=1000&&process.getuid!()===process.geteuid!());
 assert.equal(process.env.GITHUB_REPOSITORY,'dartspoint/platform');assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.APP_ENV,'development');assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:62421');
 for(const key of['DATABASE_URL','MIGRATION_DATABASE_URL'])assert.equal(new URL(process.env[key]!).hostname,'127.0.0.1');
 assert.equal(process.env.E2E_STAGING_FIXTURE,undefined);assert.equal(process.env.E2E_STAGING_PROXY,undefined);assert.ok(!process.env.E2E_ORIGIN||process.env.E2E_ORIGIN==='http://127.0.0.1:4300');
 const normalExit=Number(process.env.DARTSPOINT_QA_INPUT_NORMAL_EXIT_CODE);assert.ok(process.env.DARTSPOINT_QA_INPUT_NORMAL_EXIT_CODE?.match(/^(?:0|[1-9]\d{0,2})$/)&&Number.isInteger(normalExit)&&normalExit>=0&&normalExit<=255);report.normalOriginalExitCode=normalExit;
 const release=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.match(release,/^[a-f\d]{40}$/);assert.equal(release,process.env.GITHUB_SHA);report.release=release;
 assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}),'');
 report.sourceHashes=[];for(const path of sourcePaths){await regular(join(root,path));const actual=sha(await readFile(join(root,path))),committed=sha(execFileSync('git',['show',release+':'+path]));assert.equal(actual,committed);report.sourceHashes.push({path,sha256:actual,matchesCommit:true});}
 const directory=await lstat(privateDirectory);assert.ok(directory.isDirectory()&&!directory.isSymbolicLink()&&directory.uid===process.getuid!()&&!(directory.mode&0o077));
 process.umask(0o077);
 await writeFile(reportPath,JSON.stringify(report)+'\n',{flag:'wx',mode:0o600});
 reportWritable=true;
 report.normalArtifactsBefore=await normalSnapshot();
 await mkdir(sandbox,{mode:0o700});await mkdir(join(sandbox,'artifacts'),{mode:0o700});
 process.chdir(sandbox);process.env.DARTSPOINT_THROW_PROFILE='1';
 originalLaunch=chromium.launch;
 chromium.launch=options=>{
  allowed();assert.equal(browserLaunchFlight,undefined,'diagnostic_refuses_second_browser');
  return browserLaunchFlight=(async()=>{
  browser=await originalLaunch!.call(chromium,options);nativeBrowserClose=browser.close.bind(browser);
  browser.close=()=>cleanupOwned();
  report.browserMetadata={version:browser.version(),headless:options?.headless===true,channel:options?.channel??'default',physicalHardwareTested:false};
  const nativeContext=browser.newContext.bind(browser);browser.newContext=async options=>{allowed();const context=await nativeContext(options);await hookContext(context);return context;};
  const session=await browser.newBrowserCDPSession();
  try{const{arguments:args}=await session.send('Browser.getBrowserCommandLine');report.browserMetadata.syntheticPointerActionsExplicitlyEnabled=args.some((arg:string)=>arg.startsWith('--enable-features=')&&arg.slice(18).split(',').includes('SyntheticPointerActions'));report.browserMetadata.syntheticPointerActionsExplicitlyDisabled=args.some((arg:string)=>arg.startsWith('--disable-features=')&&arg.slice(19).split(',').includes('SyntheticPointerActions'));report.browserMetadata.fieldTrialConfigDisabled=args.includes('--disable-field-trial-config');}
  finally{await session.detach();}
  return browser;
  })();
 };
 process.on('SIGTERM',requestStop);process.on('SIGINT',requestStop);
 await import(pathToFileURL(fixturePath).href);
 report.diagnosticExitCode=0;
}catch(error){report.diagnosticExitCode=1;report.failureCategory=interrupted?'diagnostic_interrupted':error instanceof Error&&/^diagnostic_[a-z_]+$/.test(error.message)?error.message: error instanceof assert.AssertionError?'diagnostic_assertion_failed':'diagnostic_execution_failed';}
finally{
 if(originalLaunch)chromium.launch=originalLaunch;
 await cleanupOwned();process.removeListener('SIGTERM',requestStop);process.removeListener('SIGINT',requestStop);
 if(interrupted||!report.cleanup.ok)report.diagnosticExitCode=1;
 process.chdir(root);
 if(reportWritable){
  try{report.normalArtifactsAfter=await normalSnapshot();report.normalArtifactsUnchanged=JSON.stringify(report.normalArtifactsBefore)===JSON.stringify(report.normalArtifactsAfter);if(!report.normalArtifactsUnchanged){report.diagnosticExitCode=1;report.failureCategory='diagnostic_original_artifacts_changed';}}catch{report.diagnosticExitCode=1;report.failureCategory='diagnostic_original_artifact_verification_failed';}
  try{await save(join(privateDirectory,'clock-bridge-private.json'),{diagnostic:true,normalAcceptance:false,physicalHardwareTested:false,clockRecords,clockDropped,wallClockBracketedByMonotoneObservations:true,traceAnchor:'qa-input-diagnostic-clock',limitations:['Profile-only work changes scheduling.','Native input, performance.now and event.timeStamp share the document monotone clock.','Wall-clock samples are relations only; not elapsed-time measurements.','PNG capture time is not physical presentation.']});if(clockDropped)report.diagnosticExitCode=1;await save(reportPath,report);}catch{report.diagnosticExitCode=1;}
 }
}
process.exit(report.diagnosticExitCode);
