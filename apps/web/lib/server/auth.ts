import {providerFetch} from '../../../../packages/data/src/fetch';
import 'server-only';
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {verifyToken,verifyLogoutToken} from '../../../../packages/data/src/auth';
import {DomainError} from '../../../../packages/contracts/src/index';
export async function serverAuth(){const store=await cookies();return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{global:{fetch:providerFetch},cookies:{getAll:()=>store.getAll(),setAll:values=>{try{values.forEach(({name,value,options})=>store.set(name,value,options));}catch{/* Proxy refreshes Server Component sessions. */}}}});}
export async function currentActor(request?:Request,complete=true){
 const bearer=request?.headers.get('authorization');
 if(bearer?.startsWith('Bearer '))return verifyToken(bearer.slice(7),complete);
 // Read the cookie only to obtain its token. verifyToken remains the single
 // authoritative provider verification, followed by fresh local access checks.
 const auth=await serverAuth();const {data:session,error}=await auth.auth.getSession();if(error||!session.session)throw new DomainError('unauthenticated',401);
 return verifyToken(session.session.access_token,complete);
}
export async function currentActorForLogout(request:Request){
 const bearer=request.headers.get('authorization');if(bearer?.startsWith('Bearer '))return verifyLogoutToken(bearer.slice(7));
 const auth=await serverAuth();const {data,error}=await auth.auth.getSession();if(error||!data.session)throw new DomainError('unauthenticated',401);
 return verifyLogoutToken(data.session.access_token);
}
