"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { canReceivePrivate, isRoomMuted, isRoomRemoved } from "@/lib/darts-social";
import { getDartsPreferences } from "@/lib/darts-preferences";

export type ChatMessage = { id: number; name: string; text: string; time: string; system?: boolean; };
const initialRoom: ChatMessage[] = [
  { id: 1, name: "Mila", text: "Wie heeft er zin in een potje? 👋", time: "21:34" },
  { id: 2, name: "Joey180", text: "Net klaar! Best of 3?", time: "21:34" },
  { id: 3, name: "Mila", text: "Yes, stuur maar een uitnodiging", time: "21:35" },
  { id: 4, name: "DartMaster", text: "Lekker bezig iedereen 🎯", time: "21:36" },
];
const initialMatch: ChatMessage[] = [
  { id: 11, name: "", text: "Nick en Bullseye spelen een wedstrijd", time: "21:33", system: true },
  { id: 12, name: "Bullseye", text: "Succes! Mooie pot ervan maken", time: "21:34" },
  { id: 13, name: "Nick", text: "Jij ook! 🎯", time: "21:34" },
  { id: 14, name: "Rookie", text: "Ik kijk even mee 👀", time: "21:35" },
];

const initialPrivate: Record<string, string> = {
  Mila: "Hé Nick! Zin in een potje? Ik ben in Nederland 1.",
  Bullseye: "Die laatste finish was lekker. Straks revanche?",
  Joey180: "Ben er vanavond weer bij!",
};

