import { DartsLogin } from "@/components/darts-login";
export const metadata = { title: "Inloggen met een e-mailcode", description: "Log in bij DartsPoint met je e-mailadres en een eenmalige code. Kies bij je eerste bezoek je spelersnaam.", robots: { index: false, follow: false, googleBot: { index: false, follow: false } }, alternates: { canonical: null } };
export default function LoginPage() { return <DartsLogin />; }
