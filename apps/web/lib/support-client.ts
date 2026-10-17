"use client";
import {errorText,browserLocale} from "../../../packages/i18n/src/errors";
import {formatLocales} from "../../../packages/i18n/src/locale";

export type SupportRole='tournament'|'chat'|'game'|'platform';
export const SUPPORT_ROLES:Record<SupportRole,string>={tournament:'Toernooienbeheer',chat:'Chatbeheer',game:'Spelbeheer',platform:'Platformbeheer'};
export const SUPPORT_STATUSES={new:'Nieuw',in_progress:'In behandeling',waiting_player:'Wacht op speler',waiting_team:'Wacht op team',resolved:'Opgelost',closed:'Gesloten'} as const;
export type SupportStatus=keyof typeof SUPPORT_STATUSES;
export type SupportTopic={id:string;name:string;nameEn?:string;description:string;descriptionEn?:string;roles:SupportRole[];protectedKind?:string|null;active:boolean;sortOrder:number;defaultPriority:string;responseHours:number;requiredFields?:string[];notificationMode?:'in_app'|'email'|'digest';affectedTicketCount?:number};
export type SupportIdentity={actor:{id:string;username?:string;role?:string}|null;roles:SupportRole[];firstName:string|null;canManageTeam:boolean;canExecutePrivacy:boolean;canManageTopics:boolean;notificationMode?:'email'|'digest'|'in_app';guestVerified?:boolean};
export type SupportTicket={id:string;number:number;title:string;topicId:string;topicName:string;topicNameEn?:string;status:SupportStatus;priority:string;assignedTo:string|null;assigneeName?:string|null;requesterName?:string;createdAt:string|number;updatedAt:string|number;unread:boolean;context?:Record<string,unknown>;privacy?:Record<string,unknown>;guestVerified?:boolean;isGuest?:boolean;requesterId?:string|null};
export type SupportMessage={id:string;body:string;visibility:'public'|'internal';authorName?:string;authorRole?:string;createdAt:string|number;kind?:string};
export type SupportAttachment={id:string;messageId:string;name:string;size:number;scanStatus:string;downloadUrl?:string|null;createdAt?:string};
export type SupportTemplate={id:string;topicId?:string|null;name:string;nameEn?:string;body:string;bodyEn?:string;active:boolean};
export type SupportDelivery={id:string;kind:string;status:string;attempts:number;nextTry:number|null;firstAttemptAt:number|null;updatedAt:number|null;canRetry:boolean;requiresReconciliation:boolean;busy:boolean};
export type SupportDetail={ticket:SupportTicket;messages:SupportMessage[];attachments:SupportAttachment[];events:{id:string;type?:string;description?:string;createdAt:string|number;kind?:string;reason?:string}[];canReply:boolean;canStaff:boolean;canLink?:boolean;following?:boolean;templates:SupportTemplate[];assignees?:{id:string;firstName:string;username:string}[];deliveries?:SupportDelivery[];canReconcileMail?:boolean;mailReauthRequired?:boolean};
export type SupportTeamUser={id:string;username:string;roles:SupportRole[];firstName:string|null;legacyRole:string;canManageTeam:boolean;canExecutePrivacy:boolean};

export class SupportError extends Error{
 constructor(message:string,public status:number,public code?:string,public details?:unknown){super(message);}
}
export async function supportApi<T=unknown>(path:string,input?:unknown,signal?:AbortSignal):Promise<T>{
 const multipart=typeof FormData!=='undefined'&&input instanceof FormData;
 const response=await fetch('/api/support/'+path,{method:input===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal,headers:input===undefined||multipart?{}:{'Content-Type':'application/json'},body:input===undefined?undefined:multipart?input as FormData:JSON.stringify(input)});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new SupportError(errorText(data?.code,browserLocale(),data?.error),response.status,data?.code,data);
 return data as T;
}
export function supportDate(value:string|number){const date=new Date(value);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat(formatLocales[browserLocale()],{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);}
export function supportError(error:unknown){return error instanceof Error?error.message:'Dit is niet gelukt. Probeer het nog eens.';}
export function supportRequestId(){return crypto.randomUUID();}

export function supportISO(value:string|number){const date=new Date(value);return Number.isNaN(date.getTime())?undefined:date.toISOString();}

export function supportRoleLabels(locale:'nl'|'en'){return locale==='en'?{tournament:'Tournament management',chat:'Chat moderation',game:'Game moderation',platform:'Platform administration'}:SUPPORT_ROLES;}
export function supportStatusLabels(locale:'nl'|'en'){return locale==='en'?{new:'New',in_progress:'In progress',waiting_player:'Waiting for player',waiting_team:'Waiting for team',resolved:'Resolved',closed:'Closed'}:SUPPORT_STATUSES;}
export function supportTopicName(topic:{name:string;nameEn?:string|null},locale:'nl'|'en'){return locale==='en'?(topic.nameEn||topic.name+' (Nederlands)'):topic.name;}
export function supportTopicDescription(topic:{description:string;descriptionEn?:string|null},locale:'nl'|'en'){return locale==='en'?(topic.descriptionEn||topic.description+' (Nederlands)'):topic.description;}
