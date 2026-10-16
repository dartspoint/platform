import { ReleaseUpdatesPage } from "@/components/darts-release-updates";
import { DemoGate } from "@/components/darts-demo-gate";

export const metadata = {
  title: "Nieuw in DartsPoint",
  description: "Bekijk de nieuwste toevoegingen aan DartsPoint en deel je idee voor een volgende verbetering.",
  robots: { index: false, follow: false, noarchive: true, googleBot: { index: false, follow: false } },
  alternates: { canonical: null },
};

export default function UpdatesPage() { return <DemoGate><ReleaseUpdatesPage/></DemoGate>; }
