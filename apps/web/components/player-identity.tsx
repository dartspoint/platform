"use client";
import {localiseStaticCopy} from "../../../packages/i18n/src/static-copy";
import {useI18n} from '@/lib/i18n/provider';


import { DivisionBadge } from "@/components/division-badge";
import { Crown, Info } from "lucide-react";
import { playerByName, type DartsPlayer, type PlayerRole } from "@/lib/darts-data";
import { ratingStatus } from "@/lib/darts-elo";
import { useRatingProfile } from "@/lib/darts-ratings";
import {usePlatform} from "@/lib/platform-client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import "./player-identity.css";

const roleLabels: Record<PlayerRole, string> = {
  owner: "Eigenaar",
  admin: "Platformbeheerder",
  vip: "VIP",
  player: "Speler",
};
const roleLabelsStaticSource = roleLabels;

/** Nickname styling communicates a role, independently of the player's rating. */
export function PlayerName({ name, className = "" }: { name: string; className?: string }) {
 const dpT = useI18n("playerIdentity").t;

 const roleLabels=localiseStaticCopy(roleLabelsStaticSource,dpT,dpStaticCopyKeys);



  usePlatform();
  const role = playerByName(name).role;
  return <span className={`dp-player-name dp-role-${role} ${className}`} title={dpT("playerIdentity.label",{name:name,value1:roleLabels[role]})} aria-label={dpT("playerIdentity.accessibleNameAndRole",{name:name,value1:roleLabels[role]})}>
    {role === "vip" && <Crown className="dp-vip-crown" size={13} strokeWidth={1.8} aria-hidden="true" />}
    <span className="dp-player-name-text">{name}</span><DivisionBadge name={name} compact/>
  </span>;
}

/** Only Elo ratings use the green/yellow/red performance palette. */
export function RatingValue({ player, className = "", brackets = false, interactive = true }: { player: DartsPlayer; className?: string; brackets?: boolean; interactive?: boolean }) {
 const {formatLocale:dpFormatLocale}=useI18n();

 const dpT = useI18n("playerIdentity").t;

  const profile = useRatingProfile(player.name);
  const status = ratingStatus(profile);
  const displayed = Math.round(profile.rating);
  const formatted=new Intl.NumberFormat(dpFormatLocale).format(displayed)+" DP";
  const description = { white: "Voorlopige DartsPoints", red: "Onder de middenzone", amber: "Rond het startniveau", green: "Boven de middenzone" }[status];
  const distinct = new Set(profile.opponents).size;
  if (!interactive) return <span className={`dp-rating-value rating-${status} ${className}`} title={description} aria-label={dpT("playerIdentity.rating",{name:player.name,displayed:displayed,value2:description.toLowerCase()})}>{brackets ? dpT("playerIdentity.formattedRating",{formatted:formatted}) : formatted}</span>;
  return <Popover><PopoverTrigger asChild><span role="button" tabIndex={0} className={`dp-rating-value rating-${status} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93d6b1] ${className}`} style={{ cursor: "help", borderRadius: 3 }} title={dpT("playerIdentity.tik_voor_uitleg",{description:description})} aria-label={dpT("playerIdentity.rating_toon_uitleg_over_dartspoints",{name:player.name,displayed:displayed,value2:description.toLowerCase()})} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); event.currentTarget.click(); } }}>{brackets ? dpT("playerIdentity.formattedRating",{formatted:formatted}) : formatted}</span></PopoverTrigger><PopoverContent sideOffset={9} className="border-[#385344] bg-[#11271b] text-[#eef4ee] shadow-2xl" style={{ zIndex: 110, width: "min(310px, calc(100vw - 28px))" }} onClick={(event) => event.stopPropagation()}>
    <div className="mb-3 flex items-center justify-between gap-3"><strong>{player.name} · <span className={`rating-${status}`}>[{formatted}]</span></strong><Info size={15} className="text-[#91ad9d]"/></div>
    <p className="mb-2 text-sm font-semibold">{description}</p>
    {profile.provisional ? <p className="mb-3 text-xs leading-relaxed text-[#b0c4b8]">{dpT("playerIdentity.plaatsing")} {Math.min(profile.rankedPlayed, 10)}/10 ranked wedstrijden · {Math.min(distinct, 5)}/5 verschillende tegenstanders. Je getal verandert al; de kleur blijft wit tot beide doelen zijn behaald.</p> : <p className="mb-3 text-xs leading-relaxed text-[#b0c4b8]">{dpT("playerIdentity.geplaatst")} {profile.rankedPlayed} {dpT("playerIdentity.ranked_wedstrijden_je_rating_verandert_na_een_volledige")}</p>}
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-y border-[#385344] py-3 text-xs"><dt className="rating-white">{dpT("playerIdentity.wit")}</dt><dd>{dpT("playerIdentity.plaatsingsfase")}</dd><dt className="rating-red">{dpT("playerIdentity.rood")}</dt><dd>{dpT("playerIdentity.lager_dan_1450")}</dd><dt className="rating-amber">{dpT("playerIdentity.geel")}</dt><dd>1450–1549</dd><dt className="rating-green">{dpT("playerIdentity.groen")}</dt><dd>{dpT("playerIdentity.vanaf_1550")}</dd></dl>
    <p className="mt-3 text-[11px] leading-relaxed text-[#91ad9d]">{dpT("playerIdentity.dp_dartspoints_rankingpunten_start_1500_k_32_rolkleuren")}</p>
  </PopoverContent></Popover>;
}

const dpStaticCopyKeys={
  "Eigenaar": "playerIdentity.copy_eigenaar",
  "Platformbeheerder": "playerIdentity.copy_platformbeheerder",
  "Speler": "playerIdentity.copy_speler"
};
