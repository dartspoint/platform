import {getRequestLocale} from '@/lib/i18n/server';
import type { Metadata } from "next";
import { DartsRegistration } from "@/components/darts-registration";

export async function generateMetadata(){const locale=await getRequestLocale();return {
  title: locale==='en'?"Your first visit — email code and player name":"Jouw eerste keer — e-mailcode en spelersnaam",
  description: locale==='en'?"Join DartsPoint with your email address, a one-time code and your own player name.":"Ontdek de DartsPoint aanmeldflow: e-mailadres, eenmalige code en je eigen spelersnaam.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  alternates: { canonical: null },
};}

export default function RegistrationPage() { return <DartsRegistration/>; }
