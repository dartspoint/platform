import {getRequestLocale} from '@/lib/i18n/server';
import {LegalDocumentPage} from '@/components/legal-document-page';
import {getLegalPublicBundle} from '../../../../packages/data/src/legal';
import {publicPageMetadata} from '@/lib/seo';
export const dynamic='force-dynamic';
export async function generateMetadata({searchParams}:{searchParams:Promise<{version?:string}>}){const locale=await getRequestLocale(),bundle=await getLegalPublicBundle(locale),english=locale==='en'?bundle:await getLegalPublicBundle('en');return publicPageMetadata({path:'/handleiding',locale,translatedAvailable:!!english.current.guide,title:locale==='en'?'Online darts player guide':'Handleiding voor online darten',description:locale==='en'?'Learn how to aim and throw, play a match and meet other players on DartsPoint.':'Ontdek hoe je bij DartsPoint richt en gooit, een wedstrijd speelt en andere spelers ontmoet.',available:!(await searchParams).version&&!!bundle.current.guide});}
export default async function Page({searchParams}:{searchParams:Promise<{version?:string}>}){return <LegalDocumentPage documentKey="guide" versionId={(await searchParams).version}/>;}
