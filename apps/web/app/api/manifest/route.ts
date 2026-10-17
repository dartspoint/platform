import base from '../../../../../packages/i18n/src/manifest-base.json';
import {isLocale} from '../../../../../packages/i18n/src/locale';
import {requestLocale} from '../../../../../packages/i18n/src/errors';
export function GET(request:Request){const chosen=new URL(request.url).searchParams.get('locale'),locale=isLocale(chosen)?chosen:requestLocale(request);return Response.json({...base,lang:locale,description:locale==='en'?'Your room. Your match. Your evening.':'Jouw kamer. Jouw wedstrijd. Jouw avond.',shortcuts:base.shortcuts.map(shortcut=>({...shortcut,name:locale==='en'?'Practice':'Oefenen',short_name:locale==='en'?'Practice':'Oefenen'}))},{headers:{'Content-Type':'application/manifest+json','Cache-Control':'private, no-store','Vary':'Host, Cookie'}});}
