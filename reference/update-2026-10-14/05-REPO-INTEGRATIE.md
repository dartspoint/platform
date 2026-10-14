# 05 — Integratie met de bestaande DartsPoint-repository

Dit document beschrijft waar de grafische wijzigingen aansluiten op de bestaande applicatie. Het is een broncodevergelijking en implementatieadvies, geen bewijs dat wijzigingen al live zijn. Er is voor deze analyse niets aan de productierepository, database of hosting gewijzigd.

## Vaste uitgangspunten

| Bron | Onderzochte versie |
| --- | --- |
| Productierepository | `dartspoint/platform`, commit `5817bd4ba4721195565b2cb87089ab6e1efcf545` |
| Grafisch prototype | Sites-source, commit `6d473a3de23835494e238b6428cd3d5c15f240dd` |
| Repository-inventaris | Recursieve Git-tree van bovenstaande platformcommit: 1.143 entries, `truncated: false` |
| Platformaanwijzingen | `README.md`, `package.json`, `apps/web/package.json` en `apps/web/AGENTS.md` op dezelfde platformcommit |

Start implementatie met een actuele checkout en vergelijk die opnieuw met deze pin. De genoemde platformcommit is de onderzochte broncode; de actieve release op staging/productie is hier niet vastgesteld.

`apps/web/AGENTS.md` verplicht om vóór codewijzigingen de relevante Next.js-handleidingen uit de geïnstalleerde `node_modules/next/dist/docs/` te lezen. Het verwijst daarnaast naar `docs/CHANGESET-2026-10-13-KAMER-CHAT-MODERATIE-INDICATOR.md` en de eerdere landing/mobile-changeset. Het noemt het ontwerp expliciet een visuele bron en verlangt behoud van echte Auth, persistence en serverautoriteit.

## Architectuur waarop moet worden aangesloten

| Onderdeel | Bestaande implementatie | Betekenis voor deze opdracht |
| --- | --- | --- |
| Webapp | Native Next.js 16.3.8 / React 19.2.6 in `apps/web`; Node 24.18.x, npm-lockfile | Neem gerichte componenten, CSS en assets over. Neem de Sites/Vinext-build, packageconfiguratie of hostingconfiguratie niet over. |
| Webgegevens en acties | `apps/web/lib/platform-client.tsx`: `usePlatform`, `api`, `mutate`, `refreshPlatform`; `/api/platform/[...path]` als dispatcher | Sluit de nieuwe UI aan op deze bestaande adapters. `mutate` ververst de serverprojectie na een geslaagde actie. |
| Identiteit en toegang | `currentActor` → `verifyToken` → actuele account-/rol-/sessiecontroles in `packages/data/src/auth.ts` | Behoud echte sessies en UUID-identiteiten. Een naam, lokale rol of verborgen knop geeft geen schrijfrecht. |
| Paginatoegang | `components/darts-demo-gate.tsx` is ondanks zijn naam een servercomponent met echte Auth en `PlatformProvider` | Niet vervangen door de gelijknamige sessionStorage-demogate uit het prototype. `/beheer` gebruikt de bestaande `staff`-gate. |
| Live wedstrijden | `apps/realtime/src/server.ts` + `apps/web/lib/use-server-game.ts` + `packages/data/src/matches.ts` | Behoud de actuele socket, snapshots, commando-ID's, stateversies, fase-tokens, ontvangstregistratie en serverberekende worpen. |
| Duurzame opslag | PostgreSQL via `packages/data/src/*`, worker, audit/outbox en gecontroleerde migraties | LocalStorage-writes uit het prototype zijn voorbeelden van interacties, geen productieopslag. |

De hoofdroute `/lobby` is het kameroverzicht. De linkerhelft **binnen een kamer** zit op `/spelen` in `components/darts-app.tsx`. Daar rendert een actieve partij `GamePanel`; zonder partij gebruikt desktop nu `RoomCommunity` uit `components/darts-workspace.tsx`. Op mobiel staat daar momenteel de kamerchat. De rechter desktophelft is de gedeelde `DesktopCommunity` met spelers, vrienden en chat.

