import {LegalDocumentPage} from '@/components/legal-document-page';
import {getLegalPublicBundle} from '../../../../packages/data/src/legal';
import {publicPageMetadata} from '@/lib/seo';
export const dynamic='force-dynamic';
export async function generateMetadata({searchParams}:{searchParams:Promise<{version?:string}>}){const bundle=await getLegalPublicBundle();return publicPageMetadata({path:'/algemene-voorwaarden',title:'Algemene voorwaarden',description:'Lees de algemene voorwaarden voor je account, online wedstrijden en het gebruik van DartsPoint.',available:!(await searchParams).version&&!!bundle.current.terms});}
export default async function Page({searchParams}:{searchParams:Promise<{version?:string}>}){return <LegalDocumentPage documentKey="terms" versionId={(await searchParams).version}/>;}
