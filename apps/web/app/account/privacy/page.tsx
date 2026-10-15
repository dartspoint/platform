import type {Metadata} from 'next';
import {DartsPrivacyAccount} from '@/components/darts-support';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Account en privacy',alternates:{canonical:null},robots:{index:false,follow:false,noarchive:true}};
export default async function AccountPrivacyPage({searchParams}:{searchParams:Promise<{request?:string}>}){const params=await searchParams;return <DartsPrivacyAccount initialKind={params.request}/>;}
