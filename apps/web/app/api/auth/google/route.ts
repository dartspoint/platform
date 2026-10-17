import {requestLocale} from '../../../../../../packages/i18n/src/errors';
import {flowOrigin} from '../../../../../../packages/i18n/src/domains';
import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {randomBytes} from 'node:crypto';
import {serverAuth} from '@/lib/server/auth';
import {safeAuthDestination} from '../../../../../../packages/contracts/src/legal';
import {createHash} from 'node:crypto';
import {rateLimit} from '../../../../../../packages/data/src/db';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){
 const origin=flowOrigin(request),chosen=new URL(request.url).searchParams.get('locale'),locale=chosen==='en'||chosen==='nl'?chosen:requestLocale(request);
 const fail=()=>NextResponse.redirect(new URL('/'+locale+'/inloggen?authError=google_unavailable',origin),{headers:{'Cache-Control':'private, no-store'}});
 if(process.env.GOOGLE_AUTH_ENABLED!=='true')return fail();
 // The entry point is explicitly clicked; no One Tap or browser-side ID token.
 const destination=safeAuthDestination(new URL(request.url).searchParams.get('next'));
 try{
  await rateLimit('google-start:'+createHash('sha256').update(request.headers.get('x-forwarded-for')?.split(',')[0]??'local').digest('hex'),20,300);
  const nonce=randomBytes(24).toString('base64url'),store=await cookies();
  store.set('dp_google_flow',JSON.stringify({nonce,destination,locale}),{httpOnly:true,secure:origin.startsWith('https:'),sameSite:'lax',path:'/api/auth/google',maxAge:600});
  const callback=new URL('/api/auth/google/callback',origin);callback.searchParams.set('flow',nonce);
  const auth=await serverAuth();
  const {data,error}=await auth.auth.signInWithOAuth({provider:'google',options:{redirectTo:callback.href,scopes:'openid email profile',skipBrowserRedirect:true}});
  if(error||!data.url)return fail();
  return NextResponse.redirect(data.url,{headers:{'Cache-Control':'private, no-store'}});
 }catch{return fail();}
}
