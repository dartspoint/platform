# Kamer, chat, moderatie en getekende timing — 13 oktober 2026

Dit is de samenhangende aanvulling op de eerdere landing/mobile-release. De
geautoriseerde bronopdrachten zijn `DartsPoint-Codex-Aanvulling-Kamer-Chat-Moderatie.txt`
en `DartsPoint-Indicator-Analyse-en-Codex-opdracht.txt`. Startpunt is main
`72b25c91664dbe01475ea4d6f85f822237c116c7`; de voorafgaande actieve stagingrelease
is `4a23cf6f4f3b1ea4861556702d9b276ee8b00031`.

## Gedrag en implementatie

Vanaf 1024 CSS-pixels delen overzicht, partij en oefenen dezelfde werkruimte.
Links staat de inhoud op 50% breedte; rechts blijven kamerleden/vrienden boven
en één chat onder, met gelijke helften en interne scroll. Zonder lidmaatschap
blijft kamerinformatie leeg; vrienden en eigen DM blijven bereikbaar. Mobiel
behoudt de volledige kamerflow en tijdens een partij de 60%-panelen. Een
chatupdate remount geen spel. `darts-workspace.tsx`, `darts-community.tsx` en
`darts-desktop.css` delen deze indeling.

Een echte kamerbezoeksovergang schrijft samen met het lidmaatschap één duurzaam
`room.member_joined`-event met unieke bezoek-ID. Heartbeat, refresh, retry en
tweede tab schrijven niets extra. Access/capacity worden vóór opslag en push
gecontroleerd. Systeemberichten geven geen unread of geluid. `community.ts` en
de projecties behandelen menselijke en systeemregels expliciet.

De browser maakt vóór een await één optimistic intent met UUID. Dubbel Enter,
Enter plus click, keyrepeat en IME maken geen extra verzoek. Retry behoudt de
UUID; opgeslagen echo en HTTP-antwoord voegen samen op bericht-ID. Een laat
antwoord overschrijft geen nieuw concept. Accountbrede nieuwe-berichtlimieten
zijn transactioneel: standaard 30/minuut, 3/2 seconden en gelijk genormaliseerde
tekst in hetzelfde kanaal niet opnieuw binnen 2 seconden. Endpointmisbruik
heeft een afzonderlijk budget. De owner kan burst/duplicate/slowmode wijzigen.

De browsercontrole vond daarnaast een dubbele providerverificatie per
cookie-aanvraag en een tweede HTTP-aanvraag vóór weergave bij de ontvanger.
De login blijft per aanvraag eenmaal door Auth geverifieerd, met actuele
databasechecks. Redis draagt uitsluitend bericht-ID's; de persoonlijke
realtime-inbox projecteert het opgeslagen bericht na een verse, gezamenlijke
controle van sessie, account, toegang, mute en block. De browser voegt deze
projectie direct samen. Alleen echte history-responses schuiven de ophaalcursor
door; polling/reconnect herstellen daardoor eerdere gemiste berichten en
redactions. Chatregels worden afzonderlijk gememoiseerd en een conceptwijziging
bouwt geen volledige inbox-/beheerprojectie opnieuw op.

Bootstrap voor inbox- en gelezenmetadata wordt samengevoegd: na 500 ms zonder
nieuwe refreshaanleiding volgt één aanvraag; bij voortdurende activiteit is de
wachttijd maximaal 1 seconde vanaf de eerste aanleiding. De 3-secondenpoll wijkt
bij recente chatactiviteit voor deze gezamenlijke refresh. Berichtinhoud wordt
direct uit de persoonlijke realtimeprojectie weergegeven. Expliciete mutaties
en actuele capabilitychecks behouden hun eigen servercontrole.

Alle chattypen, snelle zinnen, onboarding en naamwijzigingen gebruiken het
actuele serverfilter in `content-filter.ts`. NFKC, zero-width, eenvoudige
leetvormen en gestippelde woorden krijgen gecontroleerde normalisatie.
Woord-/phrase-/prefix-/exactregels zijn begrensd; uitzonderingen zoals Essex
blijven mogelijk. Owner beheert categorie, scope, aliassen, uitzondering,
activiteit en reden/version in **Chat & moderatie**, test regels en beoordeelt
bestaande namen. Een verplichte rename bewaart account-ID, vrienden, historie
en DP; publieke projecties gebruiken consequent een tijdelijk label. Er worden
geen accounts of historische worpen verwijderd. Rejected tekst komt niet in
events of operationele logs. Seeds overschrijven latere ownerwijzigingen niet.