Sluit het nieuwe `RoomLobbyFeed` aan op deze bestaande keuze tussen kamerinhoud en actieve partij. Het prototype gebruikt hiervoor andere lokale flags; neem die selectie- en sessielogica niet blind over. Houd de productiecontext `roomId`, geautoriseerde wedstrijdselectie en chatcontext intact.

Er is een expliciet bronverschil in desktopindeling: productie gebruikt een desktopgrens van **1024 px** en in de rechterbovenhelft **1fr/1fr** voor spelers en vrienden. Het prototype gebruikt **1100 px** en **1.55fr/1fr**. Behoud het huidige productiecontract; de mobiele 90/60-instructie uit de UI-specificatie geeft geen opdracht om desktop te herschikken. De meegeleverde prototypesource blijft als ontwerpbron ongewijzigd: los deze afwijking bewust op bij integratie, niet door de referentie achteraf te herschrijven.

## Wat al in de platformbroncode staat

De eerdere lijst met tien UI/UX-aanpassingen is grotendeels al geïmplementeerd in de onderzochte platformcommit. Voorkom dat het overnemen van het prototype deze recentere implementaties terugdraait.

| Onderwerp | Bewijs in platformcommit `5817bd4` | Integratiebesluit |
| --- | --- | --- |
| Vooringestelde chatteksten | `components/darts-community.tsx`: `presetsOpen`, `MessageCircle`, `chat-presets-menu`, direct naast de emoji-bediening | Bestaande productieknop/popover behouden; uitsluitend visuele verschillen bijwerken. |
| Compacte headers | `components/darts-desktop.css`: room-toolbar en friends-heading hebben 46 px minimumhoogte; zoekvelden hebben eigen padding/marges | Basis bestaat. Controleer de uiteindelijke cascade op korte schermen: er staat ook een regel met 53 px. Visuele vergelijking blijft nodig. |
| Autoscroll | `ChatPanel`: `atBottom`, `newBelow`, `showLatest`, `ResizeObserver`, bewaarde scrollpositie en `quietPinHold` | Behoud dit uitgebreidere gedrag, inclusief teruglezen en stiltemodus. Geen eenvoudige onvoorwaardelijke scroll-effecten uit de demo invoeren. |
| Indicator na laatste dart | `use-server-game.ts`: `movingView`, `wake`, `cancelFrame`, `renderControl`, controle op eigen seat/turn/lifecycle | De productieguard is uitgebreider dan de lokale prototypeguard. Deze laten staan. |
| Iets snellere indicator | `packages/game-core/src/timing.ts`: `METER_SPEED_VERSION='faster-v2'`, horizontaal 2037 ms en verticaal 2315 ms; oudere marker behoudt 2200/2500 ms | Geen nieuwe snelheid of timingsysteem introduceren. Bestaande partijen en oefensessies behouden hun opgeslagen versie. |
| Twee waarschuwingen, derde verlies | `packages/game-core/src/turn-timeout.ts`: `observeTurnTimeout`/`acceptedTurnStop`; `packages/data/src/lifecycle.ts` verwerkt waarschuwing en verlies; `use-server-game` projecteert de waarschuwing | Alleen presentatie aanpassen indien nodig. Geen extra clienttimer laten forfeiten. Productie gebruikt standaard 30 s of de competitie-instelling. Een geldige stop wist de strikes. |
| Vijf minuten inactiviteit | `packages/data/src/community.ts`: `last_activity_at`, `markRoomActivity`, `heartbeat`, `expireRoomMemberships`; `platform-client` onderscheidt echt invoergedrag van stil heartbeatverkeer | Bestaande serververwijdering en activiteitregistratie behouden. Geen tweede clientredirect of timer toevoegen vanuit het prototype. |
| Normaal gamenummer | `matches.game_number`, `publicGameId`/`gameNumber` in projecties, `lib/public-game-label.ts` | Publiek nummer tonen; UUID blijft API-/socket-/modelidentiteit. Geen lokale teller of afgeleide hash als productie-ID gebruiken. |
| Meekijken én spelkamerchat | `DartsApp/SpectatorView` vraagt `match/spectate`; `SpectatorGame` gebruikt een aparte alleen-lezen gamehook; bestaande `ChatPanel` ontvangt de toegelaten room/matchcontext | Bestaande admission, block-/roomcontroles en serverchat hergebruiken. Geen gesimuleerde score-intervallen overnemen. |
| Code aanvragen na CAPTCHA | `darts-login.tsx`: `captchaReady`, `requestBusy`, disabled aanvraag/herzendknop; `turnstile.tsx`; API controleert token vóór resend-lock | Productieflow is aanwezig. Prototype-CAPTCHA en lokale OTP-simulatie niet importeren. |
| Tijdelijke binnenkomstmelding | `ChatPanel`: `joinNotice`, `seenJoins`, 2000 ms timer, vervanging bij nieuw event; serverevent `room.member_joined` | Bestaande realtime-eventverwerking behouden. De 2-secondenpresentatie staat al boven de composer. |

