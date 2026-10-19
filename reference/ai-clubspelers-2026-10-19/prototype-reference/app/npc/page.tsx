import { DartsPrototypeEntry } from '@/components/darts-prototype-entry';
import { DartsNpcStudio } from '@/components/darts-npc-studio';
export const metadata = { title: 'Clubgezelschap & regisseur | DartsPoint', description: 'Interactieve DartsPoint-demonstratie met 25 clubkarakters, open kamers, gesprekken en wedstrijden.', robots: { index: false, follow: false } };
export default function NpcPage() { return <DartsPrototypeEntry><DartsNpcStudio/></DartsPrototypeEntry>; }
