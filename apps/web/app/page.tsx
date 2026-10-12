import {DartsMarketing} from '@/components/darts-marketing';
import {PublicDataProvider} from '@/lib/darts-public-data';
import {publicProjection} from '../../../packages/data/src/projections';
export const dynamic='force-dynamic';
const structuredData={'@context':'https://schema.org','@type':'WebSite',name:'DartsPoint',url:'https://dartspoint.nl/',inLanguage:'nl-NL',description:'Online darten met kamers, vrienden, toernooien en divisies.'};
export default async function Home(){const data=await publicProjection();return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData).replace(/</g,'\\u003c')}}/><PublicDataProvider data={data}><DartsMarketing/></PublicDataProvider></>;}