Naam en avatar gebruiken hetzelfde menu met echte resource-ID's en verse
servercapabilities. Kamerbevoegdheid wordt geen platform- of DM-bevoegdheid;
ingetrokken bevoegdheid faalt ook bij een al open menu. Maatregelen, intrekken,
filter-/limietwijzigingen en rename hebben leesbare audits met reden/version.
Uitnodigingen controleren afzender én ontvanger bij verzenden, workerbezorging
en acceptatie, ook bij gepauzeerde partijen en gelijktijdige acceptatie.

Nieuwe partijen en oefensessies gebruiken `render-sample-v3`. De inputhandler
bewaart de laatste werkelijk geschreven DOM-sample en bevriest die synchroon,
zonder hersampling. De faseklok blijft vast; drie clientmetingen en drie echte
serverchallenges zijn vereist. Serveringress, UUID, payloadhash, versie,
verbinding en venster worden duurzaam vastgelegd vóór de commandowachtrij.
Een geldige claim gaat exact door de gedeelde golf; buiten het venster volgt
een expliciete afwijzing. De 90 ms netwerkgrens plus afzonderlijk 34 ms
renderleeftijd zijn toegelicht in [het timingcontract](TIMING-RENDER-SAMPLE-V3.md).
V3 tekent en verstuurt hele milliseconden, gelijk aan de resolutie van de
serveringress. De regressie voor een snelle verbinding reproduceert de
vroegere afwijzing van een sample die slechts 0,75 ms na de afgeronde
ontvangsttijd leek te liggen; het toelatingsvenster blijft strikt behouden.
Score, beurt, raakpunt en impact blijven serverbesluiten. Bestaande partijen
behouden hun eerdere timingversie.

## Schema en release

De uitbreidende CLI-migraties bewaren toegepaste checksums en bestaande data:

- `20261013101355_render_sample_timing.sql`: v3-ingressmetadata.
- `20261013101533_chat_visits_filter.sql`: getypeerde bezoeken, filters, limieten en renameflag.
- `20261013102910_filter_name_boundaries.sql`: begrensde samengestelde naamregels zonder owneredits te resetten.
- `20261013104758_chat_redaction_cursor.sql`: afzonderlijke editcursor voor duurzame redaction-catchup.

Nieuwe interne tabellen krijgen expliciete backendgrants/RLS. De bestaande
hosted CI, immutable images en stagingrunner behouden backup/restore, veilige
drain, expand-only migratie, readiness en publieke signup-persistencegate.
Er zijn voor deze sprint geen nieuwe GitHub Environment secrets of variabelen.

## Redirects en beheeractie

De afzonderlijk gevraagde tijdelijke Caddy-redirect is al op de VPS geïnstalleerd:
`dartspoint.nl` en `www.dartspoint.nl` geven 302 naar
`https://binnenkort.dartspoint.nl/`. De landing geeft 200 met geldig TLS.
`ops/redirect-landing.py` bewaart het bestand, wijzigt alleen de twee exacte
hosts, valideert vóór vervanging en reloadt met rollback bij fouten. De
bevestigde private backup is
`/var/backups/dartspoint-caddy-20261013T101723026293Z/Caddyfile`.
De production-app en productiedatabase worden niet gedeployd of gemigreerd.

## Acceptatie en bewijs

| Gebied | Gerichte verificatie | Uitvoering |
|---|---|---|
| Desktop/mobile/één chat | `workspace-chat.ts`, bestaande visual/interface/update-tests | Nieuwe native browseracceptatie geslaagd: 19 checks en 15 chatsamples; bestaande visual/interface/update-regressies ook geslaagd |
| Bezoeken/quota/filter/rechten/invites | `chat-moderation.ts`, bestaande services/update-tests | Echte lokale Auth/PostgreSQL/Redis; doeltests en bestaande services/update-tests geslaagd |
| Ownerbeheer/rename | `chat-moderation-ui.ts` | Geslaagd: 10 checks met echte development-owner en afzonderlijk playerfixture |
| Timingcontract/retry/legacy | unit `render-sample-timing.test.ts`, integration `render-sample-timing.ts` | Unit en echte databasechecks geslaagd |
| Werkelijke DOM/flight/reconnect | `render-sample-timing.ts`, `game-timing.ts` | Lokale native build geslaagd: 16 oefenstops en zes wedstrijdstops, beide assen; staging volgt afzonderlijk |
| Bron/operations | source parity, 39 operationele checks | Geslaagd; oorspronkelijke publieke assets/fonts behouden |
| Stagingidentiteit | `tests/staging/browser-fixture.ts`, `acceptance.ts` | Twee afzonderlijke niet-staff QA-accounts met echte providerverificatie; TLS smoke tegen voorafgaande release geslaagd |

