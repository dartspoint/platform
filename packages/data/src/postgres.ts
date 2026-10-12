import {rootCertificates} from 'node:tls';
import type {PoolConfig} from 'pg';
/** URL SSL flags must never override certificate verification in node-postgres. */
export function postgresOptions(value:string):PoolConfig{
 const url=new URL(value);const local=process.env.APP_ENV==='development'&&['127.0.0.1','localhost','db'].includes(url.hostname);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Invalid database configuration');
 if(!local){const modes=url.searchParams.getAll('sslmode');if(modes.length!==1||!['require','verify-full'].includes(modes[0]))throw new Error('Verified database TLS is required');}
 for(const key of [...url.searchParams.keys()])if(key.startsWith('ssl')){if(key!=='sslmode')throw new Error('Use the reviewed certificate configuration');url.searchParams.delete(key);}
 const encoded=process.env.DATABASE_CA_CERT_BASE64;let ca:string|undefined;
 if(encoded){ca=Buffer.from(encoded,'base64').toString('utf8');if(!ca.includes('-----BEGIN CERTIFICATE-----')||!ca.includes('-----END CERTIFICATE-----'))throw new Error('Invalid database CA certificate');}
 return {connectionString:url.toString(),...(!local?{ssl:{rejectUnauthorized:true,...(ca?{ca:[...rootCertificates,ca]}:{})}}:{})};
}
