"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getAdminOperations } from "@/lib/darts-admin-operations";
import { players } from "@/lib/darts-data";

/** Seed contacts only. Live membership comes from the social store. */
export const FRIEND_NAMES = ["Mila", "Bullseye", "Joey180", "Rookie", "Sophie"];
export type FriendRequest = { id: string; name: string; direction: "incoming" | "outgoing"; createdAt: number };
export type FriendStatus = "self" | "friends" | "incoming" | "outgoing" | "none";
export type SocialResult = { ok: true } | { ok: false; error: string };
export type PlayerPresence = { online: boolean; room: string; status: string; available: boolean };
const demoPresence: Record<string, PlayerPresence> = Object.fromEntries(players.map(player => [player.name, { online: player.name !== "Sophie", room: player.name === "Sophie" ? "" : player.name === "Joey180" ? "Afterhours" : player.name === "Rookie" ? "Beginners" : "Nederland 1", status: player.name === "Sophie" ? "Offline" : player.status === "Speelt" ? "Speelt een wedstrijd" : player.status === "Kijkt mee" ? "Kijkt gezellig mee" : "Klaar voor een potje", available: player.name !== "Sophie" && player.status !== "Speelt" }]));
/** Shared prototype presence. Unknown contacts are never presented as live players. */
export function getPlayerPresence(name: string): PlayerPresence { return demoPresence[name] ?? { online: false, room: "", status: "Offline", available: false }; }
export type ModerationKind = "warn" | "mute" | "remove";
export type ModerationEntry = { id: string; name: string; room: string; kind: ModerationKind; reason: string; createdAt: number; until: number; moderator: string };
export type PlayerReport = { id: string; name: string; room: string; gameId: string; reason: string; detail: string; context: string; createdAt: number; status: "Nieuw" };
export type SocialState = { friends: string[]; friendRequests: FriendRequest[]; muted: string[]; blocked: string[]; moderation: ModerationEntry[]; reports: PlayerReport[]; queues: Record<string, string[]> };
const KEY = "dartspoint:social:v1";
const initial: SocialState = { friends: [...FRIEND_NAMES], friendRequests: [{ id: "friend-demo-triplekim", name: "TripleKim", direction: "incoming", createdAt: Date.UTC(2026, 9, 11, 20) }], muted: [], blocked: [], moderation: [], reports: [], queues: {} };
let state: SocialState = initial;
let hydrated = false;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function emit() { listeners.forEach(listener => listener()); }
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw && raw.length < 1_000_000) {
      const data = JSON.parse(raw) as Partial<SocialState>;
      const names = (value: unknown, fallback: string[] = []) => Array.isArray(value) ? Array.from(new Set(value.filter((name): name is string => typeof name === "string" && !!name.trim() && name !== "Nick" && name.length <= 50))).slice(0, 200) : [...fallback];
      const friends = names(data.friends, initial.friends);
      const blocked = names(data.blocked);
      const requests = Array.isArray(data.friendRequests) ? data.friendRequests : initial.friendRequests;
      state = {
        friends,
        friendRequests: requests.filter((request, index, all) => request && typeof request.id === "string" && typeof request.name === "string" && request.name !== "Nick" && request.name.length <= 50 && !!request.name.trim() && ["incoming", "outgoing"].includes(request.direction) && Number.isFinite(request.createdAt) && !friends.includes(request.name) && !blocked.includes(request.name) && all.findIndex(item => item?.name === request.name) === index).slice(0, 100),
        muted: names(data.muted),
        blocked,
        moderation: Array.isArray(data.moderation) ? data.moderation.filter(entry => entry && typeof entry.name === "string" && typeof entry.room === "string" && ["warn", "mute", "remove"].includes(entry.kind) && Number.isFinite(entry.until) && typeof entry.reason === "string").slice(-100) : [],
        reports: Array.isArray(data.reports) ? data.reports.filter(report => report && typeof report.name === "string" && typeof report.reason === "string" && Number.isFinite(report.createdAt)).slice(-100) : [],
        queues: data.queues && typeof data.queues === "object" && !Array.isArray(data.queues) ? Object.fromEntries(Object.entries(data.queues).filter(([key, names]) => key.length < 100 && Array.isArray(names)).map(([key, names]) => [key, names.filter(name => typeof name === "string").slice(0, 20)])) : {},
      };
    }
  } catch { /* In-memory actions remain usable when storage is unavailable. */ }
  emit();
}
function save(next: SocialState) {
  state = next;
  if (typeof window !== "undefined") try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Local-only prototype. */ }
  emit();
}
export function getDartsSocial() { hydrate(); return state; }
export function useDartsSocial() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => initial);
  useEffect(hydrate, []);
  return { ...snapshot, isBlocked: (name: string) => snapshot.blocked.includes(name), isMuted: (name: string) => snapshot.muted.includes(name), isFriend: (name: string) => snapshot.friends.includes(name), friendStatus: (name: string) => friendStatus(name, snapshot), getPresence: getPlayerPresence };
}
export function friendStatus(name: string, current = getDartsSocial()): FriendStatus {
  if (name === "Nick") return "self";
  if (current.friends.includes(name)) return "friends";
  return current.friendRequests.find(request => request.name === name)?.direction ?? "none";
}
export function isFriend(name: string) { return getDartsSocial().friends.includes(name); }
function validFriendTarget(name: string): SocialResult {
  if (!name.trim() || name.length > 50 || name === "Nick") return { ok: false, error: "Kies een andere speler." };
  if (isBlocked(name)) return { ok: false, error: "Deblokkeer deze speler eerst." };
  return { ok: true };
}
export function sendFriendRequest(name: string): SocialResult {
  const valid = validFriendTarget(name); if (!valid.ok) return valid;
  const current = getDartsSocial();
  if (friendStatus(name, current) !== "none") return { ok: false, error: "Jullie zijn al vrienden of er staat al een verzoek open." };
  if (current.friendRequests.length >= 100 || current.friends.length >= 200) return { ok: false, error: "De vriendenlijst is vol." };
  save({ ...current, friendRequests: [...current.friendRequests, { id: `friend-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, direction: "outgoing", createdAt: Date.now() }] });
  return { ok: true };
}
function finishFriendRequest(name: string, direction: FriendRequest["direction"], accept: boolean): SocialResult {
  const current = getDartsSocial();
  if (!current.friendRequests.some(request => request.name === name && request.direction === direction)) return { ok: false, error: "Dit verzoek staat niet meer open." };
  if (accept) { const valid = validFriendTarget(name); if (!valid.ok) return valid; if (current.friends.length >= 200) return { ok: false, error: "De vriendenlijst is vol." }; }
  save({ ...current, friends: accept ? [...new Set([...current.friends, name])] : current.friends, friendRequests: current.friendRequests.filter(request => request.name !== name) });
  return { ok: true };
}
export function cancelFriendRequest(name: string) { return finishFriendRequest(name, "outgoing", false); }
export function acceptFriendRequest(name: string) { return finishFriendRequest(name, "incoming", true); }
export function rejectFriendRequest(name: string) { return finishFriendRequest(name, "incoming", false); }
/** Explicitly invoked simulation. Never automatically accepts a request on someone's behalf. */
export function simulateFriendAcceptance(name: string) { return finishFriendRequest(name, "outgoing", true); }
export function removeFriend(name: string): SocialResult {
  const current = getDartsSocial();
  if (!current.friends.includes(name)) return { ok: false, error: "Deze speler staat niet in je vriendenlijst." };
  save({ ...current, friends: current.friends.filter(friend => friend !== name) });
  return { ok: true };
}
export function isPersonallyMuted(name: string) { return getDartsSocial().muted.includes(name); }
export function togglePersonalMute(name: string): SocialResult {
  if (!name.trim() || name === "Nick") return { ok: false, error: "Je kunt jezelf niet muten." };
  const current = getDartsSocial();
  save({ ...current, muted: current.muted.includes(name) ? current.muted.filter(item => item !== name) : [...current.muted, name].slice(-200) });
  return { ok: true };
}
export function isBlocked(name: string) { return getDartsSocial().blocked.includes(name); }
export function toggleBlocked(name: string) {
  if (!name || name === "Nick") return;
  const current = getDartsSocial();
  const blocked = current.blocked.includes(name);
  save({ ...current, blocked: blocked ? current.blocked.filter(item => item !== name) : [...current.blocked, name], friendRequests: blocked ? current.friendRequests : current.friendRequests.filter(request => request.name !== name) });
}
export function isRoomMuted(name: string, room: string, at = Date.now()) {
  return getDartsSocial().moderation.some(entry => entry.name === name && entry.room === room && entry.kind === "mute" && entry.until > at);
}
export function isRoomRemoved(name: string, room: string, at = Date.now()) {
  return getDartsSocial().moderation.some(entry => entry.name === name && entry.room === room && entry.kind === "remove" && entry.until > at);
}
export function canModeratePlayer(name: string, room: string, actor = "Nick") {
  const operations = getAdminOperations();
  const viewer = operations.members.find(member => member.name === actor);
  const target = operations.members.find(member => member.name === name);
  if (!viewer || name === actor || target?.role === "owner") return false;
  return viewer.role === "owner" || viewer.role === "admin" || operations.rooms.some(item => item.name === room && item.moderator === actor);
}
export function moderationAction(input: { name: string; room: string; kind: ModerationKind; reason: string; minutes?: number; actor?: string }) {
  if (!input.name || !canModeratePlayer(input.name, input.room, input.actor) || !["warn", "mute", "remove"].includes(input.kind) || input.reason.trim().length < 5 || (input.kind !== "warn" && (!Number.isFinite(input.minutes ?? 10) || (input.minutes ?? 10) < 1 || (input.minutes ?? 10) > 60))) return false;
  const now = Date.now();
  const entry: ModerationEntry = { id: `mod-${now}-${Math.random().toString(36).slice(2, 7)}`, name: input.name, room: input.room, kind: input.kind, reason: input.reason.trim().slice(0, 300), createdAt: now, until: input.kind === "warn" ? now : now + (input.minutes ?? 10) * 60_000, moderator: input.actor ?? "Nick" };
  const current = getDartsSocial();
  save({ ...current, moderation: [...current.moderation, entry].slice(-100) });
  return true;
}
export function revokeModeration(id: string, actor = "Nick") {
  const current = getDartsSocial();
  const entry = current.moderation.find(item => item.id === id);
  if (!entry || !canModeratePlayer(entry.name, entry.room, actor)) return false;
  save({ ...current, moderation: current.moderation.map(entry => entry.id === id ? { ...entry, until: Date.now() } : entry) });
  return true;
}
export function reportPlayer(input: Omit<PlayerReport, "id" | "createdAt" | "status">) {
  const current = getDartsSocial();
  const report: PlayerReport = { ...input, reason: input.reason.slice(0, 80), detail: input.detail.slice(0, 600), context: input.context.slice(0, 2000), id: `M-${Date.now().toString(36).toUpperCase()}`, createdAt: Date.now(), status: "Nieuw" };
  save({ ...current, reports: [...current.reports, report].slice(-100) });
  return report.id;
}
export function toggleQueue(matchId: string, name = "Nick") {
  const current = getDartsSocial();
  const queue = current.queues[matchId] ?? [];
  save({ ...current, queues: { ...current.queues, [matchId]: queue.includes(name) ? queue.filter(item => item !== name) : [...queue, name].slice(0, 20) } });
}
export function advanceQueue(matchId: string) {
  const current = getDartsSocial();
  const queue = current.queues[matchId] ?? [];
  const next = queue[0];
  save({ ...current, queues: { ...current.queues, [matchId]: queue.slice(1) } });
  return next;
}
export function canReceivePrivate(name: string, policy: "everyone" | "friends" | "nobody", existingConversation: boolean) {
  if (isBlocked(name) || isPersonallyMuted(name)) return false;
  if (existingConversation) return true;
  return policy === "everyone" || (policy === "friends" && isFriend(name));
}
