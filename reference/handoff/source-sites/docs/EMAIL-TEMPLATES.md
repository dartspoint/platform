# DartsPoint — transactionele e-mails

Status: compleet ontwerp- en renderpakket voor de VPS-implementatie. De Sites-versie verstuurt geen e-mails. `/mailvoorbeelden` en de inlogflow tonen alleen lokale voorbeelden. De echte OTP-uitgifte, mailbezorging en verificatie moeten server-side met Supabase Auth en de ingestelde SMTP-provider worden verbonden.

## Bestanden

| Bestand | Doel |
| --- | --- |
| `lib/darts-email-templates.ts` | Eén getypeerde, zuivere renderer voor alle e-mails. Geen netwerkverkeer, geen tokenuitgifte. |
| `components/darts-email-preview.tsx` en `.css` | Voorbeelden met selectie, desktop/mobiel, HTML/tekst en kopieerknop. |
| `app/mailvoorbeelden` | Ontwerppreview, uitgesloten van indexering. |
| `public/assets/emails/dartspoint-logo.png` | Transparant PNG-beeldmerk + woordmerk, 780 × 164 px; uit de bestaande echte SVG-logo's gerasterd. |
| `emails/examples/*` | Zeven statische HTML-voorbeelden en bijbehorende tekstversies; lokaal logo opent zonder externe image-request. |
| `emails/supabase-otp-production.html` en `.txt` | Productietemplate met `{{ .Token }}`. Geen vaste inlogcode. |
| `emails/supabase-otp-staging.html` en `.txt` | Dezelfde template met de staging-origin en staging-logo-URL. |
| `emails/generate.mjs` | Genereert de statische voorbeelden en beide Supabase-templates vanuit dezelfde renderer. |
| `emails/check.mjs` | Gerichte checks voor escaping, links, OTP, plaintext en templatecontract. |

`emails/examples/otp.html` bevat nadrukkelijk een niet-werkende voorbeeldcode. Gebruik **uitsluitend** `supabase-otp-*.html` voor Supabase Auth. Ook de knop “Kopieer HTML” in de voorbeeldenpagina kopieert een ontwerpvoorbeeld; de pagina meldt dit na kopiëren.

## Ontwerp

Afterhours-kleuren: diepgroen `#11251a`, donkerste vlak `#0c1d14`, crème `#f4eee2`, warm codevlak `#f1e8c0` en rood `#e94f48`. Het logo is een PNG omdat kritieke SVG-afbeeldingen in e-mailclients minder betrouwbaar worden weergegeven. De oorspronkelijke vectorbestanden blijven leidend voor de huisstijl.

Het ontwerp gebruikt presentatietabellen, inline-CSS, maximaal 600 px inhoud, echte tekst en duidelijke koppen. Geen scripts, forms, externe webfonts, achtergrondafbeeldingen of interactieve onderdelen. Manrope is de voorkeursletter als die beschikbaar is; Arial/Helvetica/sans-serif vormen de fallback. Het logo heeft een alt-tekst; code, uitleg en actie blijven leesbaar wanneer afbeeldingen niet laden. Afrondingen zijn decoratief en mogen in oudere Outlook-versies terugvallen op rechte hoeken. De mail bevat een verborgen preheader zonder OTP-code.

De OTP-mail heeft geen marketing-CTA of afmeldlink; alleen toegang, vervaltijd en veiligheidsuitleg. De code blijft als aaneengesloten zes cijfers selecteerbaar, ook al gebruikt de vormgeving letterspatiëring. De code hoort niet in het onderwerp, de preheader, een URL, analytics, logs of notificatie-events.

## Beschikbare mails

