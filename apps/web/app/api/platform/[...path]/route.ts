import {lobbyAdmin,lobbyFeed,lobbyAction,lobbyPreview,lobbyVote,lobbyApplause} from '../../../../../../packages/data/src/lobby';
import {boundedMediaForm,uploadMedia,readMedia,deleteMedia} from '../../../../../../packages/data/src/media';
import {staff} from '../../../../../../packages/data/src/auth';
import {timingPing,timingEcho,practiceIngress} from '../../../../../../packages/data/src/timing';
import {matchHistory} from '../../../../../../packages/data/src/history';
import {revokeSession} from '../../../../../../packages/data/src/auth';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {currentActor,currentActorForLogout,serverAuth} from '@/lib/server/auth';
import {bootstrap,publicProjection} from '../../../../../../packages/data/src/projections';
import {onboard,joinRoom,heartbeat,preferences,social,privateChannel,chatHistory,sendMessage,chatPreference,resolveChannel} from '../../../../../../packages/data/src/community';
import {invite,respondInvite,inviteStatus,matchAccess,spectateMatch} from '../../../../../../packages/data/src/matches';
import {tournamentAction,divisionAction,startDivisionMatch} from '../../../../../../packages/data/src/competitions';
import {adminAction,moderate,report,revokeSanction,moderationCapabilities,moderateMessage} from '../../../../../../packages/data/src/admin';
import {moderationSettings,filterAction,renameProfile} from '../../../../../../packages/data/src/content-filter';
import {queue,advanceQueue,rematch} from '../../../../../../packages/data/src/queue';
import {practiceCommand,practiceSnapshot,capturePracticeIngress} from '../../../../../../packages/data/src/practice';
import {IngressOrder} from '../../../../../../packages/data/src/ingress-order';
import {saveSettings} from '../../../../../../packages/data/src/settings';
import {rateLimit,redis,db} from '../../../../../../packages/data/src/db';
import {DomainError,requireThat,isValidationError} from '../../../../../../packages/contracts/src/index';

