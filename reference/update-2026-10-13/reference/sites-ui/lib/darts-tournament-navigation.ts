"use client";

import { getAdminOperations } from "./darts-admin-operations";
import { getTournamentState } from "./darts-tournament-store";

/** Tournament play always enters the event's participant-gated room. */
export function tournamentRoomDestination(room: string, tournamentCategory = false): string | null {
  const existingRoom = getAdminOperations().rooms.find(value => value.name === room);
  // An event's free-text room label must never take over an existing social room.
  if (existingRoom && existingRoom.category !== "tournament" && !tournamentCategory) return null;
  const published = getTournamentState().tournaments.filter(event => event.settings.room === room && event.published && ["registration", "checkin", "live"].includes(event.status));
  // A shared room label may host multiple events: let the player choose explicitly.
  if (published.length === 1) return `/toernooi/${encodeURIComponent(published[0].id)}`;
  const reserved = tournamentCategory || published.length > 0 || existingRoom?.category === "tournament";
  return reserved ? "/lobby#events" : null;
}
