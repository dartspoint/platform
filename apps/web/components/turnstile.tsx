"use client";
import {useEffect,useRef} from 'react';
declare global{interface Window{turnstile?:{render:(element:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void;reset:(id:string)=>void}}}
export function Turnstile({onToken}:{onToken:(token:string)=>void}){
 const ref=useRef<HTMLDivElement>(null),callback=useRef(onToken);callback.current=onToken;
 useEffect(()=>{
  const key=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;if(!key)return;
  let id:string|undefined,cancelled=false;
  const render=()=>{if(!cancelled&&ref.current&&window.turnstile)id=window.turnstile.render(ref.current,{sitekey:key,theme:'dark',callback:(token:string)=>{if(!cancelled)callback.current(token);},'expired-callback':()=>{if(!cancelled)callback.current('');},'error-callback':()=>{if(!cancelled)callback.current('');}});};
  if(window.turnstile)render();else{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=render;document.head.appendChild(script);}
  return ()=>{cancelled=true;if(id)window.turnstile?.remove(id);};
 },[]);
 return <div ref={ref}/>;
}
