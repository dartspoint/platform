'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { npcProfiles } from './darts-npc-profiles';

export const NPC_TEXT_WINDOW_MS = 12 * 60 * 60 * 1000;
const STORAGE = 'dartspoint:npc-text-history:v1';
const LOCK = 'dartspoint:npc-text-publication:v1';
const MAX_ENTRIES = 5000;
export type NpcTextCandidate = string | { text: string; family?: string };
type Entry = { at: number; npcId: string; channel: string; text: string; family?: string };
type Ledger = { version: 1; lastSeenAt: number; acceptedTotal: number; blockedTotal: number; lastBlockedAt: number | null; entries: Entry[]; legacyMigrated?: boolean };
export type NpcTextGuardSnapshot = { hydrated: boolean; recentCount: number; acceptedTotal: number; blockedTotal: number; storageReady: boolean; lastBlockedAt: number | null };
type Result = { sent: boolean; reason: 'accepted' | 'duplicate' | 'empty' | 'unavailable' | 'cancelled' | 'capacity'; text?: string };
type Request = { npcId: string; channel: string; candidates: NpcTextCandidate[]; canPublish?: () => boolean; approveCandidate?: (text:string,candidate:NpcTextCandidate)=>boolean; publish: (text: string) => void };
const INITIAL: NpcTextGuardSnapshot = { hydrated: false, recentCount: 0, acceptedTotal: 0, blockedTotal: 0, storageReady: false, lastBlockedAt: null };
const listeners = new Set<() => void>();
let state = INITIAL;
let queue: Promise<unknown> = Promise.resolve();
let initialized = false;
let legacySeed: Entry[] = [];

