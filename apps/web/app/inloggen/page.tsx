import {getRequestLocale} from '@/lib/i18n/server';
import { DartsLogin } from "@/components/darts-login";
export async function generateMetadata(){const locale=await getRequestLocale();return { title: locale==='en'?"Sign in with an email code":"Inloggen met een e-mailcode", description: locale==='en'?"Sign in to DartsPoint using your email address and a one-time code. Choose your player name on your first visit.":"Log in bij DartsPoint met je e-mailadres en een eenmalige code. Kies bij je eerste bezoek je spelersnaam.", robots: { index: false, follow: false, googleBot: { index: false, follow: false } }, alternates: { canonical: null } };}
export default function LoginPage() { return <DartsLogin />; }
