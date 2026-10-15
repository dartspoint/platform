import {LegalDocumentPage} from '@/components/legal-document-page';
import {getLegalPublicBundle} from '../../../../packages/data/src/legal';
import {publicPageMetadata} from '@/lib/seo';
export const dynamic='force-dynamic';
export async function generateMetadata({searchParams}:{searchParams:Promise<{version?:string}>}){const bundle=await getLegalPublicBundle();return publicPageMetadata({path:'/handleiding',title:'Handleiding voor online darten',description:'Ontdek hoe je bij DartsPoint richt en gooit, een wedstrijd speelt en andere spelers ontmoet.',available:!(await searchParams).version&&!!bundle.current.guide});}
export default async function Page({searchParams}:{searchParams:Promise<{version?:string}>}){return <LegalDocumentPage documentKey="guide" versionId={(await searchParams).version}/>;}
