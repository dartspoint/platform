import {providerFetch} from '../../packages/data/src/fetch';
import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
import {domainLocale, isLocale, publicPaths, stripLocale} from '../../packages/i18n/src/locale';
import {trustedOrigins} from '../../packages/i18n/src/domains';
export async function proxy(request:NextRequest){
 const host = request.headers.get('host') ?? request.nextUrl.host;
 if(!trustedOrigins().some(origin => new URL(origin).host === host)) return new NextResponse('Unknown host',{status:421});
 const original=request.nextUrl.pathname, path=stripLocale(original), prefixed=original!==path;
 const guest=request.cookies.get('dp-locale')?.value;
 const locale=publicPaths.includes(path)?(prefixed?original.split('/')[1]:domainLocale(host)):isLocale(guest)?guest:prefixed?original.split('/')[1]:domainLocale(host);
 const requestHeaders=new Headers(request.headers);
 requestHeaders.set('x-dp-path',original); requestHeaders.set('x-dp-locale',locale);
 // Only public content and entry flows have translated URL aliases. Gameplay
 // keeps its route and component identity when the player changes language.
 const mayRewrite=publicPaths.includes(path)||['/inloggen','/registreren','/support'].includes(path);
 if(prefixed&&!mayRewrite)return NextResponse.redirect(new URL(path+request.nextUrl.search,request.url));
 const makeResponse=()=>NextResponse.next({request:{headers:requestHeaders}});
 let response=makeResponse();
 const personal=/^\/(lobby|spelen|oefenen|clubhuis|divisies|toernooi|beheer|updates)(\/|$)/.test(path);
 if(personal&&process.env.NEXT_PUBLIC_SUPABASE_URL){
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{global:{fetch:providerFetch},cookies:{getAll:()=>request.cookies.getAll(),setAll:values=>{values.forEach(({name,value})=>request.cookies.set(name,value));requestHeaders.set('cookie',request.cookies.toString());response=makeResponse();values.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
  await auth.auth.getUser();
 }
 response.headers.set('Cache-Control','private, no-store');
 response.headers.set('Content-Language',locale);
 response.headers.append('Vary','Host');
 return response;
}
export const config={matcher:['/((?!api|_next|healthz|readyz|.*\\.).*)']};
