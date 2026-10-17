"use client";
import {useI18n} from '@/lib/i18n/provider';


import { Shield } from "lucide-react";
import { getPlayerDivision } from "@/lib/darts-divisions-model";
import { useDivisionSeasons } from "@/lib/darts-divisions-store";
import "./division-badge.css";

/** Division membership is independent from a nickname's role and its Elo colour. */
export function DivisionBadge({ name, compact = false }: { name: string; compact?: boolean }) {
 const dpT = useI18n("divisionBadge").t;

  const { seasons } = useDivisionSeasons();
  const membership = getPlayerDivision(seasons, name);
  if (!membership) return null;
  const { division, season } = membership;
  return <span className={`dp-division-badge dp-division-${division.color} ${compact ? "compact" : ""}`} title={dpT("divisionBadge.label",{name:division.name,nameValue:season.name})} aria-label={dpT("divisionBadge.speelt_in",{name:division.name,nameValue:season.name})}><Shield size={compact ? 11 : 13} aria-hidden="true"/><span>{compact ? dpT("divisionBadge.d",{level:division.level}) : division.name}</span></span>;
}
