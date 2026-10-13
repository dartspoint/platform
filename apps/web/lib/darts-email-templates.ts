/**
 * DartsPoint transactional email design system.
 * Pure rendering only: this module never sends mail or creates authentication tokens.
 * Production OTPs come from Supabase Auth, never from this renderer or a browser.
 */
export const DARTS_EMAIL_OTP_MINUTES = 10 as const;
export const DARTS_EMAIL_ORIGIN = "https://dartspoint.nl";
const APPROVED_EMAIL_ORIGINS = new Set([
  DARTS_EMAIL_ORIGIN, "https://www.dartspoint.nl", "https://dartspoint.app", "https://staging.dartspoint.nl",
]);

export type DartsEmailInput =
  | { type: "otp"; code: string; expiresMinutes?: typeof DARTS_EMAIL_OTP_MINUTES }
  | { type: "welcome"; username: string }
  | { type: "friend-request"; username: string; fromUsername: string }
  | { type: "match-reminder"; username: string; opponent: string; gameMode: "301" | "501" | "701"; startsAtLabel: string; actionUrl?: string }
  | { type: "tournament-reminder"; username: string; eventName: string; startsAtLabel: string; roomName: string; checkInLabel: string; actionUrl?: string }
  | { type: "moderation"; username: string; action: string; reason: string; caseId: string; durationLabel?: string; actionUrl?: string }
  | { type: "announcement"; heading: string; message: string; actionLabel: string; actionUrl: string; preferencesUrl: string };

