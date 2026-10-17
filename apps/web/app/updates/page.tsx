import {getRequestLocale} from '@/lib/i18n/server';
import { ReleaseUpdatesPage } from "@/components/darts-release-updates";
import { DemoGate } from "@/components/darts-demo-gate";

export async function generateMetadata(){const locale=await getRequestLocale();return {
  title: locale==='en'?"New in DartsPoint":"Nieuw in DartsPoint",
  description: locale==='en'?"Explore the latest additions to DartsPoint and share your idea for the next improvement.":"Bekijk de nieuwste toevoegingen aan DartsPoint en deel je idee voor een volgende verbetering.",
  robots: { index: false, follow: false, noarchive: true, googleBot: { index: false, follow: false } },
  alternates: { canonical: null },
};}

export default function UpdatesPage() { return <DemoGate><ReleaseUpdatesPage/></DemoGate>; }
