"use client";

import { useEffect, useState } from "react";
import { api, ApiError, mutate, usePlatform } from "./platform-client";
export {
  LOBBY_WIDGET_LABELS, createLobbyArticle, createLobbyWidget, safeLobbyHref, visibleLobbyWidgets,
} from "../../../packages/contracts/src/lobby";
export type { LobbyArticle, LobbyContentState, LobbyLayout, LobbyWidget, LobbyWidgetType } from "../../../packages/contracts/src/lobby";
import type { LobbyContentState, LobbyLayout, LobbyFeed } from "../../../packages/contracts/src/lobby";

export type LobbyFeedPayload = LobbyFeed;
export function useLobbyContent() {
  const platform = usePlatform();
  const [state, setState] = useState<LobbyContentState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let disposed = false;
    setLoading(true); setError("");
    if (platform.actor?.role !== "owner") { setState(null); setLoading(false); return; }
    void api<LobbyContentState>("lobby/admin").then(value => { if (!disposed) setState(value); }).catch(cause => { if (!disposed) setError(cause instanceof Error ? cause.message : "Lobbybeheer kan niet worden geladen."); }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [platform.actor?.id, platform.actor?.role, refresh]);
  return { state, setState, error, loading, reload: () => setRefresh(value => value + 1) };
}
export async function saveLobbyDraft(layout: LobbyLayout, expectedDraftVersion: number, requestId = crypto.randomUUID()) {
  return await mutate<LobbyContentState>("lobby", { action: "save", layout, expectedDraftVersion, requestId });
}
export async function publishLobbyLayout(layout: LobbyLayout, expectedDraftVersion: number, requestId = crypto.randomUUID()) {
  return await mutate<LobbyContentState>("lobby", { action: "publish", layout, expectedDraftVersion, requestId });
}
export function isLobbyVersionConflict(cause: unknown) { return cause instanceof ApiError && (cause.status === 409 || cause.code === "lobby_version_conflict"); }
