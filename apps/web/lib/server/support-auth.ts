import 'server-only';
import {cookies} from 'next/headers';
import {serverAuth} from './auth';
import {verifySupportToken} from '../../../../packages/data/src/auth';
import {authenticationFailure,authenticationStage} from '../../../../packages/data/src/auth-failures';
import {DomainError} from '../../../../packages/contracts/src/index';
import {supportGuestIdentity,type SupportIdentity} from '../../../../packages/data/src/support';
export async function currentSupportActor(request?:Request){
 const bearer=request?.headers.get('authorization');
 if(bearer?.startsWith('Bearer '))return verifySupportToken(bearer.slice(7));
 const auth=await serverAuth();const {data,error}=await authenticationStage('provider',()=>auth.auth.getSession());if(error)throw authenticationFailure(error,'provider');if(!data.session)throw new DomainError('unauthenticated',401);
 return verifySupportToken(data.session.access_token);
}
export async function currentSupportIdentity(request?:Request):Promise<SupportIdentity>{
 let actor;try{actor=await currentSupportActor(request);}catch(error){if(!(error instanceof DomainError&&(error.status===401||error.code==='account_closed')))throw error;}
 const guest=await supportGuestIdentity((await cookies()).get('dp_support_guest')?.value);
 return {actor:actor??null,guest};
}
