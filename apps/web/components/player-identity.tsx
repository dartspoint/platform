"use client";

import { DivisionBadge } from "@/components/division-badge";
import { Crown, Info } from "lucide-react";
import { playerByName, type DartsPlayer, type PlayerRole } from "@/lib/darts-data";
import { ratingStatus } from "@/lib/darts-elo";
import { useRatingProfile } from "@/lib/darts-ratings";
import { useAdminOperations } from "@/lib/darts-admin-operations";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import "./player-identity.css";

const roleLabels: Record<PlayerRole, string> = {
  owner: "Eigenaar",
  admin: "Admin",
  vip: "VIP",
  player: "Speler",
};

/** Nickname styling communicates a role, independently of the player's rating. */
export function PlayerName({ name, className = "" }: { name: string; className?: string }) {
  const operations = useAdminOperations();
  const role = operations.members.find(member => member.name === name)?.role ?? playerByName(name).role;
  return <span className={`dp-player-name dp-role-${role} ${className}`} title={`${name} · ${roleLabels[role]}`} aria-label={`${name}, ${roleLabels[role]}`}>
    {role === "vip" && <Crown className="dp-vip-crown" size={13} strokeWidth={1.8} aria-hidden="true" />}
    <span className="dp-player-name-text">{name}</span><DivisionBadge name={name} compact/>
  </span>;
}

/** Only Elo ratings use the green/yellow/red performance palette. */
export function RatingValue({ player, className = "", brackets = false, interactive = true }: { player: DartsPlayer; className?: string; brackets?: boolean; interactive?: boolean }) {
  const profile = useRatingProfile(player.name);
  const status = ratingStatus(profile);
  const displayed = Math.round(profile.rating);
  const description = { white: "Voorlopige rating", red: "Onder de middenzone", amber: "Rond het startniveau", green: "Boven de middenzone" }[status];
  const distinct = new Set(profile.opponents).size;
  if (!interactive) return <span className={`dp-rating-value rating-${status} ${className}`} title={description} aria-label={`${player.name}, rating ${displayed}, ${description.toLowerCase()}`}>{brackets ? `[${displayed}]` : displayed}</span>;
  return <Popover><PopoverTrigger asChild><span role="button" tabIndex={0} className={`dp-rating-value rating-${status} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93d6b1] ${className}`} style={{ cursor: "help", borderRadius: 3 }} title={`${description} · tik voor uitleg`} aria-label={`${player.name}, rating ${displayed}, ${description.toLowerCase()}. Toon ratinguitleg`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); event.currentTarget.click(); } }}>{brackets ? `[${displayed}]` : displayed}</span></PopoverTrigger><PopoverContent sideOffset={9} className="border-[#385344] bg-[#11271b] text-[#eef4ee] shadow-2xl" style={{ zIndex: 110, width: "min(310px, calc(100vw - 28px))" }} onClick={(event) => event.stopPropagation()}>
    <div className="mb-3 flex items-center justify-between gap-3"><strong>{player.name} · <span className={`rating-${status}`}>[{displayed}]</span></strong><Info size={15} className="text-[#91ad9d]"/></div>
    <p className="mb-2 text-sm font-semibold">{description}</p>
    {profile.provisional ? <p className="mb-3 text-xs leading-relaxed text-[#b0c4b8]">Plaatsing: {Math.min(profile.rankedPlayed, 10)}/10 ranked wedstrijden · {Math.min(distinct, 5)}/5 verschillende tegenstanders. Je getal verandert al; de kleur blijft wit tot beide doelen zijn behaald.</p> : <p className="mb-3 text-xs leading-relaxed text-[#b0c4b8]">Geplaatst · {profile.rankedPlayed} ranked wedstrijden. Je rating verandert na een volledige ranked wedstrijd op basis van winst of verlies en de rating van je tegenstander.</p>}
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-y border-[#385344] py-3 text-xs"><dt className="rating-white">Wit</dt><dd>Plaatsingsfase</dd><dt className="rating-red">Rood</dt><dd>Lager dan 1450</dd><dt className="rating-amber">Geel</dt><dd>1450–1549</dd><dt className="rating-green">Groen</dt><dd>Vanaf 1550</dd></dl>
    <p className="mt-3 text-[11px] leading-relaxed text-[#91ad9d]">Elo · start 1500 · K = 32. Rolkleuren horen bij de naam. Ratingwijzigingen zijn gekoppeld aan je account.</p>
  </PopoverContent></Popover>;
}
