"use client";

import {useEffect,useRef,useState} from 'react';

type TurnstileApi={
 render:(element:HTMLElement,options:Record<string,unknown>)=>string;
 remove:(id:string)=>void;
 reset:(id:string)=>void;
};
declare global{interface Window{turnstile?:TurnstileApi}}

let sdkLoad:Promise<TurnstileApi>|undefined;
function loadTurnstile():Promise<TurnstileApi>{
 if(window.turnstile)return Promise.resolve(window.turnstile);
 if(sdkLoad)return sdkLoad;
 const pending=new Promise<TurnstileApi>((resolve,reject)=>{
  const script=document.createElement('script');
  const finish=(api?:TurnstileApi)=>{
   window.clearTimeout(timer);script.onload=null;script.onerror=null;
   if(api)resolve(api);else{script.remove();reject(new Error('Turnstile unavailable'));}
  };
  const timer=window.setTimeout(()=>finish(),15000);
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async=true;
  script.onload=()=>finish(window.turnstile);
  script.onerror=()=>finish();
  try{document.head.appendChild(script);}catch{finish();}
 });
 sdkLoad=pending;
 void pending.catch(()=>{if(sdkLoad===pending)sdkLoad=undefined;});
 return pending;
}

export function Turnstile({onToken,action='login'}:{onToken:(token:string)=>void;action?:'login'|'support'}){
 const ref=useRef<HTMLDivElement>(null),callback=useRef(onToken);callback.current=onToken;
 const [error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const key=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
 useEffect(()=>{
  callback.current('');setError('');
  const element=ref.current;if(!key||!element)return;
  let cancelled=false,id:string|undefined,api:TurnstileApi|undefined;
  const compact=element.getBoundingClientRect().width<300;
  const observer=new ResizeObserver(()=>{
   if(!cancelled&&(element.getBoundingClientRect().width<300)!==compact){
    callback.current('');setAttempt(value=>value+1);
   }
  });
  observer.observe(element);
  const fail=(message:string)=>{if(!cancelled){callback.current('');setError(message);}};
  void loadTurnstile().then(loaded=>{
   if(cancelled)return;api=loaded;
   id=api.render(element,{
    sitekey:key,theme:'dark',language:'nl',action,size:compact?'compact':'flexible',
    callback:(token:string)=>{if(!cancelled){setError('');callback.current(token);}},
    'expired-callback':()=>fail('De controle is verlopen. Probeer het nog eens.'),
    'timeout-callback':()=>fail('De controle duurde te lang. Probeer het nog eens.'),
    'error-callback':()=>fail('De controle lukte niet. Probeer het nog eens.'),
   });
  }).catch(()=>fail('De veiligheidscontrole kon niet laden. Controleer je verbinding en probeer het opnieuw.'));
  return ()=>{
   cancelled=true;observer.disconnect();callback.current('');
   if(id!==undefined)api?.remove(id);
  };
 },[key,attempt,action]);
 if(!key)return null;
 return <div>
  <div ref={ref}/>
  {error&&<div style={{marginTop:12,fontSize:13}}>
   <p role="alert">{error}</p>
   <button type="button" className="dp-auth-inline" onClick={()=>{callback.current('');setAttempt(value=>value+1);}}>Opnieuw proberen</button>
  </div>}
 </div>;
}
