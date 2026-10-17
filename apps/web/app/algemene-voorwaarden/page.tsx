import {getRequestLocale} from '@/lib/i18n/server';
import {LegalDocumentPage} from '@/components/legal-document-page';
import {getLegalPublicBundle} from '../../../../packages/data/src/legal';
import {publicPageMetadata} from '@/lib/seo';
export const dynamic='force-dynamic';
export async function generateMetadata({searchParams}:{searchParams:Promise<{version?:string}>}){const locale=await getRequestLocale(),bundle=await getLegalPublicBundle(locale),english=locale==='en'?bundle:await getLegalPublicBundle('en');return publicPageMetadata({path:'/algemene-voorwaarden',locale,translatedAvailable:!!english.current.terms,title:locale==='en'?'Terms and conditions':'Algemene voorwaarden',description:locale==='en'?'Read the terms for your account, online matches and using DartsPoint.':'Lees de algemene voorwaarden voor je account, online wedstrijden en het gebruik van DartsPoint.',available:!(await searchParams).version&&!!bundle.current.terms});}
export default async function Page({searchParams}:{searchParams:Promise<{version?:string}>}){return <LegalDocumentPage documentKey="terms" versionId={(await searchParams).version}/>;}