// Conversations stay local, including full-page lobby ↔ game navigation.
// Session storage is only accessed after mount; SSR always uses stable seeds.
const CHAT_STORAGE_KEY = "dartspoint:chat:v1";
const MAX_CHAT_CHANNELS = 32;
const MAX_CHAT_MESSAGES = 80;
const initialChatChannels = new Map<string, ChatMessage[]>();
const chatChannels = new Map<string, ChatMessage[]>();
const chatDrafts = new Map<string, string>();
const initialOpenPrivateTabs = Object.freeze(Object.keys(initialPrivate));
let openPrivateTabs: readonly string[] = initialOpenPrivateTabs;
const EMPTY_MESSAGES: ChatMessage[] = [];
const chatListeners = new Set<() => void>();
let chatHydrated = false;
let chatVersion = 0;
export function getInitialChatChannel(key: string): ChatMessage[] {
  if (!key) return EMPTY_MESSAGES;
  let channel = initialChatChannels.get(key);
  if (!channel) {
    if (key.startsWith("private:")) {
      const name = key.slice(8);
      channel = [{ id: 1, name: "", text: `Privégesprek met ${name}`, time: "", system: true }];
      if (initialPrivate[name]) channel.push({ id: 2, name, text: initialPrivate[name], time: "21:36" });
    } else if (key.startsWith("room:")) {
      channel = [...initialRoom];
    } else {
      const opponent = key.slice(key.lastIndexOf(":") + 1);
      channel = initialMatch.map(message => message.id === 11 ? { ...message, text: `Nick en ${opponent} spelen een wedstrijd` } : message.id === 12 ? { ...message, name: opponent } : message);
    }
    initialChatChannels.set(key, channel);
  }
  return channel;
}
export function getChatChannel(key: string): ChatMessage[] { return chatChannels.get(key) ?? getInitialChatChannel(key); }
export function subscribeChat(listener: () => void) { chatListeners.add(listener); return () => { chatListeners.delete(listener); }; }
function notifyChat() { chatVersion += 1; chatListeners.forEach(listener => listener()); }
function isChatKey(value: unknown): value is string {
  return typeof value === "string" && value.length <= 160 && /^(private|room|match):.+/.test(value);
}
function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return typeof message.id === "number" && Number.isFinite(message.id)
    && typeof message.name === "string" && message.name.length <= 80
    && typeof message.text === "string" && message.text.length <= 500
    && typeof message.time === "string" && message.time.length <= 20
    && (message.system === undefined || typeof message.system === "boolean");
}
export function hydrateChat() {
  if (chatHydrated || typeof window === "undefined") return;
  chatHydrated = true;
  try {
    const stored = window.sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (!stored || stored.length > 2_000_000) return;
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== "object") return;
    const data = value as { version?: unknown; channels?: unknown; drafts?: unknown; openPrivateTabs?: unknown };
    if (data.version !== 1 && data.version !== 2) return;
    if (Array.isArray(data.channels)) for (const entry of data.channels.slice(-MAX_CHAT_CHANNELS)) {
      if (!Array.isArray(entry) || !isChatKey(entry[0]) || !Array.isArray(entry[1])) continue;
      const messages = entry[1].slice(-MAX_CHAT_MESSAGES).filter(isChatMessage);
      const seen = new Set<number>();
      chatChannels.set(entry[0], messages.filter(message => {
        if (seen.has(message.id)) return false;
        seen.add(message.id); return true;
      }));
    }
    if (Array.isArray(data.drafts)) for (const entry of data.drafts.slice(-MAX_CHAT_CHANNELS)) {
      if (Array.isArray(entry) && isChatKey(entry[0]) && typeof entry[1] === "string") chatDrafts.set(entry[0], entry[1].slice(0, 500));
    }
    if (data.version === 2 && Array.isArray(data.openPrivateTabs)) {
      openPrivateTabs = Array.from(new Set(data.openPrivateTabs.filter(validPrivateName))).slice(-MAX_CHAT_CHANNELS);
    } else {
      // Upgrade legacy messages once; future closed tabs remain closed even with history.
      openPrivateTabs = Array.from(new Set([...initialOpenPrivateTabs, ...Array.from(chatChannels.keys()).filter(key => key.startsWith("private:")).map(key => key.slice(8)).filter(validPrivateName)])).slice(-MAX_CHAT_CHANNELS);
    }
  } catch {
    // Private browsing or corrupt saved data must not block the prototype.
  } finally {
    notifyChat();
  }
}
function persistChat() {
  if (!chatHydrated || typeof window === "undefined") return;
  while (chatChannels.size > MAX_CHAT_CHANNELS) chatChannels.delete(chatChannels.keys().next().value!);
  while (chatDrafts.size > MAX_CHAT_CHANNELS) chatDrafts.delete(chatDrafts.keys().next().value!);
  try {
    window.sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ version: 2, channels: [...chatChannels], drafts: [...chatDrafts], openPrivateTabs }));
  } catch {
    // Keep in-memory chat usable if session storage is unavailable or full.
  }
}
export function appendChatMessage(key: string, message: ChatMessage) {
  if (!isChatKey(key)) return;
  const channel = getChatChannel(key);
  const lastId = channel.reduce((max, item) => Math.max(max, item.id), 0);
  chatChannels.set(key, [...channel, { ...message, id: Math.max(message.id, lastId + 1) }].slice(-MAX_CHAT_MESSAGES));
  persistChat();
  notifyChat();
}
export function getChatDraft(key: string) { return chatDrafts.get(key) ?? ""; }
export function updateChatDraft(key: string, text: string) { if (!isChatKey(key)) return; chatDrafts.set(key, text.slice(0, 500)); persistChat(); notifyChat(); }

