import {DartsMarketing} from '@/components/darts-marketing';
import {DartsOpening} from '@/components/darts-opening';
import {PublicDataProvider} from '@/lib/darts-public-data';
import {openingStatus} from '@/lib/opening';
import {publicProjection} from '../../../packages/data/src/projections';
export const dynamic='force-dynamic';
const structuredData={'@context':'https://schema.org','@type':'WebSite',name:'DartsPoint',url:'https://dartspoint.nl/',inLanguage:'nl-NL',description:'Online darten met kamers, vrienden, toernooien en divisies.'};
export function generateMetadata() {
  if (process.env.APP_ENV === 'production' && !openingStatus().open) {
    return {
      title: 'Vanavond om 20:00 gaan de dartbanen open',
      description: 'DartsPoint opent op 15 oktober 2026 om 20:00 uur Nederlandse tijd. Zet je pijlen maar vast klaar.',
    };
  }
  return {};
}

export default async function Home() {
  const status = openingStatus();
  if (process.env.APP_ENV === 'production' && !status.open) {
    return <DartsOpening serverNow={status.serverNow} opensAt={status.opensAt}/>;
  }
  const data=await publicProjection();
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData).replace(/</g,'\\u003c')}}/><PublicDataProvider data={data}><DartsMarketing/></PublicDataProvider></>;
}