Deze tabel toont broncodeaanwezigheid. Voor de genoemde productieflows is in deze handoffsessie geen browser- of integratietest uitgevoerd.

## Nieuwe onderdelen ten opzichte van die broncode

In de volledige onderzochte platform-tree ontbreken `darts-room-feed`, `darts-lobby-content`, `darts-hero-image`, `darts-hero-background` en `darts-hero-editor`. De bestaande `RoomCommunity` toont wel echte aankondigingen en gepubliceerde toernooien, maar heeft nog geen beheerd widgetgrid of redactieworkflow.

| Prototypebron | Aansluitpunt in productie | Wat werkelijk nieuw is |
| --- | --- | --- |
| `components/darts-room-feed.tsx/.css` | `apps/web/components/darts-workspace.tsx` / kamerbranch van `darts-app.tsx` | Het grid, widgetpresentatie, filters en lege toestanden in de linker kamerhelft. |
| `components/admin/darts-lobby-content.tsx/.css` | Bestaande `DartsAdmin`-navigatie en tabrouter | Beheer van widgets/artikelen, concept, preview, publiceren en kamerdoelgroep. |
| `lib/darts-lobby-content.ts` | Nieuwe serveradapter naast bestaande platformadapters | Duurzame content, afzonderlijke concept-/publicatieprojecties, revisies en audit. De lokale store is geen servercontract. |
| `components/admin/darts-hero-editor.tsx/.css` en `lib/darts-hero-image.ts` | Bestaande toernooi-editor, servertoernooimodel en nieuwe mediakoppeling | Afbeelding kiezen, positie/overlay, bewaren en opnieuw laden. |
| `components/darts-hero-background.tsx` | Toernooikaart in het grid en relevante bestaande toernooiweergaven | Presentatielaag voor opgeslagen hero-instellingen. |
| `Tournament.hero` en widget `tournamentImageMode`/`heroImage` | `packages/game-core/src/darts-tournament-model.ts`, `packages/data/src/competitions.ts`, projecties en frontendtypes | Het servergevalideerde onderscheid tussen toernooiafbeelding overnemen, eigen widgetafbeelding en geen afbeelding. |

Het prototype bevat fictieve communitymomenten, applausaantallen en pollstemmen. Die mogen niet als echte activiteit worden gezaaid. Gebruik voor bestaande spelers, toernooien, bezetting, divisies en prestaties de serverprojectie; gebruik voor nog niet aangesloten gegevens een eerlijk leeg of redactioneel ingevuld scherm. De andere handoffdocumenten specificeren de gewenste UI en contentstructuur.

## Bestaande beheerrechten en opslag hergebruiken

`/beheer` laat via `DemoGate staff` zowel owner als admin toe. De afzonderlijke serveracties bepalen wat die rollen mogen doen:

