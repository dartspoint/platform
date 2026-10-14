import {isAuthApiError,isAuthSessionMissingError} from '@supabase/supabase-js';
import {DomainError} from '../../contracts/src/index';

type AuthenticationStage='keys'|'provider'|'storage';
const invalidTokenCodes=new Set([
 'ERR_JWS_INVALID','ERR_JWT_INVALID','ERR_JWT_EXPIRED',
 'ERR_JWT_CLAIM_VALIDATION_FAILED','ERR_JOSE_ALG_NOT_ALLOWED',
 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
]);

/** Missing evidence of identity is never permission to continue. */
export function authenticationFailure(error:unknown,stage:AuthenticationStage):DomainError {
 if(error instanceof DomainError)return error;
 const invalidProviderSession=stage==='provider'&&(isAuthSessionMissingError(error)||
  (isAuthApiError(error)&&error.status>=400&&error.status<500&&error.status!==429));
 const invalidToken=stage==='keys'&&typeof error==='object'&&error!==null&&
  'code' in error&&typeof error.code==='string'&&invalidTokenCodes.has(error.code);
 if(invalidProviderSession||invalidToken)return new DomainError('unauthenticated',401);
 // Network, unusable key sets and database errors do not prove an invalid
 // session. Fixed categories avoid exposing provider messages or SQL details.
 return new DomainError('auth_'+stage+'_unavailable',503,'Je sessie kan tijdelijk niet worden gecontroleerd. Probeer het later opnieuw.');
}

export async function authenticationStage<T>(stage:AuthenticationStage,operation:()=>Promise<T>):Promise<T> {
 try{return await operation();}catch(error){throw authenticationFailure(error,stage);}
}
