import {errorText,requestLocale} from '../../../../../../packages/i18n/src/errors';
import {trustedOrigins,isTrustedOrigin} from '../../../../../../packages/i18n/src/domains';
import {createHash} from 'node:crypto';
import {cookies} from 'next/headers';
import {z} from 'zod';
import {currentSupportIdentity} from '@/lib/server/support-auth';
import {supportTopics,supportMe,supportList,supportDetail,supportCreateTicket,supportVerifyGuest,supportPostMessage,supportAction,supportTeam,supportTeamAction,supportSetFirstName,supportTopicAction,supportTopicImpact,supportTemplates,supportTemplateAction} from '../../../../../../packages/data/src/support';
import {supportBoundedForm,supportUploadAttachment,supportDownloadAttachment,supportGetAttachmentLink} from '../../../../../../packages/data/src/support-attachments';
import {supportRecoverDelivery} from '../../../../../../packages/data/src/support-delivery';
import {ensurePrivacyRequestForTicket} from '../../../../../../packages/data/src/privacy';
import {rateLimit} from '../../../../../../packages/data/src/db';
import {DomainError,requireThat,isValidationError} from '../../../../../../packages/contracts/src/index';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const response=(data:unknown,status=200)=>Response.json(data,{status,headers});
function failure(error:unknown,request:Request){if(error instanceof DomainError)return response({code:error.code,error:errorText(error.code,requestLocale(request),error.message)},error.status);if(error instanceof z.ZodError||isValidationError(error))return response({code:'invalid_input',error:'Controleer de ingevulde gegevens.'},400);if(error instanceof SyntaxError)return response({code:'invalid_json',error:'Ongeldig verzoek.'},400);if((error as {code?:string})?.code==='23505')return response({code:'conflict',error:'Deze actie is al uitgevoerd of conflicteert met een andere wijziging.'},409);console.error(JSON.stringify({event:'support_request_failed'}));return response({code:'unavailable',error:'Support is tijdelijk niet bereikbaar. Probeer het opnieuw of mail support@dartspoint.nl.'},503);}
type Context={params:Promise<{path:string[]}>};
async function body(request:Request){requireThat(request.headers.get('content-type')?.startsWith('application/json'),'json_required',415);const reader=request.body?.getReader();requireThat(reader,'invalid_json',400);let text='',size=0;const decoder=new TextDecoder();try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>65536){await reader.cancel();throw new DomainError('request_too_large',413);}text+=decoder.decode(p.value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{reader.releaseLock();}}
export async function GET(request:Request,context:Context){try{const path=(await context.params).path,route=path.join('/'),query=Object.fromEntries(new URL(request.url).searchParams);
 if(route==='topics'){let identity;try{identity=await currentSupportIdentity(request);}catch(error){if(!(error instanceof DomainError&&[401,403].includes(error.status)))throw error;}return response(await supportTopics(identity));}
 const identity=await currentSupportIdentity(request);
 if(route==='me')return response(await supportMe(identity));
 if(route==='tickets')return response(await supportList(identity,query));
 if(route==='team')return response(await supportTeam(identity,query));
 if(route==='templates')return response(await supportTemplates(identity,query.topicId));
 if(path[0]==='tickets'&&path.length===2)return response(await supportDetail(identity,path[1]));
 if(path[0]==='attachments'&&path[2]==='link'&&path.length===3)return response(await supportGetAttachmentLink(identity,path[1]));
 if(path[0]==='attachments'&&path[2]==='download'&&path.length===3){const asset=await supportDownloadAttachment(identity,path[1],query);const filename=encodeURIComponent(asset.name);return new Response(new Uint8Array(asset.data).buffer,{headers:{...headers,'Content-Type':asset.mime,'Content-Disposition':`attachment; filename="bijlage"; filename*=UTF-8''${filename}`,'Content-Security-Policy':"default-src 'none'; sandbox"}});}
 return response({code:'not_found'},404);
 }catch(error){return failure(error,request);}}
export async function POST(request:Request,context:Context){try{const origin=request.headers.get('origin');requireThat(!origin||isTrustedOrigin(origin),'origin',403);const path=(await context.params).path,route=path.join('/');const ipHash=createHash('sha256').update(request.headers.get('x-forwarded-for')?.split(',')[0]??'local').digest('hex');
 if(route==='guest/verify'){await rateLimit('support-verify:'+ipHash,15,600);const result=await supportVerifyGuest(await body(request));(await cookies()).set('dp_support_guest',result.session,{httpOnly:true,secure:process.env.APP_ENV!=='development',sameSite:'lax',path:'/',maxAge:7*86400});return response({ok:true,id:result.id,ticketId:result.id,number:result.number});}
 const identity=await currentSupportIdentity(request);
 if(path[0]==='tickets'&&path[2]==='attachments'&&path.length===3){requireThat(request.headers.get('content-type')?.startsWith('multipart/form-data'),'multipart_required',415);return response(await supportUploadAttachment(identity,path[1],await supportBoundedForm(request)));}
 const input=await body(request);
 if(route==='tickets'){
  if(!identity.actor){await rateLimit('support-guest:'+ipHash,10,3600);requireThat(process.env.APP_ENV==='development'||process.env.TURNSTILE_SECRET_KEY,'captcha_configuration',503);if(process.env.APP_ENV!=='development'){requireThat(typeof input.captchaToken==='string'&&input.captchaToken.length<=4096,'captcha_required',403);const check=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:process.env.TURNSTILE_SECRET_KEY!,response:input.captchaToken}),signal:AbortSignal.timeout(10000)});requireThat(check.ok,'captcha_unavailable',503);const result=await check.json();requireThat(result.success===true&&result.action==='support'&&trustedOrigins().some(origin=>new URL(origin).hostname===result.hostname),'captcha_failed',403,'De botcontrole is mislukt. Probeer het opnieuw.');}}
  const result=await supportCreateTicket(identity,{...input,locale:requestLocale(request)});if(result.protectedKind==='privacy')await ensurePrivacyRequestForTicket(result.id);return response(result.verificationRequired?{ok:true,verificationRequired:true}:result);
 }
 if(route==='me/update')return response(await supportSetFirstName(identity,input));
 if(route==='team/update')return response(await supportTeamAction(identity,input));
 if(route==='topics/update')return response(await supportTopicAction(identity,input));
 if(route==='topics/impact')return response(await supportTopicImpact(identity,input));
 if(route==='templates/update')return response(await supportTemplateAction(identity,input));
 if(path[0]==='tickets'&&path.length===3){if(path[2]==='mail-recovery')return response(await supportRecoverDelivery(identity,path[1],input));if(path[2]==='messages')return response(await supportPostMessage(identity,path[1],input));const result=await supportAction(identity,path[1],path[2],input);if(path[2]==='update')await ensurePrivacyRequestForTicket(path[1]);return response(result);}
 return response({code:'not_found'},404);
 }catch(error){return failure(error,request);}}
