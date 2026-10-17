import {getRequestLocale,loadRouteCatalogs} from '@/lib/i18n/server';
import {headers, cookies} from 'next/headers';
import {LocaleProvider} from '@/lib/i18n/provider';
import {domainLocale, isLocale, publicPaths, stripLocale} from '../../../packages/i18n/src/locale';
import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";
import "@/components/i18n.css";
import {Toaster} from "sonner";
import { DartsPwa } from "@/components/darts-pwa";
import { TIMING_INPUT_BOOTSTRAP } from "@/lib/timing-input-bootstrap";
import { searchRobots } from "@/lib/seo";
const baseMetadata: Metadata = {
  title: { default: "DartsPoint — Online darten. Jouw kamer, jouw avond.", template: "%s · DartsPoint" },
  description: "Ontdek DartsPoint: online darten met het vertrouwde kamergevoel. Bekijk toernooien, Elo-rankings en divisies en speel mee.",
  applicationName: "DartsPoint",
  category: "games",
  alternates: { canonical: null },
  robots: searchRobots(),
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "DartsPoint" },
};
export async function generateMetadata():Promise<Metadata>{
 const locale=await getRequestLocale(),en=locale==='en';
 return {...baseMetadata,title:{default:en?'DartsPoint — Online darts. Your room, your evening.':'DartsPoint — Online darten. Jouw kamer, jouw avond.',template:'%s · DartsPoint'},description:en?'Online darts with a familiar room atmosphere. Explore tournaments, DP rankings and divisions, and join in.':baseMetadata.description,manifest:'/api/manifest?locale='+locale};
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#091610" };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers(), store = await cookies();
  const path = h.get('x-dp-path') ?? '/', publicPage = publicPaths.includes(stripLocale(path));
  const initialLocale=await getRequestLocale();
  return <html lang={initialLocale} className="dark"><head><script id="dp-timing-input-bootstrap" dangerouslySetInnerHTML={{__html:TIMING_INPUT_BOOTSTRAP}}/></head><body><LocaleProvider initialLocale={initialLocale} publicPage={publicPage} catalogs={await loadRouteCatalogs(path)}><DartsPwa/>{children}<Toaster theme="dark" richColors position="bottom-right"/></LocaleProvider></body></html>;
}
