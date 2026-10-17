import {getRequestLocale} from '@/lib/i18n/server';
import {DartsMarketing} from '@/components/darts-marketing';
import {DartsOpening} from '@/components/darts-opening';
import {PublicDataProvider} from '@/lib/darts-public-data';
import {openingStatus} from '@/lib/opening';
import {publicProjection} from '../../../packages/data/src/projections';
import {EN_MARKETING_DESCRIPTION,EN_MARKETING_TITLE,MARKETING_DESCRIPTION, MARKETING_TITLE, marketingStructuredData, publicPageMetadata} from '@/lib/seo';
export const dynamic='force-dynamic';
export async function generateMetadata() {
 const locale=await getRequestLocale();
  if (process.env.APP_ENV === 'production' && !openingStatus().open) {
    return publicPageMetadata({
      path: '/',
      title: 'Vanavond om 20:00 gaan de dartbanen open',
      description: 'DartsPoint opent op 15 oktober 2026 om 20:00 uur Nederlandse tijd. Zet je pijlen maar vast klaar.',
    });
  }
  return publicPageMetadata({path:'/',locale,title:locale==='en'?EN_MARKETING_TITLE:MARKETING_TITLE,description:locale==='en'?EN_MARKETING_DESCRIPTION:MARKETING_DESCRIPTION});
}

export default async function Home() {
  const status = openingStatus();
  if (process.env.APP_ENV === 'production' && !status.open) {
    return <DartsOpening serverNow={status.serverNow} opensAt={status.opensAt}/>;
  }
  const data=await publicProjection();
  const structuredData=marketingStructuredData(await getRequestLocale());
  return <>{structuredData&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData).replace(/</g,'\\u003c')}}/>}<PublicDataProvider data={data}><DartsMarketing/></PublicDataProvider></>;
}
