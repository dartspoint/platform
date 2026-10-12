"use client";
import { useSyncExternalStore } from "react";
const key = "dartspoint-favorite";
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("dartspoint-favorite-changed", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("dartspoint-favorite-changed", listener); };
}
function snapshot() { try { return localStorage.getItem(key) || ""; } catch { return ""; } }
function serverSnapshot() { return ""; }
function setFavorite(value: string) { try { localStorage.setItem(key, value); } catch { /* Preference storage is optional. */ } window.dispatchEvent(new Event("dartspoint-favorite-changed")); }
export function useFavoriteDesign() {
  const favorite = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return [favorite, setFavorite] as const;
}
