"use client";
import { BellOff, Hand, MessageCircle, Smartphone, Sparkles, Users, Volume2 } from "lucide-react";
import {SupportQuickLinks} from "./darts-support-links";
import {DartsLegalAcceptance} from "./darts-legal-acceptance";
import {usePlatform} from "@/lib/platform-client";
import { Switch } from "@/components/ui/switch";
import { useDartsPreferences, updateDartsPreferences, type DartsPreferences } from "@/lib/darts-preferences";
import "./darts-v1-hub.css";
import { DartsPwaInstallButton } from "@/components/darts-pwa";

export function DartsPreferencesPanel() {
  const preferences = useDartsPreferences();
  const platform=usePlatform(),activeMatch=platform.matches.some(match=>match.players?.some((player:any)=>player.id===platform.actor?.id));
  const toggles = [
    { key: "sound", name: "Spelgeluid", detail: "Inslag, een 180 en de winnende dubbel.", icon: Volume2 },
    { key: "haptics", name: "Trillingen", detail: "Een korte trilling bij het vastzetten en landen van je pijl, als je apparaat dat ondersteunt.", icon: Smartphone },
    { key: "leftHanded", name: "Gooiknop links", detail: "Dezelfde timing, comfortabel voor je linkerduim.", icon: Hand },
    { key: "quietTurn", name: "Rust tijdens je beurt", detail: "Binnenkomende chatberichten komen na je beurt in beeld.", icon: BellOff },
    { key: "lessMotion", name: "Minder beweging", detail: "Rustigere overgangen. De timingbalken blijven bewegen.", icon: Sparkles },
  ] as const;
  return <div className="v1-preferences">
    {toggles.map(item => <div className="v1-setting" key={item.key}><label htmlFor={`pref-${item.key}`}><item.icon size={19}/><span><strong>{item.name}</strong><small>{item.detail}</small></span></label><Switch id={`pref-${item.key}`} checked={preferences[item.key]} onCheckedChange={async value => await updateDartsPreferences({ [item.key]: value })}/></div>)}
    <div className="v1-setting v1-setting-select"><label htmlFor="pref-private"><MessageCircle size={19}/><span><strong>Nieuwe privégesprekken</strong><small>Bestaande gesprekken blijven bereikbaar.</small></span></label><select id="pref-private" value={preferences.privateMessages} onChange={async event => await updateDartsPreferences({ privateMessages: event.target.value as DartsPreferences["privateMessages"] })}><option value="everyone">Iedereen</option><option value="friends">Alleen vrienden</option><option value="nobody">Niemand</option></select></div>
    <div className="v1-setting v1-setting-select"><label htmlFor="pref-availability"><Users size={19}/><span><strong>Je beschikbaarheid</strong><small>Zo weten vrienden of je zin hebt in een potje.</small></span></label><select id="pref-availability" value={preferences.availability} onChange={async event => await updateDartsPreferences({ availability: event.target.value as DartsPreferences["availability"] })}><option value="available">Wil spelen</option><option value="playing">In een wedstrijd</option><option value="watching">Alleen kijken</option></select></div>
    <div className="v1-install"><DartsPwaInstallButton className="v1-secondary"/></div>
    <p className="v1-subtle">Je voorkeuren worden bij je account bewaard.</p>
    <section aria-label="Hulp en account"><h3>Hulp, tickets en je account</h3><p className="v1-subtle">Je tickets en privacyverzoeken blijven bereikbaar, ook als je niet kunt spelen.</p><div style={{display:"flex",flexWrap:"wrap",gap:10}}><SupportQuickLinks className="v1-secondary" newTab={activeMatch}/></div></section>
    <DartsLegalAcceptance activeMatch={activeMatch}/>
  </div>;
}