export type DartsEmailResult = { subject: string; preheader: string; html: string; text: string };
export type DartsEmailMode = "production" | "preview";
export type DartsEmailOptions = { mode?: DartsEmailMode; origin?: string };
type EmailContent = {
  subject: string; preheader: string; eyebrow: string; heading: string; paragraphs: string[];
  details?: [string, string][]; code?: string; note: string;
  action?: { label: string; url: string }; preferencesUrl?: string;
};

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** Fixed HTTPS origins and app routes only; never a redirect endpoint or arbitrary HTML URL. */
export function safeDartsEmailUrl(value: string): string {
  if (!/^https:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) throw new Error("Email action requires a trusted HTTPS URL.");
  const url = new URL(value);
  if (!APPROVED_EMAIL_ORIGINS.has(url.origin) || url.username || url.password || url.port) throw new Error("Untrusted email action origin.");
  if (!["/", "/lobby", "/inloggen", "/registreren", "/spelen", "/divisies", "/clubhuis"].includes(url.pathname) && !/^\/toernooi\/[a-zA-Z0-9_-]{1,100}$/.test(url.pathname)) throw new Error("Unknown email action route.");
  for (const [key, item] of url.searchParams) if (url.pathname !== "/lobby" || key !== "view" || !["home", "friends", "messages", "profile"].includes(item)) throw new Error("Unknown email action query.");
  if (url.hash && !/^#[a-zA-Z0-9_-]{1,80}$/.test(url.hash)) throw new Error("Unknown email action fragment.");
  return url.href;
}

function subjectText(value: string): string { return value.replace(/[\r\n\u0000-\u001f\u007f]/g, " ").trim().slice(0, 180); }

function contentFor(input: DartsEmailInput, origin: string): EmailContent {
  const lobby = `${origin}/lobby`;
  switch (input.type) {
    case "otp":
      if (!/^\d{6}$/.test(input.code)) throw new Error("A DartsPoint login code must contain exactly six digits.");
      if (input.expiresMinutes !== undefined && input.expiresMinutes !== DARTS_EMAIL_OTP_MINUTES) throw new Error("OTP validity must match the configured 10-minute authentication policy.");
      return {
        subject: "Je inlogcode voor DartsPoint", preheader: "Je persoonlijke code is 10 minuten geldig. Deel deze code met niemand.",
        eyebrow: "JOUW TOEGANG TOT DARTSPOINT", heading: "Je avond begint hier.",
        paragraphs: ["Voer deze code in op het scherm waar je zojuist je e-mailadres hebt ingevuld. Dan ben je klaar voor je volgende potje."],
        code: input.code, note: "Deze code is 10 minuten geldig en kun je één keer gebruiken. Heb je geen code aangevraagd? Dan kun je deze e-mail negeren. Deel je code nooit: DartsPoint vraagt er niet naar via chat of e-mail.",
      };
    case "welcome": return {
      subject: "Welkom bij DartsPoint", preheader: `Je spelersnaam ${input.username} staat klaar. Tijd voor je eerste leg.`,
      eyebrow: "JE HOORT ERBIJ", heading: `Welkom, ${input.username}.`,
      paragraphs: ["Je spelersnaam staat klaar. Vind je favoriete kamer, nodig iemand uit en ontdek dat vertrouwde gevoel van nog één potje.", "Je begint met een voorlopige DP-rating van 1500. Speel je eerste wedstrijden en vind stap voor stap je plek op de ladder."],
      details: [["Spelersnaam", input.username], ["Start-rating", "1500 · nieuwe speler"]],
      action: { label: "Naar de lobby", url: lobby }, note: "Deze e-mail bevestigt dat je spelersprofiel is aangemaakt. Fijn dat je erbij bent.",
    };
    case "friend-request": return {
      subject: `${input.fromUsername} wil vrienden worden`, preheader: "Een bekende naam maakt de volgende dartavond nog leuker.",
      eyebrow: "VRIENDSCHAPSVERZOEK", heading: "Samen is het leuker.",
      paragraphs: [`Hoi ${input.username}, ${input.fromUsername} heeft je een vriendschapsverzoek gestuurd. Bekijk het verzoek in DartsPoint en bepaal zelf of je het accepteert.`],
      details: [["Van", input.fromUsername]], action: { label: "Bekijk het verzoek", url: `${lobby}?view=friends` },
      note: "Je bent nog geen vrienden. Je beslist zelf of je het verzoek accepteert of afwijst.", preferencesUrl: `${lobby}?view=profile`,
    };
    case "match-reminder": return {
      subject: "Je wedstrijd komt eraan", preheader: `${input.opponent} · ${input.gameMode} · ${input.startsAtLabel}`,
      eyebrow: "TIJD VOOR JE VOLGENDE LEG", heading: "Je bord staat klaar.",
      paragraphs: [`Hoi ${input.username}, je geplande wedstrijd komt eraan. Open DartsPoint en zorg dat je op tijd klaarstaat.`],
      details: [["Tegenstander", input.opponent], ["Spelvorm", input.gameMode === "301" ? "301 · dubbel in, dubbel uit" : `${input.gameMode} · dubbel uit`], ["Speelmoment", input.startsAtLabel]],
      action: { label: "Bekijk je wedstrijd", url: input.actionUrl ?? lobby }, note: "Kun je niet spelen? Meld dit vóór de start bij de organisatie. Voor een event of divisie gelden de getoonde aanwezigheidsregels.", preferencesUrl: `${lobby}?view=profile`,
    };
    case "tournament-reminder": return {
      subject: `${input.eventName}: ben je erbij?`, preheader: `Inchecken: ${input.checkInLabel}. Je toernooikamer staat klaar.`,
      eyebrow: "EEN AVOND OM VOOR TE SPELEN", heading: "Dit is jouw moment.",
      paragraphs: [`Hoi ${input.username}, je staat ingeschreven voor ${input.eventName}. Controleer je speelmoment en check op tijd in.`],
      details: [["Toernooi", input.eventName], ["Start", input.startsAtLabel], ["Inchecken", input.checkInLabel], ["Kamer", input.roomName]],
      action: { label: "Naar het toernooi", url: input.actionUrl ?? lobby }, note: "Alleen ingeschreven spelers doen mee. Toeschouwers zijn welkom. Het actuele programma en de aanwezigheidsregels staan op de toernooipagina.", preferencesUrl: `${lobby}?view=profile`,
    };
    case "moderation": return {
      subject: "Een bericht over je DartsPoint-account", preheader: "Bekijk de toelichting en je mogelijkheden om te reageren.",
      eyebrow: "SAMEN HOUDEN WE HET SPORTIEF", heading: "Even belangrijk.",
      paragraphs: [`Hoi ${input.username}, onze moderatoren hebben een maatregel vastgelegd voor je account. Hieronder lees je de toelichting.`, input.reason],
      details: [["Maatregel", input.action], ...(input.durationLabel ? [["Duur", input.durationLabel] as [string, string]] : []), ["Referentie", input.caseId]],
      action: { label: "Bekijk de toelichting", url: input.actionUrl ?? `${lobby}?view=profile` },
      note: "Ben je het niet eens met de maatregel? Gebruik de contact- of bezwaaroptie bij de toelichting in je account. Onze medewerkers vragen nooit om je inlogcode.",
    };
    case "announcement": return {
      subject: input.heading, preheader: "Nieuws van DartsPoint. Jouw kamer. Jouw wedstrijd. Jouw avond.",
      eyebrow: "NIEUWS UIT DE CLUB", heading: input.heading, paragraphs: input.message.split(/\n\s*\n/).filter(Boolean),
      action: { label: input.actionLabel, url: input.actionUrl }, preferencesUrl: input.preferencesUrl,
      note: "Je ontvangt dit bericht omdat je DartsPoint-nieuws hebt ingeschakeld. Je kunt je e-mailvoorkeuren op elk moment aanpassen.",
    };
  }
}

function wrapEmail(content: EmailContent, mode: DartsEmailMode = "production", origin = DARTS_EMAIL_ORIGIN): DartsEmailResult {
  const e = escapeEmailHtml;
  const subject = subjectText(content.subject);
  const preheader = subjectText(content.preheader);
  const asset = mode === "preview" ? "/assets/emails/dartspoint-logo.png" : `${origin}/assets/emails/dartspoint-logo.png`;
  const actionUrl = content.action ? safeDartsEmailUrl(content.action.url) : undefined;
  const preferencesUrl = content.preferencesUrl ? safeDartsEmailUrl(content.preferencesUrl) : undefined;
  const paragraphHtml = content.paragraphs.map(p => `<p style="margin:0 0 18px;color:#c2d0c7;font-size:16px;line-height:26px;">${e(p)}</p>`).join("\n");
  const detailHtml = content.details?.map(([key, value]) => `<tr><td width="36%" valign="top" style="padding:12px 14px;border-bottom:1px solid #30443a;color:#9eb5a7;font-size:13px;line-height:22px;">${e(key)}</td><td valign="top" style="padding:12px 14px;border-bottom:1px solid #30443a;color:#f4eee2;font-size:14px;font-weight:700;line-height:22px;word-break:break-word;">${e(value)}</td></tr>`).join("\n");
  const cta = content.action && actionUrl ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 12px;"><tr><td bgcolor="#e94f48" style="border-radius:8px;text-align:center;mso-padding-alt:16px 24px;"><a href="${e(actionUrl)}" style="display:inline-block;padding:16px 24px;border:1px solid #e94f48;border-radius:8px;color:#ffffff;text-decoration:none;font-size:15px;line-height:20px;font-weight:700;mso-padding-alt:0;">${e(content.action.label)} &#8599;</a></td></tr></table><p style="margin:0 0 25px;color:#91a89a;font-size:11px;line-height:18px;word-break:break-all;">Werkt de knop niet? Open ${e(actionUrl)}</p>` : "";
  const code = content.code ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:27px 0 25px;"><tr><td align="center" bgcolor="#f1e8c0" style="padding:25px 8px 23px;border-radius:12px;border:1px solid #e4dbaa;"><p style="margin:0 0 9px;color:#46654e;font-size:10px;letter-spacing:2px;font-weight:700;">JOUW EENMALIGE INLOGCODE</p><p style="margin:0;color:#14261b;font-family:Consolas,'Courier New',monospace;font-size:40px;line-height:52px;font-weight:700;letter-spacing:7px;white-space:nowrap;">${e(content.code)}</p><p style="margin:8px 0 0;color:#46654e;font-size:12px;">10 minuten geldig &nbsp;&#183;&nbsp; één keer te gebruiken</p></td></tr></table>` : "";
  const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;width:100%;background-color:#e9ece6;color:#f4eee2;font-family:Manrope,Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;color:#e9ece6;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${e(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#e9ece6"><tr><td align="center" style="padding:28px 12px 36px;">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#11251a" style="max-width:600px;background-color:#11251a;border:1px solid #294134;border-radius:16px;overflow:hidden;">
<tr><td height="5" bgcolor="#dc514b" style="height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:30px 28px 26px;border-bottom:1px solid #294134;"><img src="${e(asset)}" width="234" height="49" alt="DartsPoint" style="display:block;border:0;width:234px;max-width:100%;height:auto;color:#f4eee2;font-size:24px;font-weight:bold;"></td></tr>
<tr><td style="padding:34px 28px 30px;">
<p style="margin:0 0 16px;color:#89cba5;font-size:10px;line-height:18px;font-weight:700;letter-spacing:2px;">${e(content.eyebrow)}</p>
<h1 style="margin:0 0 22px;color:#f4eee2;font-size:32px;line-height:39px;font-weight:700;letter-spacing:-1px;overflow-wrap:anywhere;">${e(content.heading)}</h1>
${paragraphHtml}${code}
${detailHtml ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#1b3224" style="margin:25px 0 0;background-color:#1b3224;border:1px solid #30443a;border-radius:8px;">${detailHtml}</table>` : ""}
${cta}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding-top:24px;border-top:1px solid #294134;color:#9db3a5;font-size:12px;line-height:20px;">${e(content.note)}</td></tr></table>
</td></tr>
<tr><td bgcolor="#0c1d14" style="padding:24px 28px;background-color:#0c1d14;border-top:1px solid #294134;"><p style="margin:0 0 7px;color:#ecede1;font-size:13px;font-weight:700;line-height:21px;">Jouw kamer. Jouw wedstrijd. Jouw avond.</p><p style="margin:0;color:#95aa9d;font-size:11px;line-height:20px;">DartsPoint &nbsp;&#183;&nbsp; Online darts, samen.<br><a href="${e(origin)}" style="color:#bad8c5;text-decoration:underline;">${e(new URL(origin).hostname)}</a>${preferencesUrl ? ` &nbsp;&#183;&nbsp; <a href="${e(preferencesUrl)}" style="color:#bad8c5;text-decoration:underline;">E-mailvoorkeuren</a>` : ""}</p></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="max-width:520px;margin:19px auto 0;color:#53665a;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:18px;">${content.code ? "Veilig inloggen zonder wachtwoord. Bewaar je inlogcode voor jezelf." : "Een bericht van DartsPoint. Speel samen, speel sportief."}</p>
</td></tr></table></body></html>`;
  const text = [subject, "", ...content.paragraphs.flatMap(p => [p, ""]), ...(content.code ? [`INLOGCODE: ${content.code}`, "10 minuten geldig · één keer te gebruiken", ""] : []), ...(content.details?.map(([key, value]) => `${key}: ${value}`) ?? []), "", ...(content.action && actionUrl ? [`${content.action.label}: ${actionUrl}`, ""] : []), content.note, "", "Jouw kamer. Jouw wedstrijd. Jouw avond.", `DartsPoint · ${origin}`, ...(preferencesUrl ? [`E-mailvoorkeuren: ${preferencesUrl}`] : [])].join("\n");
  return { subject, preheader, html, text };
}

export function renderDartsEmail(input: DartsEmailInput, options: DartsEmailOptions = {}): DartsEmailResult {
  const origin = options.origin ?? DARTS_EMAIL_ORIGIN;
  if (!APPROVED_EMAIL_ORIGINS.has(origin)) throw new Error("Email origin must be an approved, exact origin.");
  return wrapEmail(contentFor(input, origin), options.mode, origin);
}

export function renderDartsOtpEmail({ code, expiresMinutes = DARTS_EMAIL_OTP_MINUTES, mode = "production" }: { code: string; expiresMinutes?: typeof DARTS_EMAIL_OTP_MINUTES; mode?: DartsEmailMode }): DartsEmailResult {
  return renderDartsEmail({ type: "otp", code, expiresMinutes }, { mode });
}

/** Generate the copyable Supabase Auth template. Runtime OTP validation stays strict. */
export function renderSupabaseOtpTemplate(options: { origin?: string } = {}): DartsEmailResult {
  const result = renderDartsEmail({ type: "otp", code: "000000" }, options);
  return { ...result, html: result.html.replaceAll("000000", "{{ .Token }}"), text: result.text.replaceAll("000000", "{{ .Token }}") };
}

export const DARTS_EMAIL_EXAMPLES: { id: DartsEmailInput["type"]; title: string; description: string; input: DartsEmailInput }[] = [
  { id: "otp", title: "Inlogcode", description: "Eén code. Tien minuten. Meteen herkenbaar.", input: { type: "otp", code: "482913" } },
  { id: "welcome", title: "Welkom", description: "Een warm welkom nadat je jouw spelersnaam kiest.", input: { type: "welcome", username: "Nick" } },
  { id: "friend-request", title: "Vriendschap", description: "Die uitnodiging voor nog één gezellige dartavond.", input: { type: "friend-request", username: "Nick", fromUsername: "Mila" } },
  { id: "match-reminder", title: "Wedstrijd", description: "De juiste informatie, ruim voor de eerste worp.", input: { type: "match-reminder", username: "Nick", opponent: "Bullseye", gameMode: "501", startsAtLabel: "Vrijdag · 20:00 uur (Europe/Amsterdam, voorbeeld)" } },
  { id: "tournament-reminder", title: "Toernooi", description: "Kamer, incheckmoment en starttijd bij elkaar.", input: { type: "tournament-reminder", username: "Nick", eventName: "Afterhours Open", startsAtLabel: "Vrijdag · 20:00 uur (Europe/Amsterdam, voorbeeld)", roomName: "Afterhours Open · toernooikamer", checkInLabel: "19:30 – 19:55 uur (voorbeeld)", actionUrl: "https://dartspoint.nl/toernooi/cup-afterhours-open" } },
  { id: "moderation", title: "Moderatie", description: "Rustig, duidelijk en met ruimte voor een reactie.", input: { type: "moderation", username: "Nick", action: "Waarschuwing (voorbeeld)", reason: "Een bericht in de kamerchat voldeed niet aan onze afspraak om respectvol met andere spelers om te gaan. Houd gesprekken sportief, ook na een spannende wedstrijd.", caseId: "DP-VOORBEELD-001" } },
  { id: "announcement", title: "Clubnieuws", description: "Dezelfde stijl voor het nieuws dat je wilt ontvangen.", input: { type: "announcement", heading: "Een nieuwe avond. Een nieuwe kans.", message: "De volgende Afterhours Open komt eraan. Een vertrouwde kamer, nieuwe tegenstanders en die ene beslissende dubbel.\n\nBekijk het event voor het actuele programma en de inschrijving. We zien je aan het bord.", actionLabel: "Ontdek de toernooien", actionUrl: "https://dartspoint.nl/#toernooien", preferencesUrl: "https://dartspoint.nl/lobby?view=profile" } },
];
