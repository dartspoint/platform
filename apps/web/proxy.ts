import {providerFetch} from '../../packages/data/src/fetch';
import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
export async function proxy(request:NextRequest){
 let response=NextResponse.next({request});
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL)return response;
 const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{global:{fetch:providerFetch},cookies:{getAll:()=>request.cookies.getAll(),setAll:values=>{values.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});values.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
 await auth.auth.getUser();response.headers.set('Cache-Control','private, no-store');return response;
}
export const config={matcher:['/lobby/:path*','/spelen/:path*','/oefenen/:path*','/clubhuis/:path*','/divisies/:path*','/toernooi/:path*','/beheer/:path*']};
