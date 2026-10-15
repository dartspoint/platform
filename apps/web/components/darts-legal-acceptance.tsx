'use client';
import {useEffect,useRef,useState} from 'react';
/** Mount outside the board. Never opens or requests acceptance during a match. */
export function DartsLegalAcceptance({activeMatch=false}:{activeMatch?:boolean}){
 const [data,setData]=useState<any>(null),[age,setAge]=useState(false),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const displayedVersion=useRef<string|null>(null);
 useEffect(()=>{
  if(activeMatch||busy)return;
  let live=true,inFlight=false;
  const controller=new AbortController();
  async function refresh(){
   if(!live||inFlight||document.visibilityState==='hidden')return;
   inFlight=true;
   try{
    const response=await fetch('/api/documents?acceptance=1',{cache:'no-store',signal:controller.signal});
    if(!response.ok)return;
    const value=await response.json();
    if(!live)return;
    const version=value?.current?.terms?.id&&value?.current?.privacy?.id?`${value.current.terms.id}:${value.current.privacy.id}`:null;
    if(version!==displayedVersion.current){displayedVersion.current=version;setAge(false);setAccepted(false);setError('');}
    setData(value);
   }catch{/* Keep the last known requirement until the next successful refresh. */}
   finally{inFlight=false;}
  }
  const refreshVisible=()=>{void refresh();};
  void refresh();
  window.addEventListener('focus',refreshVisible);
  document.addEventListener('visibilitychange',refreshVisible);
  const interval=window.setInterval(refreshVisible,30_000);
  return()=>{live=false;controller.abort();window.clearInterval(interval);window.removeEventListener('focus',refreshVisible);document.removeEventListener('visibilitychange',refreshVisible);};
 },[activeMatch,busy]);
 if(activeMatch||!data?.required||!data.current?.terms||!data.current?.privacy)return null;
 async function submit(){setBusy(true);setError('');try{const r=await fetch('/api/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'accept',termsVersionId:data.current.terms.id,privacyVersionId:data.current.privacy.id,age16Confirmed:age,termsAccepted:accepted})}),value=await r.json();if(!r.ok)throw new Error(value.error);setData(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <aside className="dp-legal-acceptance" aria-labelledby="legal-accept-title" style={{padding:20,border:'1px solid #708e61',borderRadius:10,margin:16}}><h2 id="legal-accept-title">Voorwaarden vóór je volgende deelname</h2><p>{data.required.summary}</p><p><a href="/algemene-voorwaarden" target="_blank" rel="noopener noreferrer">Lees de voorwaarden, versie {data.current.terms.version}</a>. <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacyverklaring, versie {data.current.privacy.version}</a> (ter informatie).</p><label style={{display:'block'}}><input type="checkbox" checked={age} onChange={e=>setAge(e.target.checked)}/> Ik ben ten minste 16 jaar.</label><label style={{display:'block'}}><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> Ik aanvaard deze voorwaarden.</label>{error&&<p role="alert">{error}</p>}<button onClick={()=>void submit()} disabled={busy||!age||!accepted}>Voorwaarden aanvaarden</button><p><a href="/support">Support en privacyverzoeken</a> blijven bereikbaar.</p></aside>;
}