function validPrivateName(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && value === value.trim() && value.length <= 80 && value !== "Nick";
}
export function getOpenPrivateChatTabs(): readonly string[] { hydrateChat(); return openPrivateTabs; }
export function useChatHydrated() {
  const ready = useSyncExternalStore(subscribeChat, () => chatHydrated, () => false);
  useEffect(hydrateChat, []);
  return ready;
}
export function useOpenPrivateChatTabs(): readonly string[] {
  const names = useSyncExternalStore(subscribeChat, () => openPrivateTabs, () => initialOpenPrivateTabs);
  useEffect(hydrateChat, []);
  return names;
}
/** Opening a conversation is explicit; incoming messages only update its history. */
export function openPrivateChatTab(name: string) {
  hydrateChat();
  if (!validPrivateName(name)) return false;
  if (openPrivateTabs.includes(name)) return true;
  openPrivateTabs = [...openPrivateTabs, name].slice(-MAX_CHAT_CHANNELS);
  persistChat(); notifyChat();
  return true;
}
export function resolveChatTab(requested: string, names: readonly string[], lobby = false): string {
  if (requested.startsWith("private:") && names.includes(requested.slice(8))) return requested;
  if (!lobby && (requested === "match" || requested === "room")) return requested;
  return lobby ? (names[0] ? `private:${names[0]}` : "") : "match";
}
export function nextChatTabAfterClose(name: string, activeTab: string, names: readonly string[], lobby = false) {
  const index = names.indexOf(name);
  const remaining = names.filter(item => item !== name);
  if (activeTab !== `private:${name}`) return resolveChatTab(activeTab, remaining, lobby);
  const adjacent = remaining[Math.min(Math.max(index, 0), remaining.length - 1)];
  return adjacent ? `private:${adjacent}` : lobby ? "" : "match";
}
/** Closing removes only the tab; messages, drafts, and the inbox entry are retained. */
export function closePrivateChatTab(name: string, activeTab: string, lobby = false, visibleNames?: readonly string[]) {
  hydrateChat();
  const next = nextChatTabAfterClose(name, activeTab, visibleNames ?? openPrivateTabs, lobby);
  if (openPrivateTabs.includes(name)) {
    openPrivateTabs = openPrivateTabs.filter(item => item !== name);
    persistChat(); notifyChat();
  }
  return next;
}

export function usePrivateChatPreview(name: string): { text: string; time: string; lastId: number; sender: string } {
  const key = `private:${name}`;
  const messages = useSyncExternalStore(subscribeChat, () => getChatChannel(key), () => getInitialChatChannel(key));
  useEffect(hydrateChat, []);
  return useMemo(() => {
    const last = messages.findLast(message => !message.system);
    return last
      ? { text: `${last.name === "Nick" ? "Jij: " : ""}${last.text}`, time: last.time, lastId: last.id, sender: last.name }
      : { text: "Begin een gesprek", time: "", lastId: 0, sender: "" };
  }, [messages]);
}

export type PrivateChatPreview = { name: string; text: string; time: string; lastId: number; sender: string };
export function usePrivateChatInbox(): PrivateChatPreview[] {
  const version = useSyncExternalStore(subscribeChat, () => chatVersion, () => 0);
  useEffect(hydrateChat, []);
  return useMemo(() => {
    const names = Array.from(new Set([...Object.keys(initialPrivate), ...(version === 0 ? [] : Array.from(chatChannels.keys()).filter(key => key.startsWith("private:")).map(key => key.slice(8)))]));
    return names.flatMap(name => {
      const key = `private:${name}`;
      const messages = version === 0 ? getInitialChatChannel(key) : getChatChannel(key);
      const last = messages.findLast(message => !message.system);
      return last ? [{ name, text: `${last.name === "Nick" ? "Jij: " : ""}${last.text}`, time: last.time, lastId: last.id, sender: last.name }] : [];
    }).sort((a, b) => b.lastId - a.lastId);
  }, [version]);
}

export function receivePrivateMessage(name: string, text: string) {
  hydrateChat();
  const key = `private:${name}`;
  const existing = getChatChannel(key).some(message => !message.system);
  if (!canReceivePrivate(name, getDartsPreferences().privateMessages, existing)) return false;
  appendChatMessage(key, { id: Date.now(), name, text: text.slice(0, 500), time: new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) });
  return true;
}

export function sendQuickChat(text: string, { roomName = "Nederland 1", opponentName = "Bullseye", gameId = "83626", channel = "match" }: { roomName?: string; opponentName?: string; gameId?: string; channel?: "match" | "room" } = {}) {
  hydrateChat();
  if (!text.trim() || isRoomMuted("Nick", roomName) || isRoomRemoved("Nick", roomName)) return false;
  appendChatMessage(channel === "room" ? `room:${roomName}` : `match:${roomName}:${gameId}:${opponentName}`, { id: Date.now(), name: "Nick", text: text.trim().slice(0, 500), time: new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) });
  return true;
}

