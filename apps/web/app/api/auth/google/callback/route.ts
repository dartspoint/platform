import {requestLocale} from '../../../../../../../packages/i18n/src/errors';
import {flowOrigin} from '../../../../../../../packages/i18n/src/domains';
import {markRecentReauthentication} from '../../../../../../../packages/data/src/privacy';
import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {timingSafeEqual} from 'node:crypto';
import {serverAuth,currentActor} from '@/lib/server/auth';
import {currentSupportActor} from '@/lib/server/support-auth';
import {safeAuthDestination} from '../../../../../../../packages/contracts/src/legal';
import {DomainError} from '../../../../../../../packages/contracts/src/index';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){
 const origin=flowOrigin(request),store=await cookies(),url=new URL(request.url);
 const redirect=(path:string)=>NextResponse.redirect(new URL(path,origin),{headers:{'Cache-Control':'private, no-store'}});
 let locale=requestLocale(request);
 const raw=store.get('dp_google_flow')?.value;store.delete({name:'dp_google_flow',path:'/api/auth/google'});
 try{
  const flow=raw?JSON.parse(raw):null,presented=url.searchParams.get('flow')??'';
  if(typeof flow?.nonce!=='string'||flow.nonce.length!==presented.length||!timingSafeEqual(Buffer.from(flow.nonce),Buffer.from(presented)))return redirect('/'+locale+'/inloggen?authError=google_expired');
  locale=flow.locale==='en'?'en':'nl';
  store.set('dp-locale',locale,{secure:origin.startsWith('https:'),sameSite:'lax',path:'/',maxAge:31536000});
  if(url.searchParams.has('error'))return redirect('/'+locale+'/inloggen?authError=google_cancelled');
  const code=url.searchParams.get('code');if(!code||code.length>4096)return redirect('/'+locale+'/inloggen?authError=google_expired');
  const auth=await serverAuth(),{error}=await auth.auth.exchangeCodeForSession(code);if(error)return redirect('/'+locale+'/inloggen?authError=google_unavailable');
  // Provider verification and fresh local session/account checks are mandatory;
  // a sanctioned player can retain only the dedicated support session.
  const supportActor=await currentSupportActor();await markRecentReauthentication(supportActor);
  let actor;try{actor=await currentActor(undefined,false);}catch(e){if(e instanceof DomainError&&e.code==='banned')return redirect('/mijn-tickets');throw e;}
  const destination=safeAuthDestination(flow.destination);
  if(!actor.onboarded)return redirect('/'+(flow.locale==='en'?'en':'nl')+'/registreren?onboarding=1&next='+encodeURIComponent(destination));
  return redirect(destination);
 }catch{return redirect('/'+locale+'/inloggen?authError=google_unavailable');}
}
