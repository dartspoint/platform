import {chmod,mkdir,open,realpath,type FileHandle} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import type {Browser,CDPSession} from '@playwright/test';

const MAX_TRACE_BYTES=128*1024*1024;
const TRACE_BUFFER_KIB=64*1024;
const CATEGORIES=[
 'devtools.timeline','blink.user_timing','input','cc','viz','gpu','toplevel',
 'disabled-by-default-devtools.timeline.frame',
 'disabled-by-default-devtools.timeline.inputs',
 'disabled-by-default-devtools.screenshot',
];
const INPUT_CATEGORIES=[
 'devtools.timeline','blink.user_timing','input','toplevel',
 'disabled-by-default-devtools.timeline.inputs',
];
type Failure='trace_start_failed'|'trace_end_failed'|'trace_complete_timeout'|'trace_stop_timeout'|'trace_stream_missing'|'trace_stream_limit'|'trace_data_loss'|'trace_stream_read_failed'|'trace_stream_write_failed'|'trace_stream_close_failed'|'trace_detach_failed';
class ProfileFailure extends Error {constructor(readonly category:Failure){super(category);}}
type Completion={stream?:string;dataLossOccurred?:boolean};
export type ThrowPerformanceProfile={stop():Promise<void>};

async function bounded<T>(action:Promise<T>,timeoutMs:number,category:Failure):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([action,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new ProfileFailure(category)),Math.max(1,timeoutMs));})]);}
 finally{if(timer)clearTimeout(timer);}
}
async function writeMetadata(file:FileHandle,data:unknown){
 const contents=Buffer.from(JSON.stringify(data,null,2)+'\n');let offset=0;
 while(offset<contents.byteLength){const {bytesWritten}=await file.write(contents,offset,contents.byteLength-offset,offset);if(!bytesWritten)throw new ProfileFailure('trace_stream_write_failed');offset+=bytesWritten;}
 await file.truncate(contents.byteLength);
}

