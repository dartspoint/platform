"use client";
import {useEffect,useState} from 'react';
import {CircleHelp,MessageCircle,ShieldCheck,UserRound} from 'lucide-react';
import {supportApi,type SupportIdentity} from '@/lib/support-client';

export function useSupportIdentity(enabled=true){
 const [identity,setIdentity]=useState<SupportIdentity|null>(null);
 useEffect(()=>{if(!enabled)return;const controller=new AbortController();let live=true;const load=()=>{void supportApi<SupportIdentity>('me',undefined,controller.signal).then(result=>{if(live)setIdentity(result);}).catch(()=>{if(live)setIdentity(null);});};load();window.addEventListener('focus',load);return()=>{live=false;controller.abort();window.removeEventListener('focus',load);};},[enabled]);
 return identity;
}

export function SupportQuickLinks({className='',newTab=false,account=true}:{className?:string;newTab?:boolean;account?:boolean}){
 const identity=useSupportIdentity();const target=newTab?'_blank':undefined,rel=newTab?'noopener noreferrer':undefined;
 return <><a className={className} href="/support" target={target} rel={rel}><CircleHelp size={17}/>Hulp en support{newTab?' ↗':''}</a><a className={className} href="/mijn-tickets" target={target} rel={rel}><MessageCircle size={17}/>Mijn tickets{newTab?' ↗':''}</a>{account&&<a className={className} href="/account/privacy" target={target} rel={rel}><UserRound size={17}/>Account en privacy{newTab?' ↗':''}</a>}{!!identity?.roles.length&&<a className={className} href="/team/support" target={target} rel={rel}><ShieldCheck size={17}/>Team Support{newTab?' ↗':''}</a>}</>;
}
