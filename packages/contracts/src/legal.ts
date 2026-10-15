import {z} from 'zod';

export const legalDocumentKeys=['terms','privacy','guide'] as const;
export type LegalDocumentKey=typeof legalDocumentKeys[number];
export const legalPaths:Record<LegalDocumentKey,string>={terms:'/algemene-voorwaarden',privacy:'/privacy',guide:'/handleiding'};
export const legalTitles:Record<LegalDocumentKey,string>={terms:'Algemene voorwaarden',privacy:'Privacyverklaring',guide:'Handleiding'};
export const companyDetails={name:'DG Webservices',address:'Markenseplein 1',postalCode:'2583 KR',city:'Den Haag',chamberOfCommerce:'88135713',email:'info@dgwebservices.nl',supportEmail:'support@dartspoint.nl'};
export const rolloutGateKeys=['staging_review','retention_jobs','backup_maximum_age','restore_replay','mail_delivery','provider_configuration'] as const;
export const legalDraftSchema=z.object({key:z.enum(legalDocumentKeys),title:z.string().trim().min(3).max(150),version:z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/),language:z.literal('nl'),markdown:z.string().trim().min(50).max(100000),summary:z.string().trim().min(5).max(2000),material:z.boolean(),requiresAcceptance:z.boolean(),reason:z.string().trim().min(5).max(500)}).strict();
export const legalPublishSchema=z.object({versionId:z.string().uuid(),effectiveAt:z.string().datetime({offset:true}),exceptionReason:z.string().trim().min(10).max(1000).optional(),reason:z.string().trim().min(5).max(500)}).strict();
export const legalAcceptanceSchema=z.object({termsVersionId:z.string().uuid(),privacyVersionId:z.string().uuid(),age16Confirmed:z.literal(true),termsAccepted:z.literal(true)}).strict();
export const legalOnboardingSchema=legalAcceptanceSchema.extend({username:z.string().max(80)}).strict();
export type LegalVersion={id:string;key:LegalDocumentKey;title:string;version:string;language:'nl';markdown:string;summary:string;material:boolean;requiresAcceptance:boolean;createdAt:string;publishedAt:string|null;effectiveAt:string|null};

/** Safe destinations are local paths from a fixed product allowlist. */
export function safeAuthDestination(value:string|null|undefined){
 if(value&&['/lobby','/spelen','/divisies','/clubhuis','/oefenen','/mijn-tickets','/support','/account/privacy','/team/support'].includes(value))return value;
 if(value&&/^\/(mijn-tickets|team\/support|support)\?ticket=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))return value;
 if(value&&/^\/account\/privacy\?request=(access|export|correct|delete_account|delete_data|object|restrict)$/.test(value))return value;
 if(value&&/^\/toernooi\/[A-Za-z0-9_-]{1,100}$/.test(value))return value;
 return '/lobby';
}
export function safeDocumentLink(value:string){
 if(/^\/(?!\/)/.test(value)&&!/[\\\u0000-\u0020]/.test(value))return value;
 try{const url=new URL(value);if(['https:','mailto:'].includes(url.protocol))return value;}catch{/* Render unsafe links as text. */}
 return null;
}
export function validatePublicationTiming(input:{material:boolean;publishedAt:Date;effectiveAt:Date;exceptionReason?:string}){
 if(input.effectiveAt.getTime()<input.publishedAt.getTime()-60000)throw new Error('De ingangsdatum mag niet in het verleden liggen.');
 if(input.material&&input.effectiveAt.getTime()-input.publishedAt.getTime()<30*86400000&&!input.exceptionReason)throw new Error('Een wezenlijke wijziging wordt minstens 30 dagen aangekondigd. Leg een noodzakelijke wettelijke of beveiligingsuitzondering uit.');
}
