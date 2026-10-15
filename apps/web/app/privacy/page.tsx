import {LegalDocumentPage} from '@/components/legal-document-page';
export const dynamic='force-dynamic';
export const metadata={title:'Privacyverklaring | DartsPoint'};
export default async function Page({searchParams}:{searchParams:Promise<{version?:string}>}){return <LegalDocumentPage documentKey="privacy" versionId={(await searchParams).version}/>;}
