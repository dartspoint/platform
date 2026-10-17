import nl from './catalogs/feedback.nl.json';
import en from './catalogs/feedback.en.json';
import {browserLocale} from './errors';
import {message,type Values} from './messages';
export function runtimeFeedback(key:string,values?:Values){const locale=browserLocale();return message(locale==='en'?en:nl,locale,key,values);}
