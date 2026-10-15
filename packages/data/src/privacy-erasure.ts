import type {PoolClient} from 'pg';
import {db} from './db';
import {uuid,requireThat} from '../../contracts/src/index';
export type DatabaseErasureResult={userId:string;scopes:string[];databaseErased:boolean;retainedExceptions:{id:string;category:string;purpose:string;legalBasis:string;reviewAt:string;expiresAt:string}[];minimalMatchRetentionUntil:string|null;authErasureRequired:boolean};
/** Worker-only capability: the database verifies confirmed request and durable receipt. */
export async function applyDatabaseErasure(requestId:string,ledgerId:string):Promise<DatabaseErasureResult>{
 uuid.parse(requestId);uuid.parse(ledgerId);const row=(await db().query('select private.erase_subject($1,$2) result',[requestId,ledgerId])).rows[0];requireThat(row?.result,'erasure_failed',503);return row.result;
}
/** Accept the caller's transaction so account closure and revocation are atomic. */
export async function closeSubjectSessions(userId:string,requestId:string,client?:PoolClient){
 uuid.parse(userId);uuid.parse(requestId);await (client??db()).query('select private.close_subject_sessions($1,$2)',[userId,requestId]);
}