// Remove display-only differences. Names and numbers cannot be used to make a
// repeated template appear new. This is lexical similarity, not an LLM verdict.
const normalize = (text: string) => text.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f\u200b-\u200d\ufeff]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const names = new Set(['nick', ...npcProfiles.flatMap(p => normalize(p.nickname).split(' '))]);
function signature(text: string) { return normalize(text).split(' ').filter(word => !names.has(word)).map(word => /^\d+$/.test(word) ? '#' : word).join(' '); }
function grams(text: string) { const set = new Set<string>(); for (let i = 0; i < text.length - 2; i++) set.add(text.slice(i, i + 3)); return set; }
function similar(a: string, b: string) {
  if (a === b) return true;
  const short = a.length < b.length ? a : b, long = a.length < b.length ? b : a;
  // Also catches a greeting or an extra sentence placed around an old message.
  if (short.split(' ').length >= 4 && long.includes(short) && short.length / long.length >= .6) return true;
  const aw = new Set(a.split(' ')), bw = new Set(b.split(' '));
  const overlap = [...aw].filter(word => bw.has(word)).length;
  if (2 * overlap / (aw.size + bw.size) >= .82) return true;
  if (short.length < 12 || short.length / long.length < .65) return false;
  const ag = grams(a), bg = grams(b), common = [...ag].filter(g => bg.has(g)).length;
  return 2 * common / (ag.size + bg.size) >= .86;
}
const emptyLedger = (): Ledger => ({ version: 1, lastSeenAt: Math.max(Date.now(), ...legacySeed.map(e => e.at)), acceptedTotal: legacySeed.length, blockedTotal: 0, lastBlockedAt: null, entries: [...legacySeed], legacyMigrated: true });
function captureLegacyHistory(): Entry[] {
  const entries: Entry[] = [], seen = new Set<string>(), at = Date.now();
  const add = (messages: unknown, channel: string) => {
    if (!Array.isArray(messages) || channel.length > 200) return;
    for (const message of messages) {
      if (!message || message.system || message.human || typeof message.text !== 'string' || typeof message.name !== 'string') continue;
      const profile = npcProfiles.find(p => p.nickname === message.name);
      const text = message.text.trim().slice(0, 500), key = signature(text);
      if (!profile || !key || seen.has(key)) continue;
      seen.add(key); entries.push({ at, npcId: profile.id, channel, text });
    }
  };
  // Old chats use simulation timestamps. Conservatively keep their visible NPC
  // texts for twelve hours from upgrade rather than guessing their real age.
  try {
    const raw = window.sessionStorage.getItem('dartspoint:npc-director:v1');
    if (raw && raw.length < 1_000_000) { const chat = JSON.parse(raw)?.chat; if (Array.isArray(chat)) add(chat.slice(-160), 'legacy:director'); }
  } catch { /* Optional legacy storage; new output still requires its ledger. */ }
  try {
    const raw = window.sessionStorage.getItem('dartspoint:chat:v1');
    if (raw && raw.length < 2_000_000) {
      const saved = JSON.parse(raw);
      if ([1, 2].includes(saved?.version) && Array.isArray(saved.channels)) for (const entry of saved.channels.slice(-32)) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && Array.isArray(entry[1])) add(entry[1].slice(-80), entry[0]);
      }
    }
  } catch { /* Legacy data never replaces an existing protected ledger. */ }
  return entries;
}
function readLedger(): Ledger {
  const raw = window.localStorage.getItem(STORAGE);
  if (raw === null) return emptyLedger();
  if (raw.length > 6_000_000) throw new Error('Invalid NPC text ledger');
  const value = JSON.parse(raw) as Ledger;
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (!value || value.version !== 1 || !finite(value.lastSeenAt) || !finite(value.acceptedTotal) || !finite(value.blockedTotal) || !(value.lastBlockedAt === null || finite(value.lastBlockedAt)) || !Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES || !value.entries.every(e => e && finite(e.at) && e.at <= value.lastSeenAt && npcProfiles.some(p => p.id === e.npcId) && typeof e.channel === 'string' && e.channel.length <= 200 && typeof e.text === 'string' && e.text.length > 0 && e.text.length <= 500 && (e.family === undefined || (typeof e.family === 'string' && e.family.length <= 200)))) throw new Error('Invalid NPC text ledger');
  if (!value.legacyMigrated) {
    prune(value);
    const existing = new Set(value.entries.map(e => signature(e.text)));
    for (const entry of legacySeed) {
      const key = signature(entry.text);
      if (existing.has(key)) continue;
      if (value.entries.length >= MAX_ENTRIES) throw new Error('NPC legacy migration exceeds ledger capacity');
      existing.add(key); value.entries.push({ ...entry, at: value.lastSeenAt }); value.acceptedTotal++;
    }
    value.legacyMigrated = true;
  }
  return value;
}
function prune(ledger: Ledger) {
  // A system-clock rollback must never expire a message early.
  ledger.lastSeenAt = Math.max(Date.now(), ledger.lastSeenAt);
  ledger.entries = ledger.entries.filter(e => e.at > ledger.lastSeenAt - NPC_TEXT_WINDOW_MS);
  return ledger;
}
function report(ledger: Ledger | null) {
  state = ledger ? { hydrated: true, recentCount: ledger.entries.length, acceptedTotal: ledger.acceptedTotal, blockedTotal: ledger.blockedTotal, storageReady: true, lastBlockedAt: ledger.lastBlockedAt } : { ...state, hydrated: true, storageReady: false };
  listeners.forEach(fn => fn());
}
function refresh() {
  if (typeof window === 'undefined') return;
  try { const ledger = prune(readLedger()); report(ledger); } catch { report(null); }
}
async function exclusive<T>(callback: () => T): Promise<T> {
  const locks = window.navigator?.locks;
  return locks ? locks.request(LOCK, callback) : callback();
}
export function initializeNpcTextGuard() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  legacySeed = captureLegacyHistory();
  refresh();
  // Queue migration before the first publication. Capturing above is synchronous
  // so immediately resetting the visible demo cannot discard legacy history.
  queue = queue.then(() => exclusive(() => {
    const ledger = prune(readLedger());
    window.localStorage.setItem(STORAGE, JSON.stringify(ledger));
    report(ledger);
  })).catch(() => { report(null); });
  window.addEventListener('storage', e => { if (e.key === STORAGE || e.key === null) refresh(); });
}
export function getNpcTextGuardSnapshot() { return state; }
export function subscribeNpcTextGuard(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function useNpcTextGuard() {
  const snapshot = useSyncExternalStore(subscribeNpcTextGuard, getNpcTextGuardSnapshot, () => INITIAL);
  useEffect(() => { initializeNpcTextGuard(); const timer = setInterval(refresh, 30_000); return () => clearInterval(timer); }, []);
  return snapshot;
}

function publishLocked(request: Request): Result {
  if (request.canPublish && !request.canPublish()) return { sent: false, reason: 'cancelled' };
  let ledger: Ledger;
  try { ledger = prune(readLedger()); } catch { report(null); return { sent: false, reason: 'unavailable' }; }
  if (!npcProfiles.some(p => p.id === request.npcId) || !request.channel || request.channel.length > 200) return { sent: false, reason: 'empty' };
  const history = ledger.entries.map(e => ({ ...e, signature: signature(e.text) }));
  let rejected = 0, contextRejected = 0;
  for (const candidate of request.candidates) {
    const text = (typeof candidate === 'string' ? candidate : candidate.text).trim().slice(0, 500);
    const family = typeof candidate === 'string' ? undefined : candidate.family;
    const key = signature(text);
    if (!key || (family !== undefined && family.length > 200)) continue;
    if (request.approveCandidate && !request.approveCandidate(text,candidate)) { contextRejected++; continue; }
    if (history.some(e => (family && e.family === family) || similar(key, e.signature))) { rejected++; continue; }
    if (ledger.entries.length >= MAX_ENTRIES) { report(ledger); return { sent: false, reason: 'capacity' }; }
    ledger.blockedTotal += rejected;
    if (rejected) ledger.lastBlockedAt = ledger.lastSeenAt;
    ledger.entries.push({ at: ledger.lastSeenAt, npcId: request.npcId, channel: request.channel, text, ...(family ? { family } : {}) });
    ledger.acceptedTotal++;
    // Persist before delivery, inside the same lock. Storage failure means silence.
    try { window.localStorage.setItem(STORAGE, JSON.stringify(ledger)); } catch { report(null); return { sent: false, reason: 'unavailable' }; }
    report(ledger);
    request.publish(text);
    return { sent: true, reason: 'accepted', text };
  }
  ledger.blockedTotal += rejected;
  if (rejected) ledger.lastBlockedAt = ledger.lastSeenAt;
  try { window.localStorage.setItem(STORAGE, JSON.stringify(ledger)); report(ledger); } catch { report(null); return { sent: false, reason: 'unavailable' }; }
  return { sent: false, reason: rejected ? 'duplicate' : contextRejected ? 'cancelled' : 'empty' };
}

/** All NPC speech uses this one gate, regardless of speaker, room or channel.
 * Web Locks serialize tabs on the same origin. The fallback serializes this page.
 * Production multiplayer needs a shared server ledger + transactional outbox.
 */
export function publishNpcText(request: Request): Promise<Result> {
  initializeNpcTextGuard();
  const task = queue.then(async () => {
    if (typeof window === 'undefined') return { sent: false, reason: 'unavailable' } as Result;
    try { return await exclusive(() => publishLocked(request)); }
    catch { report(null); return { sent: false, reason: 'unavailable' } as Result; }
  });
  queue = task.catch(() => undefined);
  return task;
}
