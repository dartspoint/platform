import type { Metadata } from "next";
import { DartsRegistration } from "@/components/darts-registration";

export const metadata: Metadata = {
  title: "Jouw eerste keer — e-mailcode en spelersnaam",
  description: "Ontdek de DartsPoint aanmeldflow: e-mailadres, eenmalige code en je eigen spelersnaam. Interactief prototype zonder echte e-mailverzending.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  alternates: { canonical: null },
};

export default function RegistrationPage() { return <DartsRegistration/>; }
