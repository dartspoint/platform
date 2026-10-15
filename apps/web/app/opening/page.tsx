import {redirect} from 'next/navigation';
import {DartsOpening} from '@/components/darts-opening';
import {openingStatus} from '@/lib/opening';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Vanavond om 20:00 gaan de dartbanen open',
  description: 'DartsPoint opent op 15 oktober 2026 om 20:00 uur Nederlandse tijd. Zet je pijlen maar vast klaar.',
  robots: {index: false, follow: false},
  alternates: {canonical: '/'},
};

export default function OpeningPage() {
  const status = openingStatus();
  if (status.open) redirect('/');
  return <DartsOpening serverNow={status.serverNow} opensAt={status.opensAt}/>;
}
