"use client";

import {useEffect, useState} from "react";
import {Mail} from "lucide-react";
import {useI18n} from "@/lib/i18n/provider";
import {usePlatform} from "@/lib/platform-client";
import styles from "./player-contact.module.css";

type ContactState =
  | {status: "loading" | "error" | "denied" | "unavailable"}
  | {status: "ready"; email: string | null};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Contact details stay local to this open profile, outside the shared player snapshot. */
export function PlayerContact({userId}: {userId?: string}) {
  const {actor} = usePlatform();
  if (!actor?.id || !["owner", "admin"].includes(actor.role) || !userId || !uuid.test(userId)) return null;

  // A changed viewer, role or profile immediately discards the previous result,
  // before effects can run for the new identity.
  return <ContactDetails key={`${actor.id}:${actor.role}:${userId}`} userId={userId}/>;
}

function ContactDetails({userId}: {userId: string}) {
  const {t} = useI18n("playerIdentity");
  const [state, setState] = useState<ContactState>({status: "loading"});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timeout = setTimeout(() => controller.abort(), 15000);

    async function load() {
      try {
        const response = await fetch(`/api/platform/admin/player-contact?userId=${encodeURIComponent(userId)}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (disposed) return;
        if (response.status === 401 || response.status === 403) {setState({status: "denied"}); return;}
        if (response.status === 404) {setState({status: "unavailable"}); return;}
        if (!response.ok) throw new Error("contact_unavailable");
        const data: unknown = await response.json();
        if (disposed) return;
        if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string" || data.id.toLowerCase() !== userId.toLowerCase() || !("email" in data) || (data.email !== null && typeof data.email !== "string")) {
          throw new Error("contact_invalid");
        }
        setState({status: "ready", email: data.email?.trim() || null});
      } catch {
        if (!disposed) setState({status: "error"});
      } finally {
        clearTimeout(timeout);
      }
    }

    void load();
    return () => {disposed = true; clearTimeout(timeout); controller.abort();};
  }, [userId, attempt]);

  if (state.status === "denied") return null;
  return <section className={styles.contact} aria-label={t("playerIdentity.email")} data-player-contact>
    <div className={styles.label}><Mail size={15} aria-hidden="true"/>{t("playerIdentity.email")}</div>
    <div className={styles.content} aria-live="polite" aria-atomic="true">
      {state.status === "ready" ? <span className={styles.email}>{state.email ?? t("playerIdentity.no_email")}</span>
        : state.status === "loading" ? <span>{t("playerIdentity.email_loading")}</span>
        : state.status === "unavailable" ? <span>{t("playerIdentity.email_unavailable")}</span>
        : <><span>{t("playerIdentity.email_error")}</span><button type="button" onClick={() => {setState({status: "loading"}); setAttempt(value => value + 1);}}>{t("playerIdentity.email_retry")}</button></>}
    </div>
  </section>;
}
