/** This stores only a consent choice; it contains no account or form data. */
export const SOCIALHERO_CONSENT_KEY='dartspoint.analytics-consent.v1';
export const SOCIALHERO_CONSENT_MAX_AGE=180*24*60*60*1000;
export type AnalyticsConsent={version:1;choice:'granted'|'denied';decidedAt:number;expiresAt:number};
export const SOCIALHERO_CONSENT_BOOTSTRAP='window.socialheroConsent=false;';
declare global {interface Window {socialheroConsent?:boolean;}}
export function parseAnalyticsConsent(raw:string|null,now=Date.now()):AnalyticsConsent|null{
 try{
  const value=JSON.parse(raw??'null');
  if(!value||value.version!==1||!['granted','denied'].includes(value.choice)||!Number.isSafeInteger(value.decidedAt)||!Number.isSafeInteger(value.expiresAt)||value.decidedAt>now||value.expiresAt<=now||value.expiresAt<=value.decidedAt||value.expiresAt-value.decidedAt>SOCIALHERO_CONSENT_MAX_AGE)return null;
  return {version:1,choice:value.choice,decidedAt:value.decidedAt,expiresAt:value.expiresAt};
 }catch{return null;}
}
export function createAnalyticsConsent(choice:AnalyticsConsent['choice'],now=Date.now()):AnalyticsConsent{return {version:1,choice,decidedAt:now,expiresAt:now+SOCIALHERO_CONSENT_MAX_AGE};}
export function announceAnalyticsConsent(granted:boolean){
 window.socialheroConsent=granted;
 window.dispatchEvent(new CustomEvent('socialhero:consent',{detail:granted}));
}