De stagingfixture wordt eenmalig als beheerder op de VPS uitgevoerd: echte
Auth-identiteiten en sessies blijven servergegenereerd; alleen een RSA/AES-GCM
versleutelde overdracht verlaat de VPS. Applicatiecredentials blijven daar.
Sessies, sleutel, private logs en screenshots blijven in genegeerde artifacts
met private rechten. De acceptatierunner verbindt via een tijdelijke lokale
CONNECT-proxy over Tailscale en controleert de exacte actieve release-SHA.
Hij heeft geen publieke loginbypass, productierol of runtimebeheerendpoint.

### Definitieve lokale workspace- en moderatiebrowseracceptatie

`workspace-chat.ts` is geslaagd tegen de gebouwde native web/realtime/worker
met echte lokale Auth, PostgreSQL en Redis. De 19 checks omvatten de vaste
desktopindeling op 1280×720, 1366×768 en 1920×1080 in lobby, kamer, oefenen en
wedstrijd, het breakpoint aan beide zijden van 1024 pixels en één bereikbare
mobiele chat/composer op 320×568 en 390×844. Ook geslaagd: één join per bezoek,
dubbel Enter/klik en IME/repeat, late en verloren ontvangstbevestiging, behouden
concepten, geweigerde tekst, behouden berichtvolgorde bij een oudere historyresponse, beide menutriggers
en focusherstel, gesloten profiel zonder pointerlock, stabiele DM-identiteit bij
hernoemen en hergebruik van de oude naam, herstel na persoonlijke mute,
geautoriseerde realtimeprojecties, tabvolgorde en blijvende selectie,
gezaghebbende bezetstatus, een geweigerde flood zonder bordremount en de echte
spectator-handoff vanuit oefenen. De QA-partij is via een geautoriseerde opgave
beëindigd; er bleef geen actieve spelerreservering achter.

De laatste geslaagde meetreeks bevat 15 berichten tussen twee geauthenticeerde
Chromiumgebruikers, zonder geïnjecteerde netwerkvertraging. De ontvangerspagina
werd tijdens de reeks niet opnieuw gefocust of geladen. DOM-tijden komen uit
daadwerkelijke berichtmutaties; push is onafhankelijk waargenomen via de
persoonlijke Colyseus-inbox.

| Meetpunt vanaf verzenden | p95 | Projectdoel |
|---|---:|---:|
| Eigen optimistic bericht zichtbaar | 10,2 ms | ≤50 ms |
| HTTP-ontvangstbevestiging van het opgeslagen bericht | 237,4 ms | Afzonderlijk gemeten |
| Persoonlijke realtimepush ontvangen | 241,9 ms | Afzonderlijk gemeten |
| Bericht zichtbaar bij geautoriseerde ontvanger | 248,1 ms | ≤250 ms |

De HTTP-waarde meet het ontvangen antwoord na het uitlezen van JSON; dit is
geen afzonderlijk geïnstrumenteerde databasecommittijd. Beide zichtbaarheiddoelen
zijn in deze beschreven lokale omgeving gehaald. Bewijs en ruwe samples staan
in `artifacts/workspace-chat/results.json`, met 13 desktopscreenshots en
`artifacts/workspace-chat/run.log` (exit 0).

`chat-moderation-ui.ts` is eveneens geslaagd (10 checks): regel toevoegen en
testen, uitschakelen zonder herdeploy, echte namenscan en verplichte hernoeming
met behoud van account-ID en DP, consequente publieke alias in reeds gecachte
menselijke en systeemregels, en de veilige huidige naam na de succesvolle
hernoeming. Het echte kamermenu verzendt de juiste target/room/channel/message-ID's
voor een waarschuwing. Live verwijdering overleeft een ouder vastgehouden antwoord;
een daadwerkelijk onderdrukte realtimeverwijdering wordt na reconnect via de
duurzame editcursor hersteld. Een gemodereerde optimistic UUID verdwijnt ook
wanneer alleen sequence 0 bekend is en het HTTP-antwoord nog wordt vastgehouden.
Een gewone speler krijgt 403 op ownerinstellingen. Bewijs staat in
`artifacts/chat-moderation-ui/results.json`, `owner-desktop.png` en `run.log`
(exit 0) in dezelfde artifactmap.

