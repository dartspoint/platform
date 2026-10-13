"use client";

import { DartsAuthFlow } from "@/components/darts-login";

/** Registration and login share the email-code flow; first access chooses a name. */
export function DartsRegistration() { return <DartsAuthFlow intent="register"/>; }
