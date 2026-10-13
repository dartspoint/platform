import {chmod,mkdir,open,realpath,writeFile,type FileHandle} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import type {CDPSession,Page} from '@playwright/test';

const MAX_FRAME_BYTES=64*1024*1024,MAX_FRAMES=128;
type FrameEvent={data:string;sessionId:number;metadata:{timestamp?:number;offsetTop:number;pageScaleFactor:number;deviceWidth:number;deviceHeight:number;scrollOffsetX:number;scrollOffsetY:number}};
type Frame={data:string;metadata:Record<string,number|string>};
type Failure='presentation_start_timeout'|'presentation_start_failed'|'presentation_baseline_timeout'|'presentation_frame_invalid'|'presentation_frame_limit'|'presentation_byte_limit'|'presentation_ack_failed'|'presentation_stop_timeout'|'presentation_stop_failed'|'presentation_detach_failed'|'presentation_write_failed';
class PresentationFailure extends Error{constructor(readonly category:Failure){super(category);}}
export type ThrowPresentationProfile={stop():Promise<void>};

async function bounded<T>(action:Promise<T>,timeoutMs:number,category:Failure):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([action,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new PresentationFailure(category)),Math.max(1,timeoutMs));})]);}
 finally{if(timer)clearTimeout(timer);}
}
function pngDimensions(data:string){
 // Inspect only the PNG signature/IHDR. Pixels are never cropped or edited.
 const header=Buffer.from(data.slice(0,32),'base64');
 if(header.length<24||!header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||header.toString('ascii',12,16)!=='IHDR')throw new PresentationFailure('presentation_frame_invalid');
 const width=header.readUInt32BE(16),height=header.readUInt32BE(20);
 if(!width||!height||width>1920||height>1080)throw new PresentationFailure('presentation_frame_invalid');
 return {pngWidth:width,pngHeight:height};
}

