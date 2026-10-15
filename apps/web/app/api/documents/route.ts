import {currentActor} from '@/lib/server/auth';
import {getLegalPublicBundle,getLegalAdminBundle,getRequiredLegalAcceptance,saveLegalDraft,publishLegalVersion,recordLegalAcceptance,updateLegalAuthority,verifyLegalRolloutCheck,onboardWithLegal,saveLegalCompany} from '../../../../../packages/data/src/legal';
import {DomainError,isValidationError,requireThat} from '../../../../../packages/contracts/src/index';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function failure(e:unknown){if(e instanceof DomainError)return Response.json({code:e.code,error:e.message},{status:e.status,headers});if(isValidationError(e)||e instanceof SyntaxError)return Response.json({code:'invalid_input',error:'Controleer de ingevulde gegevens.'},{status:400,headers});if((e as {code?:string}).code==='23505')return Response.json({code:'conflict',error:'Deze versie of spelersnaam bestaat al. Kies een nieuwe.'},{status:409,headers});return Response.json({code:'unavailable',error:'De informatie kon niet worden verwerkt. Probeer het later opnieuw.'},{status:503,headers});}
export async function GET(request:Request){try{
 const url=new URL(request.url);
 if(url.searchParams.get('admin')==='1')return Response.json(await getLegalAdminBundle(await currentActor(request)),{headers});
 if(url.searchParams.get('acceptance')==='1'){const actor=await currentActor(request,false);return Response.json({required:await getRequiredLegalAcceptance(actor.id),...await getLegalPublicBundle()},{headers});}
 const bundle=await getLegalPublicBundle();
 if(url.searchParams.has('download')){const v=bundle.history.find(v=>v.id===url.searchParams.get('download'));requireThat(v,'not_found',404);return new Response(v.markdown,{headers:{...headers,'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="dartspoint-${v.key}-${v.version}.md"`}});}
 return Response.json(bundle,{headers});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 requireThat(request.headers.get('origin')===new URL(process.env.NEXT_PUBLIC_APP_URL??request.url).origin,'origin',403);
 requireThat(request.headers.get('content-type')?.startsWith('application/json'),'json_required',415);
 const reader=request.body?.getReader();requireThat(reader,'invalid_input',400);let size=0,raw='';const decoder=new TextDecoder();try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;requireThat(size<=110000,'request_too_large',413);raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}
 const {action,...input}=JSON.parse(raw);const actor=await currentActor(request,false);
 const result=action==='company'?await saveLegalCompany(actor,input):action==='onboard'?await onboardWithLegal(actor,input):action==='accept'?await recordLegalAcceptance(actor.id,input):action==='draft'?await saveLegalDraft(actor,input):action==='publish'?await publishLegalVersion(actor,input):action==='publisher'?await updateLegalAuthority(actor,input):action==='verify-rollout'?await verifyLegalRolloutCheck(actor,input):null;
 requireThat(result,'unknown_action',400);return Response.json(result,{headers});
}catch(e){return failure(e);}}
