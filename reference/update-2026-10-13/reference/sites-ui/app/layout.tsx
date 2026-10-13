import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";
import { DartsPwa } from "@/components/darts-pwa";
export const metadata: Metadata = {
  metadataBase: new URL("https://dartspoint-afterhours-studio.dgwebserv.chatgpt.site"),
  title: { default: "DartsPoint — Online darten. Jouw kamer, jouw avond.", template: "%s · DartsPoint" },
  description: "Ontdek DartsPoint: online darten met het vertrouwde kamergevoel. Bekijk toernooien, Elo-rankings en divisies en probeer het speelbare prototype.",
  applicationName: "DartsPoint",
  category: "games",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  openGraph: {
    type: "website",
    locale: "nl_NL",
    url: "/",
    siteName: "DartsPoint",
    title: "DartsPoint — Jouw kamer. Jouw wedstrijd. Jouw avond.",
    description: "Het oude gevoel, een nieuwe avond. Ontdek online darten, kamers, toernooien en divisies in het speelbare DartsPoint-prototype.",
    images: [{ url: "/marketing/dartspoint-share.png", width: 1200, height: 630, alt: "DartsPoint — Online darten. Jouw kamer, jouw avond." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DartsPoint — Online darten. Jouw kamer, jouw avond.",
    description: "Online darten met het vertrouwde kamergevoel. Ontdek het speelbare prototype.",
    images: ["/marketing/dartspoint-share.png"],
  },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "DartsPoint" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#091610" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="nl" className="dark"><body><DartsPwa/>{children}</body></html>;
}
