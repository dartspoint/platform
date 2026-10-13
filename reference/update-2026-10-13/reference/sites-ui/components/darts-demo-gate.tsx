"use client";
import { useEffect, useState, type ReactNode } from "react";
import { readDemoSession } from "@/lib/darts-session";

/** A prototype navigation gate, not an authentication/security boundary. */
export function DemoGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // If browser storage is disabled, keep this explicitly local demo usable.
    // This gate deliberately provides no real account protection.
    try { window.sessionStorage.getItem("dartspoint-demo-session-v1"); }
    catch { setReady(true); return; }
    if (readDemoSession()) setReady(true);
    else window.location.replace("/inloggen");
  }, []);
  if (!ready) return <main className="dp-entry-loading" role="status" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", color: "#9fbcaa" }}>DartsPoint wordt geopend…</main>;
  return children;
}
