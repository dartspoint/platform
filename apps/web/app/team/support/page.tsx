import type {Metadata} from 'next';
import {DartsSupport} from '@/components/darts-support';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Team Support',alternates:{canonical:null},robots:{index:false,follow:false,noarchive:true}};
export default async function TeamSupportPage({searchParams}:{searchParams:Promise<{ticket?:string;view?:string}>}){const params=await searchParams;return <DartsSupport mode="team" initialTicket={params.ticket} initialView={params.view==='team'?'team':params.view==='topics'?'topics':params.view==='templates'?'templates':'tickets'}/>;}
