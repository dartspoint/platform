import type {Locale} from './locale';
import {message,type Values} from './messages';
/** Presentation only: these values come from the authoritative game snapshot.
 * This adapter never accepts chat, never mutates a snapshot and leaves unknown
 * historical messages intact. Names must match a known player prefix exactly. */
const nl={
 'gameEvents.openDouble':'Raak eerst een dubbel om je leg te openen.',
 'gameEvents.aim':'Stop je richting. Bepaal daarna de hoogte van je worp.',
 'gameEvents.forfeit':'Wedstrijd beëindigd door opgave.',
 'gameEvents.accountClosed':'De tegenstander heeft het account afgesloten.',
 'gameEvents.timeouts':'Wedstrijd verloren na drie opeenvolgende beurttijdoverschrijdingen.',
 'gameEvents.tooMany':'Te veel punten — je score gaat terug naar het begin van deze beurt.',
 'gameEvents.oneLeft':'1 over — je moet eindigen op een dubbel.',
 'gameEvents.noDouble':'Je eindigde zonder dubbel — probeer een dubbel of BULL.',
 'gameEvents.matchWon':'{name} wint de wedstrijd!',
 'gameEvents.stageWon':'{name} wint de {stage,select,set {set} other {leg}} · {left}–{right}',
 'gameEvents.bust':'{name} · {reason} Score terug naar {score}',
 'gameEvents.entry':'{name} · {hit} — eerst een dubbel om te openen',
 'gameEvents.visit':'{name} · {score,plural,one {# punt in deze beurt} other {# punten in deze beurt}}',
 'gameEvents.miss':'{name} · Net mis. Volgende pijl!',
 'gameEvents.hit':'{name} · {hit} — {score,plural,one {# punt} other {# punten}}{opened,select,true { · leg geopend} other {}}',
 'gameEvents.reconnect':'De verbinding wordt hersteld.',
 'gameEvents.retry':'We kunnen je wedstrijd niet openen. We proberen het opnieuw.',
 'gameEvents.modeRanked':'Gerankt','gameEvents.modeTournament':'Toernooi','gameEvents.modeDivision':'Divisie','gameEvents.modeCasual':'Vrij spelen',
};
const en:Record<keyof typeof nl,string>={
 'gameEvents.openDouble':'Hit a double first to open your leg.',
 'gameEvents.aim':'Stop the horizontal indicator, then choose the height of your throw.',
 'gameEvents.forfeit':'Match ended by forfeit.',
 'gameEvents.accountClosed':'Your opponent has closed their account.',
 'gameEvents.timeouts':'Match lost after three consecutive turn timeouts.',
 'gameEvents.tooMany':'Too many points — your score returns to the start of this turn.',
 'gameEvents.oneLeft':'1 left — you must finish on a double.',
 'gameEvents.noDouble':'You finished without a double — try a double or BULL.',
 'gameEvents.matchWon':'{name} wins the match!',
 'gameEvents.stageWon':'{name} wins the {stage,select,set {set} other {leg}} · {left}–{right}',
 'gameEvents.bust':'{name} · {reason} Score returns to {score}',
 'gameEvents.entry':'{name} · {hit} — hit a double first to open',
 'gameEvents.visit':'{name} · {score,plural,one {# point this turn} other {# points this turn}}',
 'gameEvents.miss':'{name} · Just missed. Next dart!',
 'gameEvents.hit':'{name} · {hit} — {score,plural,one {# point} other {# points}}{opened,select,true { · leg opened} other {}}',
 'gameEvents.reconnect':'Restoring the connection.',
 'gameEvents.retry':'We cannot open your match. Trying again.',
 'gameEvents.modeRanked':'Ranked','gameEvents.modeTournament':'Tournament','gameEvents.modeDivision':'Division','gameEvents.modeCasual':'Casual',
};
export type GameMessage={schemaVersion:1;key:keyof typeof nl;params?:Values};
export const gameMessageCatalogs={nl,en};
const fixed=new Map(Object.entries(nl).filter(([,value])=>!value.includes('{')).map(([key,value])=>[value,key as keyof typeof nl]));
export function gameMessageEvent(body:string,names:readonly string[]):GameMessage|null {
 const key=fixed.get(body);if(key)return {schemaVersion:1,key};
 const name=[...names].filter(Boolean).sort((a,b)=>b.length-a.length).find(name=>body.startsWith(name+' · ')||body.startsWith(name+' wint '));if(!name)return null;
 const suffix=body.slice(name.length);let parts:RegExpMatchArray|null;
 if(suffix===' wint de wedstrijd!')return {schemaVersion:1,key:'gameEvents.matchWon',params:{name}};
 if((parts=suffix.match(/^ wint de (set|leg) · (\d+)–(\d+)$/)))return {schemaVersion:1,key:'gameEvents.stageWon',params:{name,stage:parts[1],left:Number(parts[2]),right:Number(parts[3])}};
 for(const reason of [nl['gameEvents.tooMany'],nl['gameEvents.oneLeft'],nl['gameEvents.noDouble']]){const prefix=' · '+reason+' Score terug naar ';if(suffix.startsWith(prefix)&&/^\d+$/.test(suffix.slice(prefix.length)))return {schemaVersion:1,key:'gameEvents.bust',params:{name,reason,score:Number(suffix.slice(prefix.length))}};}
 if((parts=suffix.match(/^ · ((?:[SDT]?\d{1,2}|BULL|25|MIS)) — eerst een dubbel om te openen$/)))return {schemaVersion:1,key:'gameEvents.entry',params:{name,hit:parts[1]}};
 if((parts=suffix.match(/^ · (\d+) punten in deze beurt$/)))return {schemaVersion:1,key:'gameEvents.visit',params:{name,score:Number(parts[1])}};
 if(suffix===' · Net mis. Volgende pijl!')return {schemaVersion:1,key:'gameEvents.miss',params:{name}};
 if((parts=suffix.match(/^ · ((?:[SDT]?\d{1,2}|BULL|25|MIS)) — (\d+) punten( · leg geopend)?$/)))return {schemaVersion:1,key:'gameEvents.hit',params:{name,hit:parts[1],score:Number(parts[2]),opened:String(!!parts[3])}};
 return null;
}
export function renderGameMessage(body:string,locale:Locale,names:readonly string[]=[]):string {
 if(locale==='nl')return body;const event=gameMessageEvent(body,names);if(!event)return body;
 const params={...event.params};if(typeof params.reason==='string')params.reason=renderGameMessage(params.reason,locale);
 return message(gameMessageCatalogs[locale],locale,event.key,params);
}
