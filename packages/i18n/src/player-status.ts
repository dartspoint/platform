import type {Locale} from './locale';
const english:Record<string,string>={'Beschikbaar':'Available','Speelt':'Playing','Kijkt mee':'Watching','Speelt een wedstrijd':'Playing a match','Klaar voor een potje':'Ready for a game','Offline':'Offline'};
/** Only the existing server presentation codes for player presence belong here. */
export function playerStatusLabel(status:string,locale:Locale){return locale==='en'?(english[status]??status):status;}
