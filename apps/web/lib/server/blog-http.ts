import 'server-only';
import {randomUUID} from 'node:crypto';
import {DomainError,isValidationError,requireThat} from '../../../../packages/contracts/src/index';
import {isTrustedOrigin,trustedRequestOrigin} from '../../../../packages/i18n/src/domains';
import {authenticateBlogToken} from '../../../../packages/data/src/blog';
import {rateLimit} from '../../../../packages/data/src/db';
import type {BlogScope} from '../../../../packages/contracts/src/blog';

export const blogPrivateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
export function blogResponse(value:unknown,status=200,extra:Record<string,string>={}) {
  return Response.json(value,{status,headers:{...blogPrivateHeaders,'X-Request-ID':randomUUID(),...extra}});
}
export function blogFailure(error:unknown,requestId=randomUUID()) {
  let status=503,code='TEMPORARILY_UNAVAILABLE',message='De blog is tijdelijk niet beschikbaar. Probeer het later opnieuw.';
  let fields:Record<string,string>|undefined;
  if(error instanceof DomainError){status=error.status;code=error.code.toUpperCase();message=error.message;}
  else if(isValidationError(error)) {
    status=422;code='INVALID_CONTENT';message='Controleer de ingevulde velden en artikelinhoud.';
    fields={};for(const issue of (error as {issues:{path:(string|number)[];message:string}[]}).issues.slice(0,20))fields[issue.path.join('.')]=issue.message;
  } else if(error instanceof SyntaxError){status=400;code='INVALID_REQUEST';message='Het verzoek bevat ongeldige JSON.';}
  else if((error as {code?:string})?.code==='23505'){status=409;code='SLUG_CONFLICT';message='Deze URL is al in gebruik. Kies een andere slug.';}
  const aliases:Record<string,string>={UPLOAD_TOO_LARGE:'PAYLOAD_TOO_LARGE',REQUEST_TOO_LARGE:'PAYLOAD_TOO_LARGE',UNAUTHENTICATED:'UNAUTHENTICATED',FORBIDDEN:'PERMISSION_DENIED',IMAGE_TYPE:'INVALID_MEDIA',IMAGE_REQUIRED:'INVALID_MEDIA',INVALID_UPLOAD:'INVALID_MEDIA',ORIGIN:'PERMISSION_DENIED'};
  code=aliases[code]??code;
  // Error responses never echo request bodies, credentials or database messages.
  return blogResponse({code,message,error:message,requestId,...(fields?{fields}:{})},status,{'X-Request-ID':requestId,...(status===429?{'Retry-After':'60'}:{})});
}
export function requireBlogOrigin(request:Request){requireThat(isTrustedOrigin(request.headers.get('origin')),'origin',403,'Deze herkomst is niet toegestaan.');}
export async function readBlogJson(request:Request,maximum=400_000):Promise<any> {
  requireThat(request.headers.get('content-type')?.split(';')[0].trim()==='application/json','INVALID_REQUEST',415,'Gebruik application/json.');
  const reader=request.body?.getReader();requireThat(reader,'INVALID_REQUEST',400,'Het verzoek is leeg.');
  let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>maximum){await reader.cancel();throw new DomainError('PAYLOAD_TOO_LARGE',413,'Het verzoek is te groot.');}chunks.push(next.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let json:string;try{json=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new DomainError('INVALID_REQUEST',400,'Gebruik geldige UTF-8.');}
  return JSON.parse(json);
}
export function blogOperationKey(request:Request){const key=request.headers.get('idempotency-key');requireThat(key&&/^[A-Za-z0-9_:/.-]{1,240}$/.test(key),'INVALID_REQUEST',400,'Geef een geldige Idempotency-Key mee.');return key;}
export async function blogIntegration(request:Request,scope:BlogScope){
  // Caddy terminates TLS; only configured origins may receive site credentials.
  const origin=trustedRequestOrigin(request);requireThat(origin&&((process.env.APP_ENV??'development')==='development'||origin.startsWith('https://')),'PERMISSION_DENIED',403,'De bestemming is niet toegestaan.');
  const header=request.headers.get('authorization');requireThat(header?.startsWith('Bearer '),'UNAUTHENTICATED',401,'Een sitecredential is vereist.');
  const principal=await authenticateBlogToken(header!.slice(7),scope);
  await rateLimit('blog-api:'+principal.tokenId,120,60);
  return principal;
}
export function blogETag(revision:number){return '"'+revision+'"';}
