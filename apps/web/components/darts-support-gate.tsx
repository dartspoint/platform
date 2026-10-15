import type {ComponentProps} from 'react';
import {currentActor} from '@/lib/server/auth';
import {bootstrap} from '../../../packages/data/src/projections';
import {DomainError} from '../../../packages/contracts/src/index';
import {PlatformProvider} from '@/lib/platform-client';
import {DartsLobby} from './darts-lobby';
import {DartsPrivacyAccount,DartsSupport} from './darts-support';

type SupportPageProps=Omit<ComponentProps<typeof DartsSupport>,'embedded'>;

/** Gameplay access is optional here. Guests and suspended/closed players keep
 * the existing support scope, including mailbox verification and live ACLs. */
async function SupportPlatform({children,fallback}:{children:React.ReactNode;fallback:React.ReactNode}){
 try{
  const actor=await currentActor(),initial=await bootstrap(actor);
  return <PlatformProvider initial={initial} accessFailure="support"><DartsLobby supportContent={children}/></PlatformProvider>;
 }catch(error){
  if(error instanceof DomainError&&[401,403].includes(error.status))return fallback;
  throw error;
 }
}

export function DartsSupportGate(props:SupportPageProps){
 return <SupportPlatform fallback={<DartsSupport {...props}/>}><DartsSupport {...props} embedded/></SupportPlatform>;
}

export function DartsPrivacyGate({initialKind}:{initialKind?:string}){
 return <SupportPlatform fallback={<DartsPrivacyAccount initialKind={initialKind}/>}><DartsPrivacyAccount initialKind={initialKind} embedded/></SupportPlatform>;
}
