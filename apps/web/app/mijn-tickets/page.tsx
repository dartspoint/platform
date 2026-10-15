import type {Metadata} from 'next';
import {DartsSupportGate} from '@/components/darts-support-gate';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Mijn tickets',alternates:{canonical:null},robots:{index:false,follow:false,noarchive:true}};
export default async function MyTicketsPage({searchParams}:{searchParams:Promise<{ticket?:string}>}){const params=await searchParams;return <DartsSupportGate mode="mine" initialTicket={params.ticket}/>;}
