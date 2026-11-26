import {createCipheriv,createDecipheriv,createHash,hkdfSync,randomBytes} from 'node:crypto';
import {z} from 'zod';

/** Portable v1 transport and secret handling. The website adapter owns persistence and authorization. */
export const pairingClaimSchema=z.object({
  connectionId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
  destinationId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
  accessToken:z.string().min(43).max(2048).regex(/^[\x21-\x7e]+$/),
  expiresAt:z.string().datetime({offset:true}),
}).strict();
export type PairingClaim=z.infer<typeof pairingClaimSchema>;
export class ConnectorError extends Error {
  constructor(public code:string,public status:number,message:string){super(message);}
}
export function connectorOrigin(value:string,development=false){
  try{const url=new URL(value);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(development&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw new Error();return url.origin;}
  catch{throw new ConnectorError('SOCIALHERO_CONFIGURATION_INVALID',503,'De SocialHero-serverconfiguratie is onvolledig.');}
}
export const credentialHash=(value:string)=>createHash('sha256').update(value).digest('hex');
function encryptionKey(secret:string){if(secret.length<32)throw new ConnectorError('SOCIALHERO_CONFIGURATION_INVALID',503,'De SocialHero-serverconfiguratie is onvolledig.');return Buffer.from(hkdfSync('sha256',secret,'socialhero-v1','temporary-provisioning-credential',32));}
export function sealCredential(value:string,secret:string,binding:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(secret),iv);cipher.setAAD(Buffer.from(binding));
  const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(b=>b.toString('base64url')).join('.');
}
export function openCredential(value:string,secret:string,binding:string){
  try{const [iv,tag,bytes]=value.split('.').map(b=>Buffer.from(b,'base64url'));const cipher=createDecipheriv('aes-256-gcm',encryptionKey(secret),iv);cipher.setAAD(Buffer.from(binding));cipher.setAuthTag(tag);return Buffer.concat([cipher.update(bytes),cipher.final()]).toString('utf8');}
  catch{throw new ConnectorError('PAIRING_EXPIRED',410,'De installatie kan niet worden hervat. Koppel opnieuw met een nieuwe code.');}
}
const remoteErrors:Record<string,[number,string]>={
  INVALID_PAIRING_CODE:[400,'De koppelcode is ongeldig of al gebruikt.'],
  PAIRING_EXPIRED:[410,'De koppelcode of installatie is verlopen. Maak in SocialHero een nieuwe code.'],
  DESTINATION_MISMATCH:[409,'Deze code hoort bij een andere website of omgeving.'],
  INVALID_CREDENTIAL:[401,'SocialHero heeft deze verbinding afgewezen. Koppel opnieuw.'],
  PERMISSION_DENIED:[403,'SocialHero staat deze koppeling niet toe.'],
  RATE_LIMITED:[429,'Er zijn te veel pogingen gedaan. Probeer het over een minuut opnieuw.'],
};
export async function providerRequest(origin:string,path:string,body?:unknown,token?:string,transport:typeof fetch=fetch){
  if(!/^\/api\/integrations\/blog\/v1\/pairings\/(claim|[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}\/verify)$/.test(path))throw new ConnectorError('SOCIALHERO_CONFIGURATION_INVALID',503,'Ongeldig integratiepad.');
  let response:Response;
  try{response=await transport(origin+path,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12_000),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body??{})});}
  catch{throw new ConnectorError('SOCIALHERO_UNAVAILABLE',503,'SocialHero is niet bereikbaar. Je kunt de verbinding opnieuw controleren.');}
  // Never propagate provider bodies or validation errors containing secrets.
  let result:any;try{
    const reader=response.body?.getReader();if(!reader)throw new Error();
    const chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16_384){await reader.cancel();throw new Error();}chunks.push(part.value);}}finally{reader.releaseLock();}
    result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{throw new ConnectorError('SOCIALHERO_UNAVAILABLE',503,'SocialHero gaf geen geldig antwoord. Probeer opnieuw.');}
  if(!response.ok){const error=remoteErrors[result?.code];throw new ConnectorError(error?result.code:'SOCIALHERO_UNAVAILABLE',error?.[0]??503,error?.[1]??'SocialHero is tijdelijk niet beschikbaar. Probeer opnieuw.');}
  return result as unknown;
}