/** Private, separate diagnostic run. Default acceptance creates no CDP session. */
export async function startThrowPresentationProfile(page:Page,proofDir:string):Promise<ThrowPresentationProfile>{
 if(process.env.DARTSPOINT_THROW_PROFILE!=='1')return {stop:async()=>{}};
 const artifacts=resolve('artifacts'),directory=resolve(proofDir),local=relative(artifacts,directory);
 if(local.startsWith('..')||isAbsolute(local))throw new Error('Throw presentation requires an ignored artifacts directory');
 await mkdir(artifacts,{recursive:true});await mkdir(directory,{recursive:true,mode:0o700});
 const realArtifacts=await realpath(artifacts),realDirectory=await realpath(directory),realLocal=relative(realArtifacts,realDirectory);
 if(realLocal.startsWith('..')||isAbsolute(realLocal))throw new Error('Throw presentation requires an ignored artifacts directory');
 await chmod(realDirectory,0o700);
 let metadataFile:FileHandle;
 try{metadataFile=await open(resolve(realDirectory,'presentation-metadata.json'),'wx',0o600);}catch{throw new Error('Throw presentation refuses existing or inaccessible proof files');}
 const nodeStartedAtMs=performance.now(),frames:Frame[]=[],acknowledgements=new Set<Promise<void>>();
 const metadata:any={
  diagnostic:'separate_opt_in_chrome_png_screencast',ok:false,complete:false,
  privateArtifact:true,automaticCiUpload:false,physicalHardwareTested:false,
  requested:{format:'png',everyNthFrame:1,maxWidth:1920,maxHeight:1080},
  limits:{maxFrames:MAX_FRAMES,maxStoredBase64AndMetadataBytes:MAX_FRAME_BYTES,startTimeoutMs:2000,stopTimeoutMs:10000},
  nodeTimeOriginMs:performance.timeOrigin,nodeStartedAtMs,nodeStoppedAtMs:null,
  observedFrameEvents:0,retainedFrames:0,unretainedFramesAfterFailure:0,storedBytes:0,
  timestampDomain:'CDP metadata.timestamp: Chrome145 capture-metadata creation wall-clock time, seconds since epoch, before PNG encoding; not proven original frame swap, presentation, Node receive time or physical-display scanout',
  timestampImplementationSource:'https://chromium.googlesource.com/chromium/src/+/refs/tags/145.0.7632.6/content/browser/devtools/protocol/page_handler.cc',
  limitations:[
   'Profiling and screencasting change scheduling and do not replace the normal unprofiled acceptance run or its unchanged timing gates.',
   'Chrome may coalesce or omit screencast frames. These files prove only the observed compositor captures, not every presented frame.',
   'In Chrome145 PageHandler constructs metadata with base::Time::Now after receiving the captured video frame and before PNG encoding. The protocol comment calls this a frame swap timestamp, but this implementation does not prove the original swap or presentation time.',
   'Node monotone receive times are delivery observations in a different clock domain; they are not presentation timestamps.',
   'PNG dimensions can differ from CSS viewport dimensions. Use the recorded page scale, device dimensions and scroll offsets when inspecting coordinates.',
   'These images are not physical monitor, refresh-rate, touch-device or operating-system display evidence.',
  ],
 };
 let session:CDPSession|undefined,started=false,startAborted=false,failure:Failure|undefined,stopping:Promise<void>|undefined;
 let resolveBaseline!:()=>void,rejectBaseline!:(error:PresentationFailure)=>void;
 const baseline=new Promise<void>((resolve,reject)=>{resolveBaseline=resolve;rejectBaseline=reject;});
 // An early CDP event can fail before startScreencast returns. Always observe
 // that rejection; the awaited baseline below still fails with its category.
 void baseline.catch(()=>{});
 const fail=(category:Failure)=>{failure??=category;rejectBaseline(new PresentationFailure(failure));};
 const onFrame=(event:FrameEvent)=>{
  const nodeReceivedAtMs=performance.now();metadata.observedFrameEvents++;
  try{
   // ACK immediately, before decoding/retaining metadata. Both success and
   // rejection handlers settle the tracked promise without unhandled errors.
   const ack=session!.send('Page.screencastFrameAck',{sessionId:event.sessionId}).then(()=>{},()=>{fail('presentation_ack_failed');});
   acknowledgements.add(ack);void ack.then(()=>{acknowledgements.delete(ack);});
   if(failure){metadata.unretainedFramesAfterFailure++;return;}
   if(!Number.isInteger(event.sessionId)||!Number.isFinite(event.metadata.timestamp))throw new PresentationFailure('presentation_frame_invalid');
   const numeric:Record<string,number|string>={index:frames.length,sessionId:event.sessionId,nodeReceivedAtMs,...pngDimensions(event.data)};
   for(const key of ['timestamp','offsetTop','pageScaleFactor','deviceWidth','deviceHeight','scrollOffsetX','scrollOffsetY'] as const){const value=event.metadata[key];if(typeof value==='number'&&Number.isFinite(value))numeric[key]=value;}
   const storedBytes=Buffer.byteLength(event.data,'utf8')+Buffer.byteLength(JSON.stringify(numeric),'utf8');
   if(frames.length>=MAX_FRAMES)throw new PresentationFailure('presentation_frame_limit');
   if(metadata.storedBytes+storedBytes>MAX_FRAME_BYTES)throw new PresentationFailure('presentation_byte_limit');
   frames.push({data:event.data,metadata:numeric});metadata.storedBytes+=storedBytes;metadata.retainedFrames=frames.length;
   if(frames.length===1){metadata.baselineFrameIndex=0;metadata.baselineCaptureMetadataTimestamp=numeric.timestamp;resolveBaseline();}
  }catch(error){metadata.unretainedFramesAfterFailure++;fail(error instanceof PresentationFailure?error.category:'presentation_frame_invalid');}
 };
 const stop=()=>stopping??=(async()=>{
  const deadline=performance.now()+10000;
  const remaining=()=>{const left=deadline-performance.now();if(left<=0)throw new PresentationFailure('presentation_stop_timeout');return left;};
  try{
   if(session&&started)try{await bounded(session.send('Page.stopScreencast'),Math.min(6000,remaining()),'presentation_stop_timeout');}catch(error){failure??=error instanceof PresentationFailure?error.category:'presentation_stop_failed';}
   if(session)session.off('Page.screencastFrame',onFrame);
   try{await bounded(Promise.all([...acknowledgements]),Math.min(1000,remaining()),'presentation_ack_failed');}catch{failure??='presentation_ack_failed';}
  }finally{
   if(session){session.off('Page.screencastFrame',onFrame);try{await bounded(session.detach(),Math.min(2000,Math.max(1,deadline-performance.now())),'presentation_detach_failed');}catch{failure??='presentation_detach_failed';}}
   metadata.nodeStoppedAtMs=performance.now();metadata.nodeDurationMs=metadata.nodeStoppedAtMs-nodeStartedAtMs;
   metadata.frames=frames.map(frame=>({...frame.metadata,file:`presentation-frame-${String(frame.metadata.index).padStart(3,'0')}.png`}));
   try{
    for(const frame of frames)await bounded(writeFile(resolve(realDirectory,`presentation-frame-${String(frame.metadata.index).padStart(3,'0')}.png`),Buffer.from(frame.data,'base64'),{flag:'wx',mode:0o600}),remaining(),'presentation_write_failed');
    metadata.complete=true;
   }catch(error){failure??=error instanceof PresentationFailure?error.category:'presentation_write_failed';}
   metadata.ok=failure===undefined;if(failure)metadata.failure=failure;
   try{await bounded(metadataFile.writeFile(JSON.stringify(metadata,null,2)+'\n'),Math.max(1,deadline-performance.now()),'presentation_write_failed');}catch{failure??='presentation_write_failed';}
   finally{try{await metadataFile.close();}catch{failure??='presentation_write_failed';}}
  }
  if(failure)throw new PresentationFailure(failure);
 })();
 try{
  const remaining=()=>Math.max(1,2000-(performance.now()-nodeStartedAtMs));
  const creatingSession=page.context().newCDPSession(page);
  // A timed-out session creation can resolve later. Detach that owned late
  // session too; the original start failure remains a hard test failure.
  void creatingSession.then(async created=>{if(startAborted)try{await bounded(created.detach(),2000,'presentation_detach_failed');}catch{failure??='presentation_detach_failed';}},()=>{});
  session=await bounded(creatingSession,remaining(),'presentation_start_timeout');session.on('Page.screencastFrame',onFrame);
  // Treat the command as potentially active before awaiting its response so
  // timeout/failure cleanup still sends stop and detaches the owned session.
  started=true;
  await bounded(session.send('Page.startScreencast',{format:'png',everyNthFrame:1,maxWidth:1920,maxHeight:1080}),remaining(),'presentation_start_timeout');
  await bounded(baseline,remaining(),'presentation_baseline_timeout');
  return {stop};
 }catch(error){startAborted=true;failure??=error instanceof PresentationFailure?error.category:'presentation_start_failed';try{await stop();}catch{/* Metadata retains the first failure; cleanup has already been attempted. */}throw new PresentationFailure(failure);}
}
