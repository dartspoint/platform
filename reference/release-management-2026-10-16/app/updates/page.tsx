import { ReleaseUpdatesPage } from "@/components/darts-release-updates";

export const metadata = {
  title: "Nieuw in DartsPoint",
  description: "Bekijk de nieuwste toevoegingen aan DartsPoint en deel je idee voor een volgende verbetering. Interactief prototype.",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function UpdatesPage() { return <ReleaseUpdatesPage/>; }
