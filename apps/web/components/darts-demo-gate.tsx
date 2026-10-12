import type {ReactNode} from 'react';
import {redirect} from 'next/navigation';
import {currentActor} from '@/lib/server/auth';
import {bootstrap} from '../../../packages/data/src/projections';
import {PlatformProvider} from '@/lib/platform-client';
export async function DemoGate({children,staff=false}:{children:ReactNode;staff?:boolean}){
 let actor;
 try{actor=await currentActor();}catch{redirect('/inloggen');}
 if(staff&&!['owner','admin'].includes(actor.role))redirect('/lobby');
 return <PlatformProvider initial={await bootstrap(actor)}>{children}</PlatformProvider>;
}
