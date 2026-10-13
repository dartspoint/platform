import { DartsMarketing } from "@/components/darts-marketing";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": "https://dartspoint-afterhours-studio.dgwebserv.chatgpt.site/#website", name: "DartsPoint", url: "https://dartspoint-afterhours-studio.dgwebserv.chatgpt.site/", inLanguage: "nl-NL", description: "Ontdek het speelbare DartsPoint-prototype: digitaal darten met kamers, vrienden, Elo-ladders en divisies." },
    { "@type": "VideoGame", name: "DartsPoint", url: "https://dartspoint-afterhours-studio.dgwebserv.chatgpt.site/", genre: "Darts", gamePlatform: "Web browser", inLanguage: "nl-NL", description: "Speelbaar prototype van een online dartspel met 301, 501 en 701. Accounts, spelers, chats en competities zijn demonstraties; echte realtime multiplayer is nog in ontwikkeling." },
  ],
};

export default function Home() {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}/><DartsMarketing/></>;
}