Deze native browsermetingen en mobiele viewportemulatie zijn geen tests op
fysieke telefoons, een geopend iOS/Android-toetsenbord, OS-/browserzoom of echte
60/120/144 Hz-schermen. De lokale regressies zijn geslaagd; acceptatie
van de daadwerkelijk gedeployde stagingrelease is nog open;
hun resultaten en release-SHA worden afzonderlijk toegevoegd.

De lokale timingbrowser meet bij oefenen en wedstrijden maximaal **0 CSS px**
verschuiving bij stoppen en bevestigen. Oefeninvoer heeft p95 **0,5 ms**;
wedstrijdhandlers duren maximaal **0,7 ms** en de eerste frozen frame verschijnt
binnen **21,5 ms** op beide assen. De maximale afwijking van de gelande SVG-pijlpunt
van het serverraakpunt is **0,000012 CSS px**. Vertraagde bevestigingen,
gelijktijdige chat, oude receipts en reconnect zonder extra pijl zijn geslaagd.
De oude volledige wedstrijdfixture is naar echte v3-klokkalibratie bijgewerkt:
27 echte pijlen, dubbel in/uit, spectator, typing guard, impact-only score,
reloadherstel en eenmalige nul-som-Elo slagen. Dit botbewijs staat los van
de echte DOM-metingen; er zijn geen servergrenzen voor de fixture verruimd.

De oorspronkelijke pure timingtest reproduceerde -18,182 CSS-px bij warmup en
60 ms heenweg; een offsetverbetering gaf -95 ms/-19 px. De oude echte native
browser gaf bij twee horizontale stops eerst -1,663/+7,470 px hersampling en
uiteindelijk +36,609/-14,078 px bevestigingsverschuiving. Nieuwe geldige stops
moeten op beide assen en bij impact binnen **1 CSS-pixel** blijven; lokaal
chat/input p95 blijft maximaal 50 ms, normale chatontvangst p95 maximaal 250 ms.
Alle samples en eventuele weigeringen blijven zichtbaar in het meetrapport.

De 12 aanvullende lokale regressies slagen: domain, multiplayer, practice,
visual, auth, interface, update, chat-read, HTTPS-proxy, landing-proxy, drain
en load. De gerichte en brede backendintegraties slagen eveneens, inclusief
filter/rechten/naamprojecties, realtimeprivacy, timing, services, competities,
herstel, owner en mail. De productiebuild, typechecks, 32 units, oorspronkelijke
spelregels, 39 operationele checks en source parity zijn geslaagd. De
updatebrowser behield alle 30 foreground-stops: eerste-frame p95 10,6 ms,
maximum 11,4 ms en freeze/bevestiging 0 px; alle vier Chromiumvertragingen
20/80/180/350 ms accepteerden de exacte sample. CSS-zoom 200% en echte offline
oefening slagen. Grote beheerpagina's worden als echte boven-/midden-/onder-
viewports vastgelegd; de lokale QA-spelerslijst van circa 66.000 px overschrijdt
het praktische volledige screenshotformaat. Alle oorspronkelijke
beheerpagina's behouden navigation/title/overflow- en runtimefoutcontroles.

De vertraagde bevestigingstest houdt via Chromium uitsluitend een reeds
ontvangen response vast. Alle 30 echte responses zijn 100/300/1000 ms
vastgehouden; invoer en klokkalibratie blijven op de native browserverbinding.
Een eerdere testforwarder voegde een ongemeten heenweg toe: de server wees
een 59 ms oude sample terecht af bij een gemeten venster van 54 ms. De
gecorrigeerde test mat maximaal 33 ms leeftijd bij originele serveringress,
zonder verruiming van de spelgrenzen. De touchfixture wacht op drie echte
ping/echo-paren en reset daarna via de gewone bediening.

Implementatie-SHA, CI-runs en actieve staging-SHA worden na deployment
en acceptatie hieronder vastgelegd. Chromiumemulatie,
geïnjecteerde vertraging en viewport/toetsenbordformaat zijn geen fysieke
60/120/144 Hz-, iOS-toetsenbord-, touch- of camerametingen; dergelijke hardware
is niet beschikbaar op deze VPS.
