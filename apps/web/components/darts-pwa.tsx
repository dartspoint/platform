"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferredInstall: InstallPrompt | null = null;

/** Registration is quiet: gameplay never gets an install pop-up by surprise. */
export function DartsPwa() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    const ready = (event: Event) => { event.preventDefault(); deferredInstall = event as InstallPrompt; window.dispatchEvent(new Event("dartspoint-install-ready")); };
    const installed = () => { deferredInstall = null; window.dispatchEvent(new Event("dartspoint-install-ready")); };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", installed);
    return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", installed); };
  }, []);
  return null;
}

export function DartsPwaInstallButton({ className = "dp-secondary" }: { className?: string }) {
  const [available, setAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState("");
  useEffect(() => {
    const update = () => { setAvailable(Boolean(deferredInstall)); setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true); };
    update(); window.addEventListener("dartspoint-install-ready", update);
    return () => window.removeEventListener("dartspoint-install-ready", update);
  }, []);
  async function install() {
    if (deferredInstall) {
      const prompt = deferredInstall;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      deferredInstall = null; setAvailable(false);
      setHelp(choice.outcome === "accepted" ? "DartsPoint wordt op je beginscherm gezet." : "Je kunt DartsPoint later alsnog installeren.");
    } else setHelp(/iPhone|iPad|iPod/.test(navigator.userAgent) ? "Open DartsPoint in Safari. Tik op Delen en kies ‘Zet op beginscherm’." : "Open het browsermenu en kies ‘App installeren’ of ‘Toevoegen aan startscherm’. Voor je wedstrijd en opgeslagen oefenvoortgang is een internetverbinding nodig.");
  }
  return <div><button type="button" className={className} onClick={() => void install()} disabled={installed}>{available ? <Download size={17} /> : <Smartphone size={17} />}{installed ? "DartsPoint is geïnstalleerd" : "Installeer DartsPoint"}</button>{help && <p role="status" style={{ fontSize: 12, color: "var(--muted, #91aa9c)", maxWidth: 380, marginTop: 10, lineHeight: 1.6 }}>{help}</p>}</div>;
}
