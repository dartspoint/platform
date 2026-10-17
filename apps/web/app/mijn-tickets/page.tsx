import {getRequestLocale} from '@/lib/i18n/server';
import type {Metadata} from 'next';
import {DartsSupportGate} from '@/components/darts-support-gate';
export const dynamic='force-dynamic';
export async function generateMetadata(){const locale=await getRequestLocale();return {title:locale==='en'?"My tickets":'Mijn tickets',alternates:{canonical:null},robots:{index:false,follow:false,noarchive:true}};}
export default async function MyTicketsPage({searchParams}:{searchParams:Promise<{ticket?:string}>}){const params=await searchParams;return <DartsSupportGate mode="mine" initialTicket={params.ticket}/>;}
