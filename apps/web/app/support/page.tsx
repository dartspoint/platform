import type {Metadata} from 'next';
import {DartsSupportGate} from '@/components/darts-support-gate';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Hulp en support',alternates:{canonical:null},robots:{index:false,follow:false,noarchive:true}};
export default async function SupportPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams;const value=(key:string)=>typeof params[key]==='string'?params[key] as string:'';return <DartsSupportGate mode="public" initialTicket={value('ticket')} verify={value('verify')||value('token')} initialTopic={value('topic')} initialRequest={value('request')}/>;}
