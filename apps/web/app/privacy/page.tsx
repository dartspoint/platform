import {getRequestLocale} from '@/lib/i18n/server';
import {LegalDocumentPage} from '@/components/legal-document-page';
import {getLegalPublicBundle} from '../../../../packages/data/src/legal';
import {publicPageMetadata} from '@/lib/seo';
export const dynamic='force-dynamic';
export async function generateMetadata({searchParams}:{searchParams:Promise<{version?:string}>}){const locale=await getRequestLocale(),bundle=await getLegalPublicBundle(locale),english=locale==='en'?bundle:await getLegalPublicBundle('en');return publicPageMetadata({path:'/privacy',locale,translatedAvailable:!!english.current.privacy,title:locale==='en'?'Privacy notice':'Privacyverklaring',description:locale==='en'?'Read how DartsPoint handles your personal data and how to ask a privacy question or submit a request.':'Lees hoe DartsPoint met je persoonsgegevens omgaat en hoe je een privacyvraag of verzoek kunt indienen.',available:!(await searchParams).version&&!!bundle.current.privacy});}
export default async function Page({searchParams}:{searchParams:Promise<{version?:string}>}){return <LegalDocumentPage documentKey="privacy" versionId={(await searchParams).version}/>;}
