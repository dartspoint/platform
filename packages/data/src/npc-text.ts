import {createHash} from 'node:crypto';
export const TEXT_WINDOW_MS=12*60*60*1000;
export function canonicalizeNpcText(body:string,names:string[]=[]){
 let text=body.normalize('NFKD').replace(/[\p{M}\p{Cf}\p{So}\p{Sk}]/gu,'').toLowerCase();
 for(const name of names){const escaped=name.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(escaped)text=text.replace(new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','gu'),' ');}
 return text.replace(/\p{N}+/gu,' ').replace(/[^\p{L}\s]/gu,' ').replace(/\s+/g,' ').trim();
}
export function fingerprint(text:string){return createHash('sha256').update('npc-text-v1:'+text).digest('hex');}
function shingles(s:string){return new Set(Array.from({length:Math.max(0,s.length-2)},(_,i)=>s.slice(i,i+3)));}
export function nearDuplicate(a:string,b:string){
 if(a===b)return true;if(!a||!b)return false;
 const aa=new Set(a.split(' ')),bb=new Set(b.split(' ')),common=[...aa].filter(x=>bb.has(x)).length;
 if(common>=Math.min(aa.size,bb.size)&&Math.min(a.length,b.length)/Math.max(a.length,b.length)>.6)return true;
 const x=shingles(a),y=shingles(b),overlap=[...x].filter(t=>y.has(t)).length;
 return x.size+y.size>0&&2*overlap/(x.size+y.size)>=.84;
}
export function textFamily(text:string){
 const t=canonicalizeNpcText(text);
 if(/^(hoi|hi|hello|hey|hallo|heey|ha)( iedereen| everyone| allemaal)?$/.test(t))return 'greeting-short-v1';
 if(/^(goed gespeeld|well played|nice game|mooie pot)$/.test(t))return 'well-played-v1';
 return null;
}
/** No unverified game facts are supplied to free generation in V1. */
export function safeConversationText(text:string,source:string){
 if(/\b(180|finish|checkout|gewonnen|won|winner|winnaar|dubbel|double|score|uitslag|victory|congrat|gefeliciteerd|netjes gegooid|well played|nice throw|vorige partij|last game)\b/i.test(text))return false;
 if(/^(?:(?:hoi|hi|hello|hey|hallo|heey)[\s,!?.]*)+$/i.test(source.trim())&&/\b(spel|game|match|potje|darts|play|speel)\b/i.test(text))return false;
 return true;
}