| Type | Wanneer | Belangrijkste gegevens | Voorkeur |
| --- | --- | --- | --- |
| `otp` | Na geldige inlogaanvraag | Dynamische code, 10 minuten | Essentieel |
| `welcome` | Eenmalig na definitief gekozen spelersnaam | Spelersnaam, voorlopige rating 1500 | Accountbevestiging |
| `friend-request` | Nieuw niet-gededupliceerd verzoek | Alleen afzendernaam, geen privéberichtinhoud | Sociaal; instelbaar |
| `match-reminder` | Geplande officiële wedstrijd | Tegenstander, 301/501/701, tijdzone en start | Herinnering; instelbaar |
| `tournament-reminder` | Inschrijving/incheckmoment | Event, kamer, start, incheckdeadline | Eventherinnering; instelbaar |
| `moderation` | Vastgelegde accountmaatregel | Maatregel, gecontroleerde toelichting, duur, referentie | Essentieel |
| `announcement` | Nieuws waarvoor speler toestemming gaf | Titel, gewone tekst, actie, voorkeuren | Opt-in nieuws |

Toon in een moderatiemail nooit de identiteit van een melder of interne moderatornotities. Verstuur alleen de voor de speler bestemde, gecontroleerde toelichting. Leesbevestigingen/trackingpixels zijn niet toegevoegd.

## API

```ts
import { renderDartsEmail, renderDartsOtpEmail } from "@/lib/darts-email-templates";

// Alleen lokale prototypevoorvertoning; deze code maakt geen echte login mogelijk.
const preview = renderDartsOtpEmail({
  code: localDemoChallenge.code,
  expiresMinutes: 10,
  mode: "preview",
});
// <iframe sandbox="" srcDoc={preview.html} title="Jouw demomail" />

// Toekomstige server-side transactionele verzending, NA gecommit profiel.
const welcome = renderDartsEmail(
  { type: "welcome", username: verifiedProfile.username },
  { origin: process.env.APP_ORIGIN },
);
// Stuur welcome.subject + welcome.html + welcome.text via de server-only mailservice.
```

Alle gebruikerswaarden worden HTML-escaped. Onderwerpregels verwijderen control characters en worden begrensd. De renderer accepteert alleen veilige HTTPS-links op bekende DartsPoint-origins en bekende app-routes. Geen willekeurige HTML-body, externe CTA-origin, URL-credentials, onbekende redirect-endpoints of vrije `next`/`redirect`-parameters. Voeg nieuwe routes alleen bewust toe aan de allowlist en controleer de uiteindelijke bestemming. De `origin` komt uit een gevalideerde serveromgeving en niet uit een Host-header of gebruikersinvoer.

Standaard is de origin `https://dartspoint.nl`; staging gebruikt `https://staging.dartspoint.nl`. `https://dartspoint.app` is alvast toegestaan voor de latere eigen domeinuitbreiding. Bestaande voorbeeldlinks wijzen bewust naar het toekomstige productiedomein. De prototype-preview gebruikt voor het logo een relatieve, eigen image-URL; er is geen externe automatische image-request.

### Routecontract voor productie

De toekomstige app moet deep links ondersteunen en, na inloggen, terugbrengen naar de gevraagde bestemming. De voorbeelden gebruiken `/lobby?view=friends`, `/lobby?view=profile`, `/toernooi/:id` en een publieke homepage-anchor. Het huidige prototype is geen bewijs dat al deze querygestuurde productieroutes geïmplementeerd zijn.

Implementeer in de VPS-versie:

1. Vriendschapsverzoek opent het juiste verzoek in Vrienden; geen automatische acceptatie via GET.
2. Voorkeurenlink opent daadwerkelijke e-mailvoorkeuren, en kan sociale meldingen, wedstrijdherinneringen, eventherinneringen en nieuws onafhankelijk beheren.
3. Nieuws heeft daarnaast een echte afmeldroute met een ondoorzichtige beperkte token en passende `List-Unsubscribe`/`List-Unsubscribe-Post`-headers in de verzendservice. Voeg die route pas met server-side verificatie toe aan de allowlist; de huidige profiel-link is geen one-click-afmelding.
4. Moderatiemelding krijgt een werkelijke dossier/bezwaarbestemming, bereikbaar ook als de speler niet meer mag chatten of spelen. De algemene profielbestemming is een ontwerpfallback, geen afgerond bezwaarsysteem.
5. Een wedstrijdherinnering krijgt de echte wedstrijd-ID en bestemming, met de actuele servergegevens; verouderde mails openen de huidige wedstrijdstatus.

