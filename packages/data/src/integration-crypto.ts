import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {DomainError} from '../../contracts/src/index';
export function masterKey(value:string|undefined){
 if(!value||!/^[A-Za-z0-9+/]{43}=$/.test(value))throw new DomainError('ai_encryption_configuration',503);
 const key=Buffer.from(value,'base64');if(key.length!==32||key.toString('base64')!==value)throw new DomainError('ai_encryption_configuration',503);return key;
}
export function encryptionStatus(){try{masterKey(process.env.AI_INTEGRATION_MASTER_KEY_B64);return !!process.env.AI_INTEGRATION_MASTER_KEY_ID;}catch{return false;}}
function aad(version:number){return Buffer.from(JSON.stringify(['openai','primary',process.env.APP_ENV??'development',version]));}
export function encryptIntegration(secret:string,version:number){
 const keyId=process.env.AI_INTEGRATION_MASTER_KEY_ID;if(!keyId||!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId))throw new DomainError('ai_encryption_configuration',503);
 const nonce=randomBytes(12),encoder=createCipheriv('aes-256-gcm',masterKey(process.env.AI_INTEGRATION_MASTER_KEY_B64),nonce);encoder.setAAD(aad(version));
 return {ciphertext:Buffer.concat([encoder.update(secret,'utf8'),encoder.final()]),nonce,tag:encoder.getAuthTag(),keyId};
}
export function decryptIntegration(row:{version:number;key_id:string;ciphertext:Buffer;nonce:Buffer;tag:Buffer}){
 try{
 const active=process.env.AI_INTEGRATION_MASTER_KEY_ID;
 const value=row.key_id===active?process.env.AI_INTEGRATION_MASTER_KEY_B64:JSON.parse(process.env.AI_INTEGRATION_PREVIOUS_KEYS_JSON??'{}')[row.key_id];
 const decoder=createDecipheriv('aes-256-gcm',masterKey(value),row.nonce);decoder.setAAD(aad(Number(row.version)));decoder.setAuthTag(row.tag);return Buffer.concat([decoder.update(row.ciphertext),decoder.final()]).toString('utf8');
 }catch{throw new DomainError('ai_encryption_configuration',503);}
}
