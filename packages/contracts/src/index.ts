import { z,ZodError } from 'zod';
export const PROTOCOL_VERSION = 1;
export const RESERVED_USERNAMES = new Set(['admin','administrator','moderator','mod','owner','eigenaar','support','system','dartspoint','beheer','beheerder','helpdesk','security','dartspointteam']);
export const usernameSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{3,20}$/).refine(v=>!RESERVED_USERNAMES.has(v.toLowerCase()),'Deze naam is gereserveerd.');
export const uuid = z.string().uuid();
export const renderSampleSchema=z.object({sampleAt:z.number().finite().positive(),connectionId:uuid,dartNumber:z.number().int().positive()}).strict();
export const commandSchema = z.object({protocolVersion:z.literal(1),commandId:uuid,expectedStateVersion:z.number().int().nonnegative(),matchId:uuid,type:z.enum(['match.ready','dart.stop_horizontal','dart.stop_vertical','match.forfeit','match.resync']),phaseToken:uuid.optional(),renderSample:renderSampleSchema.optional()}).strict();
export type GameCommand = z.infer<typeof commandSchema>;
export class DomainError extends Error {
 constructor(public code:string,public status=400,message='Deze actie kon niet worden uitgevoerd.',public retryAfter?:number) { super(message); }
}
export function requireThat(value:unknown,code:string,status=403,message?:string): asserts value {
 if(!value) throw new DomainError(code,status,message);
}
export function safeDestination(value:unknown):string {
 if(typeof value!=='string' || /[\\%\x00-\x20]/.test(value) || !/^\/(lobby|spelen|oefenen|clubhuis|divisies|toernooi(?:\/[A-Za-z0-9_-]+)?)(?:\?[^#]*)?$/.test(value)) return '/lobby';
 return value;
}

export function isValidationError(error:unknown){return error instanceof ZodError;}
