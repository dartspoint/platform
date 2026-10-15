import {LegalDocumentPage} from '@/components/legal-document-page';
export const dynamic='force-dynamic';
export const metadata={title:'Algemene voorwaarden | DartsPoint'};
export default async function Page({searchParams}:{searchParams:Promise<{version?:string}>}){return <LegalDocumentPage documentKey="terms" versionId={(await searchParams).version}/>;}
