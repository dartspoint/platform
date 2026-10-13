import {timingPing,timingEcho,practiceIngress} from '../../../../../../packages/data/src/timing';
import {matchHistory} from '../../../../../../packages/data/src/history';
import {revokeSession} from '../../../../../../packages/data/src/auth';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {currentActor,currentActorForLogout,serverAuth} from '@/lib/server/auth';
import {bootstrap,publicProjection} from '../../../../../../packages/data/src/projections';
import {onboard,joinRoom,heartbeat,preferences,social,privateChannel,chatHistory,sendMessage,chatPreference,resolveChannel} from '../../../../../../packages/data/src/community';
import {invite,respondInvite,matchAccess} from '../../../../../../packages/data/src/matches';
import {tournamentAction,divisionAction,startDivisionMatch} from '../../../../../../packages/data/src/competitions';
import {adminAction,moderate,report,revokeSanction} from '../../../../../../packages/data/src/admin';
import {queue,advanceQueue,rematch} from '../../../../../../packages/data/src/queue';
import {practiceCommand,practiceSnapshot} from '../../../../../../packages/data/src/practice';
import {saveSettings} from '../../../../../../packages/data/src/settings';
import {rateLimit,redis,db} from '../../../../../../packages/data/src/db';
import {DomainError,requireThat,isValidationError} from '../../../../../../packages/contracts/src/index';

export const dynamic='force-dynamic';export const runtime='nodejs';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
function response(data:unknown,status=200){return Response.json(data,{status,headers});}
function failure(e:unknown){if(e instanceof DomainError)return response({code:e.code,error:e.message},e.status);if(e instanceof SyntaxError)return response({code:'invalid_json',error:'Ongeldig verzoek.'},400);if(e instanceof z.ZodError||isValidationError(e))return response({code:'invalid_input',error:'Controleer de ingevulde gegevens.'},400);if((e as {message:string})?.message==='username_unavailable'||(e as {code:string})?.code==='23505')return response({code:'conflict',error:'Deze waarde is al in gebruik.'},409);console.error(JSON.stringify({event:'api_request_failed'}));return response({code:'unavailable',error:'De actie kon niet worden uitgevoerd. Probeer het opnieuw.'},503);}
type Context={params:Promise<{path:string[]}>};
export async function GET(request:Request,context:Context){try{
 const path=(await context.params).path;
 if(path[0]==='public')return response(await publicProjection());
 const actor=await currentActor(request,path[0]!=='profile');
 if(path[0]==='profile')return response(actor);
 if(path[0]==='history')return response(await matchHistory(actor,Object.fromEntries(new URL(request.url).searchParams)));
 if(path[0]==='bootstrap')return response(await bootstrap(actor));
 if(path[0]==='chat'&&path[1])return response(await chatHistory(actor,path[1]));
 if(path[0]==='practice'&&path[1])return response(await practiceSnapshot(actor,path[1]));
 if(path[0]==='match'&&path[1])return response(await matchAccess(actor,path[1]));
 return response({code:'not_found'},404);
}catch(e){return failure(e);}}
export async function POST(request:Request,context:Context){const receivedAt=Date.now();try{
 const origin=request.headers.get('origin');requireThat(!origin||origin===process.env.NEXT_PUBLIC_APP_URL,'origin',403);
 requireThat(request.headers.get('content-type')?.startsWith('application/json'),'json_required',415);
 const raw=await request.text();requireThat(raw.length<=16384,'request_too_large',413);const input=JSON.parse(raw);
 const path=(await context.params).path;
 if(path[0]==='auth'){
  if(['request','verify'].includes(path[1])){const key=createHash('sha256').update(request.headers.get('x-forwarded-for')?.split(',')[0]??'local').digest('hex');await rateLimit('auth:'+key,20,300);}
  const auth=await serverAuth();
  if(path[1]==='request'){
   const {email,captchaToken}=z.object({email:z.string().email().max(254).transform(e=>e.trim().toLowerCase()),captchaToken:z.string().max(4096).optional()}).strict().parse(input);
   const hash=createHash('sha256').update(email).digest('hex');await rateLimit('otp-email:'+hash,6,3600);
   const r=await redis();requireThat(await r.set('dartspoint:otp-resend:'+hash,'1',{NX:true,EX:60}),'resend_too_soon',429,'Wacht 60 seconden voordat je een nieuwe code aanvraagt.');
   requireThat(process.env.APP_ENV==='development'||captchaToken,'captcha_required',403,'Bevestig dat je geen robot bent.');
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
 if(path.join('/')==='timing/ping'){z.object({}).strict().parse(input);return response(await timingPing(actor));}
 if(path.join('/')==='timing/echo')return response(await timingEcho(actor,input,receivedAt));
 if(path[0]==='practice')return response(await practiceCommand(actor,input,await practiceIngress(actor,receivedAt)));
 const actions:Record<string,(actor:any,input:unknown)=>Promise<unknown>>={onboard,room:joinRoom,heartbeat,preferences,social,'private-channel':privateChannel,'chat/send':sendMessage,'chat/preference':chatPreference,'chat/resolve':resolveChannel,invite,'invite/respond':respondInvite,tournament:tournamentAction,division:divisionAction,'division/start':startDivisionMatch,admin:adminAction,moderation:moderate,"moderation/revoke":revokeSanction,report,settings:saveSettings,queue,'queue/advance':advanceQueue,'match/rematch':rematch};
 const action=actions[path.join('/')];if(!action)return response({code:'not_found'},404);return response(await action(actor,input));
}catch(e){return failure(e);}}
