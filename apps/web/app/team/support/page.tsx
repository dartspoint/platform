import type {Metadata} from 'next';
import {DartsSupportGate} from '@/components/darts-support-gate';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Team Support',alternates:{canonical:null},robots:{index:false,follow:false,noarchive:true}};
export default async function TeamSupportPage({searchParams}:{searchParams:Promise<{ticket?:string;view?:string}>}){const params=await searchParams;return <DartsSupportGate mode="team" initialTicket={params.ticket} initialView={params.view==='team'?'team':params.view==='topics'?'topics':params.view==='templates'?'templates':'tickets'}/>;}