| Actie | Bestaande route/adapter | Bestaande toestemming en opslag |
| --- | --- | --- |
| Platforminstellingen | `updateAdminSettings` → `mutate('settings', {patch, reason})` → `saveSettings` | **Owner-only** via `staff(actor,true)`. Transactie, `private.system_settings`, rowlock, versie ophogen en `settings.save`-audit. |
| Kamers, rollen, cases | `mutate('admin', …)` → `adminAction` | Owner/admin aan de servergrens; rolwijzigingen zijn owner-only. Bestaande context- en actieve-wedstrijdchecks blijven gelden. |
| Toernooien beheren | `darts-tournament-store.ts` → `mutate('tournament', {action,args})` → `tournamentAction` | Beheeracties owner/admin. `tournaments.model`, entry-/node-/boardtabellen, versie en audit worden transactioneel bijgewerkt. Zelfserviceacties hebben aparte controle. |
| Aankondiging tonen | `bootstrap(actor).settings.platform` → `useAdminSettings` | Bestaande `announcement`/`announcementActive` al beschikbaar voor de kamer. Hergebruiken voor de widgetbron “platformbericht”. |

Aanbevolen aansluiting, nog te implementeren:

1. Gebruik dezelfde server-Actor, `staff`-controle, transacties en audithelpers voor lobbyredactie. Neem owner-only als aansluiting bij platforminstellingen; verruim dit niet impliciet omdat een admin de beheerpagina kan openen.
2. Maak concept en gepubliceerde lobbyinhoud apart opvraagbaar. `bootstrap` retourneert de huidige `settings` ook voor gewone spelers. Stop daar dus niet zonder filtering het volledige nieuwe concept in. Alleen de gepubliceerde, voor de kamer toegestane projectie hoort bij spelers terecht te komen.
3. Een bestaande `settings`-patch kan niet zomaar nieuwe velden opnemen: `saveSettings` weigert onbekende secties en velden. Breid het servercontract bewust uit of voeg een specifieke contentactie toe. Beide zijn nieuwe implementatie, geen reeds aanwezige API.
4. Gebruik voor de nieuwe publicatieflow een gecontroleerde revisie/conflictafhandeling en audit bij opslaan/publiceren. De precieze contracten staan in de content-/beheerspecificatie. Behoud bij fouten het concept en de laatst gepubliceerde versie.
5. Breid voor de toernooihero zowel `createTournament` als `updateTournament` en de gedeelde types/validatie uit. De huidige strikte Zod-input accepteert `name`, `description`, `published` en `settings`; `hero` wordt nu geweigerd. Plaats afbeeldingspresentatie niet onder spelregels: een gewone hero-wijziging mag bracket, score, lopende partij of competitie-instellingen niet resetten.
6. Laat bestaande `mutate`/refresh-patronen succesvolle serveropslag terugkoppelen. De melding “Platformvoorkeuren opgeslagen op dit apparaat” staat nog in de productie-UI, terwijl deze adapter al serveropslag gebruikt; pas deze tekst aan bij het raken van dat scherm.

## Afbeeldingen en requestgrenzen

Het prototype verkleint uploads in de browser en bewaart data-URL's tot 300.000 tekens. De prototype-lobbystore accepteert maximaal 2.000.000 tekens opgeslagen JSON. De productieplatformroute weigert daarentegen een JSON-request waarvan `raw.length > 16384`.

Neem deze lokale payloads daarom niet over in `settings` of `tournament`-requests en verhoog niet klakkeloos de globale limiet. In de onderzochte platformdispatcher en tree is geen reeds uitgewerkte hero/media-uploadroute aangetroffen. Kies een afzonderlijke geautoriseerde uploadstap die een duurzame assetreferentie oplevert; bewaar daarna alleen die referentie plus positie/overlay in content. Koppel rechten, bronvalidatie en levensduur aan die stap. Assets die als vaste ontwerpbestanden meekomen kunnen in de bestaande web-publicstructuur blijven.

Dit is een ontbrekend productieonderdeel, geen aanwijzing om zonder onderzoek een nieuwe opslagprovider te installeren. De huidige geconfigureerde uploadvoorzieningen buiten deze repository zijn niet onderzocht.

## Grenzen rond spel, timing en Auth