## E-mail + OTP via Supabase Auth

De server vraagt een e-mail-OTP aan via de officiële Supabase Auth-flow. Supabase genereert en verifieert het geheim. Bouw geen eigen OTP-tabel, eigen productiecodegenerator of losse Resend-OTP-implementatie parallel aan Auth. De Sites-demo is strikt een demo-adapter en moet achter een ontwikkel/prototypevlag blijven.

Gekozen productcontract: **6 cijfers, 600 seconden geldig, minimaal 60 seconden tussen opnieuw aanvragen**. Configureer dit expliciet in de gekozen Supabase-projecten. Supabase-standaardwaarden zijn niet het productcontract. De officiële CLI-configuratie beschrijft `auth.email.otp_length = 6`, `otp_expiry = 600` en `max_frequency = "1m"`; controleer de overeenkomstige instellingen in ieder gehost project. Server-side verificatie- en aanvraaglimieten blijven noodzakelijk naast de wachttijd in de UI.

Installeer de HTML als Supabase Auth e-mailtemplate met **`{{ .Token }}`**, geen magic-linkknop met `{{ .ConfirmationURL }}`. Test zowel de eerste aanmelding als bestaande spelers; controleer welke template het gebruikte Auth-project bij “Confirm signup” en “Magic Link/OTP” toepast en houd beide consistent met het gewenste codepad. De applicatie verifieert met de officiële e-mail-OTP-methoden (`verifyOtp` met `type: "email"`). De exacte server/SSR-cookie-integratie staat in het algemene overdrachtspakket.

De losse `.txt` is de canonieke plaintext-tegenhanger. Bij direct verstuurde transactionele mail levert de mailservice beide delen. Bij Supabase SMTP moet de werkelijk ontvangen multipart-mail worden gecontroleerd; de Supabase HTML-editor garandeert niet dat deze losse `.txt` automatisch wordt gebruikt. Pas zo nodig een ondersteunde Auth Send Email Hook toe die het **door Supabase uitgegeven** token gebruikt en beide MIME-delen verstuurt. Bouw nooit om dat alleen op te lossen een eigen OTP-verificatiesysteem.

Eerste echte inlog: pas na geslaagde OTP-verificatie kan een nieuwe speler een unieke spelersnaam kiezen. Stuur de welkomstmail eenmalig ná succesvolle databasecommit van het profiel, via een idempotente outbox-event. Een retriesituatie mag geen extra profielen, ownerrechten of meerdere welkomstmails veroorzaken.

## Bezorging en omgevingen

Aanbevolen productievoorziening: Supabase Auth met **custom SMTP via Resend**, en Resend server-side voor de andere transactionele mails. De standaard Supabase-mailserver is bedoeld voor beperkt testen, niet voor de publieke lancering.

| Onderdeel | Productievoorstel | Staging |
| --- | --- | --- |
| OTP-afzender | `DartsPoint <login@auth.dartspoint.nl>` | Eigen geverifieerd auth-staging-subdomein |
| Meldingenafzender | `DartsPoint <meldingen@notify.dartspoint.nl>` | Eigen staging-meldingenafzender |
| App-origin | `https://dartspoint.nl` | `https://staging.dartspoint.nl` |
| Logobestand | `https://dartspoint.nl/assets/emails/dartspoint-logo.png` | Dezelfde path op staging |
| Supabase | Apart productieproject | Apart stagingproject |

