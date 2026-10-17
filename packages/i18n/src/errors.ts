import nl from './catalogs/errors.nl.json';
import en from './catalogs/errors.en.json';
import {domainLocale,isLocale,type Locale} from './locale';
export function browserLocale():Locale {return typeof document!=='undefined'&&isLocale(document.documentElement.lang)?document.documentElement.lang:'nl';}
export function requestLocale(request:Request):Locale {
 const explicit=request.headers.get('x-dp-locale'),cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)(?:dp-ui-locale|dp-locale)=(nl|en)(?:;|$)/)?.[1];
 return isLocale(explicit)?explicit:isLocale(cookie)?cookie:domainLocale(request.headers.get('host')??new URL(request.url).host);
}
export function errorText(code:string|undefined,locale:Locale=browserLocale(),legacy?:string) {
 const catalog:Record<string,string>=locale==='en'?en:nl;
 return catalog['errors.'+code]??(locale==='nl'&&legacy&&legacy!==code?legacy:catalog['errors.unknown']);
}
