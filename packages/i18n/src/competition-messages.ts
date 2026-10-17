import nl from './catalogs/competitionMessages.nl.json';
import en from './catalogs/competitionMessages.en.json';
import {message,type Values} from './messages';
import {browserLocale} from './errors';
import type {Locale} from './locale';
const fixed=new Map(Object.entries(nl).filter(([,value])=>!value.includes('{')).map(([key,value])=>[value,key]));
/** Only call for the existing competition model's generated blockers/labels.
 * Keep the source blockers for eligibility, filtering, scheduling and audit.
 * Never call for descriptions, chat, tickets or arbitrary player prose. */
export function competitionText(source:string,names:readonly string[]=[],locale:Locale=browserLocale()):string {
 if(locale==='nl')return source;
 const t=(key:string,params?:Values)=>message(en,locale,'competitionMessages.'+key,params);
 const exact=fixed.get(source);if(exact)return message(en,locale,exact);
 let parts:RegExpMatchArray|null;
 if((parts=source.match(/^Minimaal (\d+) DP$/)))return t('minimumRating',{rating:Number(parts[1])});
 if((parts=source.match(/^Maximaal (\d+) DP$/)))return t('maximumRating',{rating:Number(parts[1])});
 if((parts=source.match(/^Minimaal (\d+) gespeelde wedstrijden$/)))return t('minimumMatches',{count:Number(parts[1])});
 for(const [pattern,key]of [[/^Verliezersronde (\d+)$/,'losersRound'],[/^Tweede kans · ronde (\d+)$/,'losersLane'],[/^Winnaars · ronde (\d+)$/,'winnersLane']] as const){if((parts=source.match(pattern)))return t(key,{round:Number(parts[1])});}
 if((parts=source.match(/^Laatste (\d+)$/)))return t('last',{count:Number(parts[1])});
 for(const name of [...names].sort((a,b)=>b.length-a.length)){
  const prefix=name+': ';if(!source.startsWith(prefix))continue;const suffix=source.slice(prefix.length);
  const key=({'voldoet niet aan deelnamevoorwaarden':'notEligible','check-in ontbreekt':'checkIn','nog niet klaar':'notReady','al aan een ander bord':'otherBoard'} as Record<string,string>)[suffix];if(key)return t(key,{name});
  if((parts=suffix.match(/^nog (\d+)s rust$/)))return t('rest',{name,seconds:Number(parts[1])});
 }
 const tied=': gedeelde stand op de grens. Spelers blijven staan; deel het volgende conceptseizoen handmatig in na een beslissingswedstrijd.';
 if(source.endsWith(tied))for(const upper of names)for(const lower of names)if(source===upper+' / '+lower+tied)return t('divisionTie',{upper,lower});
 return source;
}