/** Separate diagnostic run only. Default acceptance does not create a CDP session. */
export async function startThrowPerformanceProfile(browser:Browser,proofDir:string,options:{screenshots?:boolean;cpuSampling?:boolean;purpose?:'presentation'|'input'}={}):Promise<ThrowPerformanceProfile>{
 if(process.env.DARTSPOINT_THROW_PROFILE!=='1')return {stop:async()=>{}};
 if(options.purpose==='input'&&options.screenshots!==false)throw new Error('Input-route profiling requires explicitly disabled screenshots');
 const requested=options.purpose==='input'?INPUT_CATEGORIES:CATEGORIES;
 const categories=[...(options.screenshots===false?requested.filter(category=>category!=='disabled-by-default-devtools.screenshot'):requested),...(options.cpuSampling===true?['disabled-by-default-v8.cpu_profiler']:[])];
 const artifacts=resolve('artifacts'),directory=resolve(proofDir),local=relative(artifacts,directory);
 if(local.startsWith('..')||isAbsolute(local))throw new Error('Throw profile requires an ignored artifacts directory');
 await mkdir(artifacts,{recursive:true});await mkdir(directory,{recursive:true,mode:0o700});
 const realArtifacts=await realpath(artifacts),realDirectory=await realpath(directory),realLocal=relative(realArtifacts,realDirectory);
 if(realLocal.startsWith('..')||isAbsolute(realLocal))throw new Error('Throw profile requires an ignored artifacts directory');
 await chmod(realDirectory,0o700);
 let trace:FileHandle;
 try{trace=await open(resolve(realDirectory,'trace.json'),'wx',0o600);}catch{throw new Error('Throw profile refuses existing or inaccessible proof files');}
 let metadataFile:FileHandle;
 try{metadataFile=await open(resolve(realDirectory,'trace-metadata.json'),'wx',0o600);}catch{await trace.close();throw new Error('Throw profile refuses existing or inaccessible proof files');}
 const nodeStartedAtMs=performance.now();
 const metadata:any={
  diagnostic:'separate_opt_in_chrome_performance_profile',complete:false,ok:false,
  purpose:options.purpose??'presentation',requestedCategories:categories,screenshotsRequested:options.screenshots!==false,cpuSamplingRequested:options.cpuSampling===true,traceBufferKiB:TRACE_BUFFER_KIB,recordMode:'recordUntilFull',maxTraceBytes:MAX_TRACE_BYTES,traceBytes:0,
  nodeTimeOriginMs:performance.timeOrigin,nodeStartedAtMs,nodeStoppedAtMs:null,nodeDurationMs:null,
  privateArtifact:true,automaticCiUpload:false,
  limitations:[
   'Profiling and screenshots change browser scheduling; this recording does not replace the normal unprofiled 50ms acceptance test.',
   'A requestAnimationFrame callback, DOM mutation or geometry read does not prove a presented frame; inspect screenshot and compositor events separately.',
   'Node monotonic timestamps and browser trace timestamps are different clock domains; do not subtract them without an explicitly measured relation.',
   'Chrome screenshot/compositor evidence is not physical-display, refresh-rate or operating-system presentation proof.',
  ],
 };
 let session:CDPSession|undefined,stream:string|undefined,completionTimer:ReturnType<typeof setTimeout>|undefined;
 let completionHandler:((event:Completion)=>void)|undefined;
 try{
  await writeMetadata(metadataFile,metadata);
  session=await bounded(browser.newBrowserCDPSession(),10000,'trace_start_failed');
  await bounded(session.send('Tracing.start',{traceConfig:{includedCategories:categories,traceBufferSizeInKb:TRACE_BUFFER_KIB,recordMode:'recordUntilFull'},transferMode:'ReturnAsStream',streamFormat:'json',streamCompression:'none'}),10000,'trace_start_failed');
 }catch(error){
  metadata.failure=error instanceof ProfileFailure?error.category:'trace_start_failed';
  metadata.nodeStoppedAtMs=performance.now();metadata.nodeDurationMs=metadata.nodeStoppedAtMs-nodeStartedAtMs;
  try{await writeMetadata(metadataFile,metadata);}finally{await trace.close();await metadataFile.close();if(session)await bounded(session.detach(),3000,'trace_detach_failed').catch(()=>{});}
  throw new ProfileFailure(metadata.failure);
 }
 const activeSession=session;
 let stopping:Promise<void>|undefined;
 return {stop(){
  return stopping??=(async()=>{
   let failure:Failure|undefined;const deadline=performance.now()+60000;
   const remaining=()=>{const left=deadline-performance.now();if(left<=0)throw new ProfileFailure('trace_stop_timeout');return Math.min(10000,left);};
   try{
    const completed=new Promise<Completion>((resolve,reject)=>{
     completionHandler=resolve;activeSession.once('Tracing.tracingComplete',completionHandler);
     completionTimer=setTimeout(()=>reject(new ProfileFailure('trace_complete_timeout')),30000);
    });
    // Observe a completion timeout even if Tracing.end rejects first. Awaiting
    // the original promise below still retains its actual failure category.
    void completed.catch(()=>{});
    // Observe completion before ending tracing; Chrome can emit it immediately.
    await bounded(activeSession.send('Tracing.end'),remaining(),'trace_end_failed');
    const event=await completed;stream=event.stream;
    if(!stream)throw new ProfileFailure('trace_stream_missing');
    if(event.dataLossOccurred)throw new ProfileFailure('trace_data_loss');
    for(;;){
     remaining();
     const part=await bounded(activeSession.send('IO.read',{handle:stream,size:1024*1024}),remaining(),'trace_stream_read_failed');
     const bytes=Buffer.from(part.data,part.base64Encoded?'base64':'utf8');
     if(metadata.traceBytes+bytes.byteLength>MAX_TRACE_BYTES)throw new ProfileFailure('trace_stream_limit');
     let offset=0;
     while(offset<bytes.byteLength){const {bytesWritten}=await bounded(trace.write(bytes,offset,bytes.byteLength-offset),remaining(),'trace_stream_write_failed');if(!bytesWritten)throw new ProfileFailure('trace_stream_write_failed');offset+=bytesWritten;metadata.traceBytes+=bytesWritten;}
     if(part.eof)break;
    }
    metadata.complete=true;
   }catch(error){failure=error instanceof ProfileFailure?error.category:'trace_stream_read_failed';}
   finally{
    if(completionTimer)clearTimeout(completionTimer);
    if(completionHandler)activeSession.off('Tracing.tracingComplete',completionHandler);
    if(stream)try{await bounded(activeSession.send('IO.close',{handle:stream}),3000,'trace_stream_close_failed');}catch{failure??='trace_stream_close_failed';}
    try{await bounded(activeSession.detach(),3000,'trace_detach_failed');}catch{failure??='trace_detach_failed';}
    metadata.nodeStoppedAtMs=performance.now();metadata.nodeDurationMs=metadata.nodeStoppedAtMs-nodeStartedAtMs;
    metadata.ok=failure===undefined;if(failure)metadata.failure=failure;
    try{await writeMetadata(metadataFile,metadata);}finally{await trace.close();await metadataFile.close();}
   }
   if(failure)throw new ProfileFailure(failure);
  })();
 }};
}
