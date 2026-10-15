import {LegalDocumentPage} from '@/components/legal-document-page';
export const dynamic='force-dynamic';
export const metadata={title:'Handleiding | DartsPoint'};
export default async function Page({searchParams}:{searchParams:Promise<{version?:string}>}){return <LegalDocumentPage documentKey="guide" versionId={(await searchParams).version}/>;}