export const dynamic='force-dynamic';export const runtime='nodejs';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
function response(data:unknown,status=200){return Response.json(data,{status,headers});}
function failure(e:unknown){if(e instanceof DomainError)return Response.json({code:e.code,error:e.message,...(e.retryAfter===undefined?{}:{retryAfter:e.retryAfter})},{status:e.status,headers:{...headers,...(e.retryAfter===undefined?{}:{'Retry-After':String(e.retryAfter)})}});if(e instanceof SyntaxError)return response({code:'invalid_json',error:'Ongeldig verzoek.'},400);if(e instanceof z.ZodError||isValidationError(e))return response({code:'invalid_input',error:'Controleer de ingevulde gegevens.'},400);if((e as {message:string})?.message==='username_unavailable'||(e as {code:string})?.code==='23505')return response({code:'conflict',error:'Deze waarde is al in gebruik.'},409);console.error(JSON.stringify({event:'api_request_failed'}));return response({code:'unavailable',error:'De actie kon niet worden uitgevoerd. Probeer het opnieuw.'},503);}
type Context={params:Promise<{path:string[]}>};
const practiceIngressOrder=new IngressOrder();
export async function GET(request:Request,context:Context){try{
 const path=(await context.params).path;
 if(path[0]==='public')return response(await publicProjection());
 const actor=await currentActor(request,path[0]!=='profile');
 if(path.join('/')==='lobby/admin')return response(await lobbyAdmin(actor));
 if(path.join('/')==='lobby/feed')return response(await lobbyFeed(actor,{roomId:new URL(request.url).searchParams.get('roomId')}));
 if(path[0]==='media'&&path[1]){const asset=await readMedia(actor,{id:path[1],variant:new URL(request.url).searchParams.get('variant')??'wide'});return new Response(new Uint8Array(asset.data).buffer,{headers:{...headers,'Content-Type':asset.mime,'Cache-Control':'private, no-cache','ETag':'"'+asset.etag+'"','Content-Disposition':'inline'}});}
 if(path[0]==='profile')return response(actor);
 if(path[0]==='history')return response(await matchHistory(actor,Object.fromEntries(new URL(request.url).searchParams)));
 if(path[0]==='bootstrap')return response(await bootstrap(actor));
 if(path[0]==='chat'&&path[1]){const after=new URL(request.url).searchParams.get('after');return response(await chatHistory(actor,path[1],after===null?undefined:Number(after)));}
 if(path.join('/')==='moderation/settings')return response(await moderationSettings(actor));
 if(path.join('/')==='moderation/capabilities')return response(await moderationCapabilities(actor,Object.fromEntries(new URL(request.url).searchParams)));
 if(path[0]==='practice'&&path[1])return response(await practiceSnapshot(actor,path[1]));
 if(path[0]==='invite'&&path.length===2)return response(await inviteStatus(actor,path[1]));
 if(path[0]==='match'&&path[1])return response(await matchAccess(actor,path[1]));
 return response({code:'not_found'},404);
}catch(e){return failure(e);}}
async function boundedLobbyJson(request:Request){
 const reader=request.body?.getReader();if(!reader)return '';let bytes=0,text='';const decoder=new TextDecoder();
 try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>1048576){await reader.cancel();throw new DomainError('request_too_large',413);}text+=decoder.decode(part.value,{stream:true});}return text+decoder.decode();}finally{reader.releaseLock();}
}
export async function POST(request:Request,context:Context){const receivedAt=Date.now();let practiceTicket:ReturnType<IngressOrder['reserve']>|undefined;try{
 // The hash supplies ordering only, never identity or permission. The request
 // still passes normal authentication before its capture callback is released.
 if(/^\/api\/platform\/practice(?:\/|$)/.test(new URL(request.url).pathname)){const presented=request.headers.get('authorization')??request.headers.get('cookie');if(presented)practiceTicket=practiceIngressOrder.reserve(createHash('sha256').update(presented).digest('hex'));}
 const origin=request.headers.get('origin');requireThat(!origin||origin===process.env.NEXT_PUBLIC_APP_URL,'origin',403);
 const path=(await context.params).path;
 if(path.join('/')==='media/upload'){const actor=await currentActor(request);staff(actor);requireThat(!actor.renameRequired,'rename_required',403);requireThat(request.headers.get('content-type')?.startsWith('multipart/form-data'),'multipart_required',415);return response(await uploadMedia(actor,await boundedMediaForm(request)));}
 requireThat(request.headers.get('content-type')?.startsWith('application/json'),'json_required',415);
 const raw=path[0]==='lobby'?await boundedLobbyJson(request):await request.text();requireThat(raw.length<=(['lobby','lobby/preview'].includes(path.join('/'))?1048576:16384),'request_too_large',413);const input=JSON.parse(raw);
 if(path[0]==='auth'){
  if(['request','verify'].includes(path[1])){const key=createHash('sha256').update(request.headers.get('x-forwarded-for')?.split(',')[0]??'local').digest('hex');await rateLimit('auth:'+key,20,300);}
  const auth=await serverAuth();
  if(path[1]==='request'){
   const {email,captchaToken}=z.object({email:z.string().email().max(254).transform(e=>e.trim().toLowerCase()),captchaToken:z.string().max(4096).optional()}).strict().parse(input);
   requireThat(process.env.APP_ENV==='development'||captchaToken,'captcha_required',403,'Bevestig dat je geen robot bent.');
   const hash=createHash('sha256').update(email).digest('hex');await rateLimit('otp-email:'+hash,6,3600);
   const r=await redis();requireThat(await r.set('dartspoint:otp-resend:'+hash,'1',{NX:true,EX:60}),'resend_too_soon',429,'Wacht 60 seconden voordat je een nieuwe code aanvraagt.');
   const {error}=await auth.auth.signInWithOtp({email,options:{shouldCreateUser:(await db().query("select data->'platform'->>'registrationOpen' enabled from private.system_settings where key='settings'")).rows[0]?.enabled!=='false',captchaToken}});
   if(error){await r.del('dartspoint:otp-resend:'+hash);throw new DomainError('auth_provider',503,'De inlogcode kon niet worden verstuurd. Probeer het later opnieuw.');}
   return response({ok:true});
  }
  if(path[1]==='verify'){
   const {email,code}=z.object({email:z.string().email().max(254),code:z.string().regex(/^\d{6}$/)}).strict().parse(input);
   await rateLimit('otp-verify:'+createHash('sha256').update(email.toLowerCase()).digest('hex'),5,600);
   const {error}=await auth.auth.verifyOtp({email,token:code,type:'email'});
   if(error)throw new DomainError('invalid_code',400,'Deze code klopt niet of is verlopen. Vraag zo nodig een nieuwe code aan.');
   return response(await currentActor(undefined,false));
  }
  if(path[1]==='logout'){try{await revokeSession(await currentActorForLogout(request));}catch(e){if(!(e instanceof DomainError&&e.status===401))throw e;}await auth.auth.signOut({scope:'local'});return response({ok:true});}
 }
 const actor=await currentActor(request,path[0]!=='onboard');
 if(actor.renameRequired)requireThat(['profile/rename','heartbeat','preferences','chat/preference','timing/ping','timing/echo'].includes(path.join('/')),'rename_required',403,'Kies eerst een nieuwe gebruikersnaam.');
 if(path.join('/')==='timing/ping')return response(await timingPing(actor,receivedAt,input));
 if(path.join('/')==='timing/echo')return response(await timingEcho(actor,input,receivedAt));
 if(path[0]==='practice'){const capture=()=>practiceIngress(actor,receivedAt,input?.renderSample?.connectionId).then(ingress=>capturePracticeIngress(actor,input,ingress)),registered=practiceTicket?await practiceTicket.run(capture):await capture();return response(await practiceCommand(actor,input,{receivedAt},registered));}
 const actions:Record<string,(actor:any,input:unknown)=>Promise<unknown>>={lobby:lobbyAction,'lobby/preview':lobbyPreview,'lobby/vote':lobbyVote,'lobby/applause':lobbyApplause,'media/delete':deleteMedia,onboard,room:joinRoom,heartbeat,preferences,social,'private-channel':privateChannel,'chat/send':sendMessage,'chat/preference':chatPreference,'chat/resolve':resolveChannel,'profile/rename':renameProfile,'moderation/filter':filterAction,'moderation/message':moderateMessage,invite,'invite/respond':respondInvite,tournament:tournamentAction,division:divisionAction,'division/start':startDivisionMatch,admin:adminAction,moderation:moderate,"moderation/revoke":revokeSanction,report,settings:saveSettings,queue,'queue/advance':advanceQueue,'match/rematch':rematch,'match/spectate':spectateMatch};
 const action=actions[path.join('/')];if(!action)return response({code:'not_found'},404);return response(await action(actor,input));
}catch(e){return failure(e);}finally{practiceTicket?.release();}}
