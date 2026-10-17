"use client";
import {localiseStaticCopy} from "../../../packages/i18n/src/static-copy";
import {useI18n} from '@/lib/i18n/provider';

import {LanguagePicker} from "./language-picker";
import { BellOff, Hand, MessageCircle, Smartphone, Sparkles, Users, Volume2 } from "lucide-react";
import {SupportQuickLinks} from "./darts-support-links";
import {DartsLegalAcceptance} from "./darts-legal-acceptance";
import {usePlatform} from "@/lib/platform-client";
import { Switch } from "@/components/ui/switch";
import { useDartsPreferences, updateDartsPreferences, type DartsPreferences } from "@/lib/darts-preferences";
import "./darts-v1-hub.css";
import { DartsPwaInstallButton } from "@/components/darts-pwa";

export function DartsPreferencesPanel() {
 const dpT = useI18n("preferencesPanel").t;

  const preferences = useDartsPreferences();
  const platform=usePlatform(),activeMatch=platform.matches.some(match=>match.players?.some((player:any)=>player.id===platform.actor?.id));
  const toggles = [
    { key: "sound", name: dpT("preferencesPanel.copy_spelgeluid"), detail: dpT("preferencesPanel.copy_inslag_een_180_en_de_winnende_dubbel"), icon: Volume2 },
    { key: "haptics", name: dpT("preferencesPanel.copy_trillingen"), detail: dpT("preferencesPanel.copy_een_korte_trilling_bij_het_vastzetten_en_landen"), icon: Smartphone },
    { key: "leftHanded", name: dpT("preferencesPanel.copy_gooiknop_links"), detail: dpT("preferencesPanel.copy_dezelfde_timing_comfortabel_voor_je_linkerduim"), icon: Hand },
    { key: "quietTurn", name: dpT("preferencesPanel.copy_rust_tijdens_je_beurt"), detail: dpT("preferencesPanel.copy_binnenkomende_chatberichten_komen_na_je_beurt_in_beeld"), icon: BellOff },
    { key: "lessMotion", name: dpT("preferencesPanel.copy_minder_beweging"), detail: dpT("preferencesPanel.copy_rustigere_overgangen_de_timingbalken_blijven_bewegen"), icon: Sparkles },
  ] as const;
  return <div className="v1-preferences"><LanguagePicker/>
    {toggles.map(item => <div className="v1-setting" key={item.key}><label htmlFor={`pref-${item.key}`}><item.icon size={19}/><span><strong>{item.name}</strong><small>{item.detail}</small></span></label><Switch id={`pref-${item.key}`} checked={preferences[item.key]} onCheckedChange={async value => await updateDartsPreferences({ [item.key]: value })}/></div>)}
    <div className="v1-setting v1-setting-select"><label htmlFor="pref-private"><MessageCircle size={19}/><span><strong>{dpT("preferencesPanel.nieuwe_privegesprekken")}</strong><small>{dpT("preferencesPanel.bestaande_gesprekken_blijven_bereikbaar")}</small></span></label><select id="pref-private" value={preferences.privateMessages} onChange={async event => await updateDartsPreferences({ privateMessages: event.target.value as DartsPreferences["privateMessages"] })}><option value="everyone">{dpT("preferencesPanel.iedereen")}</option><option value="friends">{dpT("preferencesPanel.alleen_vrienden")}</option><option value="nobody">{dpT("preferencesPanel.niemand")}</option></select></div>
    <div className="v1-setting v1-setting-select"><label htmlFor="pref-availability"><Users size={19}/><span><strong>{dpT("preferencesPanel.je_beschikbaarheid")}</strong><small>{dpT("preferencesPanel.zo_weten_vrienden_of_je_zin_hebt_in")}</small></span></label><select id="pref-availability" value={preferences.availability} onChange={async event => await updateDartsPreferences({ availability: event.target.value as DartsPreferences["availability"] })}><option value="available">{dpT("preferencesPanel.wil_spelen")}</option><option value="playing">{dpT("preferencesPanel.in_een_wedstrijd")}</option><option value="watching">{dpT("preferencesPanel.alleen_kijken")}</option></select></div>
    <div className="v1-install"><DartsPwaInstallButton className="v1-secondary"/></div>
    <p className="v1-subtle">{dpT("preferencesPanel.je_voorkeuren_worden_bij_je_account_bewaard")}</p>
    <section aria-label={dpT("preferencesPanel.hulp_en_account")}><h3>{dpT("preferencesPanel.hulp_tickets_en_je_account")}</h3><p className="v1-subtle">{dpT("preferencesPanel.je_tickets_en_privacyverzoeken_blijven_bereikbaar_ook_als")}</p><div style={{display:"flex",flexWrap:"wrap",gap:10}}><SupportQuickLinks className="v1-secondary" newTab={activeMatch}/></div></section>
    <DartsLegalAcceptance activeMatch={activeMatch}/>
  </div>;
}

const dpStaticCopyKeys={
  "Spelgeluid": "preferencesPanel.copy_spelgeluid",
  "Inslag, een 180 en de winnende dubbel.": "preferencesPanel.copy_inslag_een_180_en_de_winnende_dubbel",
  "Trillingen": "preferencesPanel.copy_trillingen",
  "Een korte trilling bij het vastzetten en landen van je pijl, als je apparaat dat ondersteunt.": "preferencesPanel.copy_een_korte_trilling_bij_het_vastzetten_en_landen",
  "Gooiknop links": "preferencesPanel.copy_gooiknop_links",
  "Dezelfde timing, comfortabel voor je linkerduim.": "preferencesPanel.copy_dezelfde_timing_comfortabel_voor_je_linkerduim",
  "Rust tijdens je beurt": "preferencesPanel.copy_rust_tijdens_je_beurt",
  "Binnenkomende chatberichten komen na je beurt in beeld.": "preferencesPanel.copy_binnenkomende_chatberichten_komen_na_je_beurt_in_beeld",
  "Minder beweging": "preferencesPanel.copy_minder_beweging",
  "Rustigere overgangen. De timingbalken blijven bewegen.": "preferencesPanel.copy_rustigere_overgangen_de_timingbalken_blijven_bewegen"
};
