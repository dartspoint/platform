import {LegalDocumentPage} from '@/components/legal-document-page';
import {getLegalPublicBundle} from '../../../../packages/data/src/legal';
import {publicPageMetadata} from '@/lib/seo';
export const dynamic='force-dynamic';
export async function generateMetadata({searchParams}:{searchParams:Promise<{version?:string}>}){const bundle=await getLegalPublicBundle();return publicPageMetadata({path:'/privacy',title:'Privacyverklaring',description:'Lees hoe DartsPoint met je persoonsgegevens omgaat en hoe je een privacyvraag of verzoek kunt indienen.',available:!(await searchParams).version&&!!bundle.current.privacy});}
export default async function Page({searchParams}:{searchParams:Promise<{version?:string}>}){return <LegalDocumentPage documentKey="privacy" versionId={(await searchParams).version}/>;}
