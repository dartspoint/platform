import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";
import {Toaster} from "sonner";
import { DartsPwa } from "@/components/darts-pwa";
import { TIMING_INPUT_BOOTSTRAP } from "@/lib/timing-input-bootstrap";
import { searchRobots } from "@/lib/seo";
export const metadata: Metadata = {
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
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#091610" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="nl" className="dark"><head><script id="dp-timing-input-bootstrap" dangerouslySetInnerHTML={{__html:TIMING_INPUT_BOOTSTRAP}}/></head><body><DartsPwa/>{children}<Toaster theme="dark" richColors position="bottom-right"/></body></html>;
}
