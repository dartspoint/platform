import type {Metadata} from 'next';
import {DartsSupport} from '@/components/darts-support';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Mijn tickets',alternates:{canonical:null},robots:{index:false,follow:false,noarchive:true}};
export default async function MyTicketsPage({searchParams}:{searchParams:Promise<{ticket?:string}>}){const params=await searchParams;return <DartsSupport mode="mine" initialTicket={params.ticket}/>;}
