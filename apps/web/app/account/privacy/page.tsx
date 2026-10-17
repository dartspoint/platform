import {getRequestLocale} from '@/lib/i18n/server';
import type {Metadata} from 'next';
import {DartsPrivacyGate} from '@/components/darts-support-gate';
export const dynamic='force-dynamic';
export async function generateMetadata(){const locale=await getRequestLocale();return {title:locale==='en'?"Account and privacy":'Account en privacy',alternates:{canonical:null},robots:{index:false,follow:false,noarchive:true}};}
export default async function AccountPrivacyPage({searchParams}:{searchParams:Promise<{request?:string}>}){const params=await searchParams;return <DartsPrivacyGate initialKind={params.request}/>;}
