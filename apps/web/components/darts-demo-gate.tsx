import type {ReactNode} from 'react';
import {redirect} from 'next/navigation';
import {currentActor} from '@/lib/server/auth';
import {bootstrap} from '../../../packages/data/src/projections';
import {PlatformProvider} from '@/lib/platform-client';
export async function DemoGate({children,staff=false,room=false}:{children:ReactNode;staff?:boolean;room?:boolean}){
 let actor;
 try{actor=await currentActor();}catch{redirect('/inloggen');}
 if(staff&&!['owner','admin'].includes(actor.role))redirect('/lobby');
 const initial=await bootstrap(actor);
 if(room){
  const active=initial.matches.find(m=>m.players?.some((p:any)=>p.id===actor.id));
  if(active)redirect('/spelen?match='+active.id);
  if(!initial.players.find(p=>p.id===actor.id)?.presence.roomId)redirect('/lobby?kamer=kiezen');
 }
 return <PlatformProvider initial={initial}>{children}</PlatformProvider>;
}