De actuele productiecode bevat `render-sample-v3`, meetvensters en compensatiegrenzen, versiegebonden indicatorsnelheid, oorspronkelijke commandontvangst en serverbevestiging. `use-server-game.ts` gebruikt daadwerkelijk getekende samples via `drawn-meter.ts`. `apps/realtime/src/server.ts` registreert ontvangst vóór verdere verwerking; `matches.ts` valideert fase, versie, command en timing. De prototypegame gebruikt een lokale reducer en bewegende motion-values. Dat is geen vervanging voor de productiegamehook.

Wijzig voor deze grafische opdracht geen geometrie, scoreberekening, scoringregels, vlucht-/impactmoment, compensatieformule, Elo, commandqueue of Auth-protocol. Laat ook browserinteracties met popovers, formuliercontrols en overlays buiten de globale dart-STOP-handler vallen. Een contentpublicatie of UI-rerender mag geen nieuwe socket, nieuwe game-ID of reset van een lopende wedstrijd veroorzaken.

Er is geen nieuwe database of Supabase-configuratie nodig voor de grafische shell alleen. Nieuwe duurzame content/media vereisen wel expliciete servercontracten en eventueel expand-only migraties binnen het bestaande proces. Geen demoaccounts, fake vrienden, fictieve wedstrijden, browserrollen of plaintext sessietokens toevoegen.

## Wat implementatie nog moet verifiëren

- De actuele branch kan verder zijn dan `5817bd4`; vergelijk vóór werk met de hierboven genoemde bestanden en de bestaande changesets.
- Controleer de nieuwe linkerkolom op desktop en mobiel zonder de bestaande keuze tussen kamer, chat, oefenruimte en actieve wedstrijd te breken.
- Verifieer de rechtenmatrix op de server: speler, kamerbeheerder, admin en owner. UI-verbergen alleen is geen autorisatie.
- Controleer dat ongepubliceerde artikelen, conceptafbeeldingen en inhoud voor andere/ontoegankelijke kamers niet in de spelersprojectie verschijnen.
- Verifieer serverpersistente hero-/contentupdates na reload en in een tweede sessie; een werkende lokale preview bewijst dit niet.
- Controleer bestaande chat-/spectator-/Auth- en timingtests op regressies. De QA-handoff bevat de concrete acceptatiegevallen; deze analyse claimt geen nieuwe testresultaten.

De repository heeft `npm run verify:ci` en bestaande integratiesuites. De README verlangt dat acceptatiesuites sequentieel draaien. `main` voert CI uit maar deployt niet automatisch. De gedocumenteerde deployroute is een merge naar beschermde `staging` of `production`, met de bijbehorende GitHub Environment en exact dezelfde commit/images. Een push naar `main` is dus geen live-deployment.

## Geverifieerde bronlinks

Alle links zijn vastgezet op dezelfde onderzochte commit:

- [README en architectuur/deploycontract](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/README.md)
- [AGENTS-aanwijzingen](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/apps/web/AGENTS.md)
- [Platform-API-dispatcher](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/apps/web/app/api/platform/%5B...path%5D/route.ts)
- [Serverrollen en sessiecontrole](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/packages/data/src/auth.ts)
- [Instellingen opslaan](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/packages/data/src/settings.ts) en [huidig instellingenmodel](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/packages/data/src/settings-model.ts)
- [Toernooiacties en opslag](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/packages/data/src/competitions.ts)
- [Bootstrap en publicaties](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/packages/data/src/projections.ts)
- [Bestaande kamer-/desktopworkspace](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/apps/web/components/darts-workspace.tsx)
- [Chatinteractie](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/apps/web/components/darts-community.tsx)
- [Gamehook en samples](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/apps/web/lib/use-server-game.ts) en [timingversies](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/packages/game-core/src/timing.ts)
- [Timeoutafhandeling](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/packages/data/src/lifecycle.ts) en [kameractiviteit](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/packages/data/src/community.ts)
- [Migratie voor activiteit en publieke gamenummers](https://github.com/dartspoint/platform/blob/5817bd4ba4721195565b2cb87089ab6e1efcf545/supabase/migrations/20261013231951_room_activity_and_match_numbers.sql)