Verifieer domeinen bij de provider, publiceer de opgegeven SPF/DKIM-records, stel DMARC zorgvuldig in en test aflevering. Stel een daadwerkelijk beheerde Reply-To in voordat de echte service live gaat. Verzin geen supportadres dat niet wordt gelezen.

Resend SMTP volgens de officiële documentatie: `smtp.resend.com`, gebruikersnaam `resend`, wachtwoord een server-only Resend API-key, TLS via de ondersteunde poort 465 of 587. De specifieke poort/TLS-keuze moet in de Supabase-configuratie overeenkomen met het gekozen transport. Credentials komen uit de juiste GitHub Environment/provisioning; niet uit de repo, browserbundle, voorbeeldbestanden of buildlogs. De broncode bevat geen SMTP-wachtwoord.

De logo-URL moet extern bereikbaar zijn zonder aanmelding, ook wanneer staging achter reviewbeveiliging staat. Gebruik desnoods een afzonderlijk publiek statisch assetpad voor staging; deel daarbij nooit een stagingtoegangstoken in de image-URL. HTTPS, juiste `image/png` content-type, cacheheaders en stabiele bestandsnaam.

De toekomstige mailservice heeft een outbox/worker, unieke event-/idempotencysleutels, retry/backoff, verzendstatus en bounce/complaint-verwerking. Annuleer herinneringen wanneer de wedstrijd vervalt, iemand zich uitschrijft of het evenement verplaatst. Controleer voorkeuren en blokkeerlijsten bij verzending. Houd essentiële accountmail en optionele berichten gescheiden. Stuur geen bulkmarketing via dezelfde OTP-queue.

## Controle vóór echte verzending

Automatische checks in deze broncode:

```sh
node emails/check.mjs
node emails/generate.mjs
```

Gecontroleerd: 7 templates, codeformaat en vervaltijd, geen code in onderwerp/preheader, escaping van gebruikersnamen en toelichting, headerinjectie, onbekende URL-origins/routes/queries, staging-origin, dynamische Supabase-placeholder, geen scripts/forms/SVG in mail en aanwezigheid van plaintext. Logo visueel gecontroleerd na rasteren. Er is in dit prototype **geen echte bezorgtest of e-mailclientrendering uitgevoerd**.

Voor stagingacceptatie test je minimaal:

- Nieuwe speler en bestaande speler ontvangen dezelfde codeflow; zes cijfers met een voorloopnul blijven werken.
- Code juist, fout, verlopen, herhaald gebruikt en na opnieuw aanvragen; de server bepaalt de geldigheid, de UI toont alleen de actuele toestand.
- Test “opnieuw versturen” zonder code/ontvanger in logs; meet bezorgtijd en geef een neutrale reactie die geen accountbestaan verklapt.
- Ontvangen headers: correcte afzender, SPF/DKIM/DMARC, Reply-To, encoding en geen OTP in onderwerp/preheader.
- HTML en plaintext in Gmail, Outlook en Apple Mail; 320/375/430 px, afbeeldingen geblokkeerd, dark mode, inzoomen en screenreader.
- Eerste profielaanmaak geeft precies één welkomstmail; naamconflict en netwerkretry geven geen duplicaten.
- Voorkeuren en afmelding werken daadwerkelijk; essentiële account- en moderatiemail blijven correct beschikbaar.
- Alle CTA's landen na authenticatie in de juiste omgeving, niet per ongeluk vanuit staging in productie.

## Primaire documentatie

- Supabase e-mail-OTP: https://supabase.com/docs/guides/auth/auth-email-passwordless
- Supabase e-mailtemplates: https://supabase.com/docs/guides/auth/auth-email-templates
- Supabase Auth SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase configuratie: https://supabase.com/docs/guides/local-development/cli/config
- Resend SMTP: https://resend.com/docs/send-with-smtp

Controleer deze documentatie bij implementatie opnieuw voor de gekozen, vastgepinde versies. De previewcode is geen bewijs van geconfigureerde externe diensten.
