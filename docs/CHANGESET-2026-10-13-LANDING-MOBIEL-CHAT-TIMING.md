# Wijziging 13 oktober 2026

Opdracht: `reference/update-2026-10-13/START-HIER-CODEX.txt`; vaste visuele bron en SHA-256-manifest in dezelfde map. Deze bron vervangt geen platformbackend. Startpunt main `52e6829`, gezonde stagingrelease `1f1ac93`. Werkmap was schoon. Staging web en realtime geven 200 via Tailscale; de publieke approute geeft 403. Runtime `/srv/dartspoint/staging`; native Caddy en beheerde deploymenthelpers vragen een afzonderlijke beheerderinstallatie. Production wordt niet gedeployd of aangepast.

## Bewijs per eis

| Eis | Bestanden / besluit | Verificatie | Status / beperking |
|---|---|---|---|
| L01 | Exacte ingebedde landingbron, juiste sociale links, bereikbare viewport | Browserbeelden en geometrie op zeven maten, zoom, kort scherm | Lokaal geverifieerd; staginggate volgt |
| L02 | Normale webrelease; aparte expliciete publieke host, beperkte Caddy-routes | Hostrouting en pad-/methodematrix | Host `binnenkort.dartspoint.nl`; A-record resolveert naar 178.105.113.148; rootinstallatie wacht op beheerder |
| L03 | Private PostgreSQL-tabel, beperkte apprechten, Redis, tokenhash-afmelding | Gelijktijdigheid, oorsprong, contract, storing, persistence, restore | Lokaal geverifieerd; staginggate volgt |
| U01 | Mobiele vrienden/berichten zonder game vullen viewport | Browserbeelden, scroll/composer/back | Lokaal geverifieerd; staginggate volgt |
| U02 | Werkelijke kamerjoin vóór chat; oefenen vereist kamer | UI/API, verlopen lidmaatschap, officiële resultaten gelijk | Lokaal geverifieerd; staginggate volgt |
| U03 | Server telt leesbare berichten per uniek kanaal; zichtbare leesstatus | Drie accounts, 3+2+1, eigen/verborgen/gesloten/reconnect | Lokaal geverifieerd; staginggate volgt |
| U04 | DP — DartsPoints (rankingpunten); divisiepunten apart | Zichtbare teksten, exports, mails | Lokaal geverifieerd; staginggate volgt |
| U05 | Gedeeld profiel, 16/24px binnenruimte, rechte hero-onderhoeken | Alle ingangen, 320px, lange namen | Lokaal geverifieerd; staginggate volgt |
| U06 | Meer en servercapability per stabiele kamer/gebruiker | Gewoon/eigen/andere kamer/platform, ingetrokken rechten | Lokaal geverifieerd; staginggate volgt |
| U07 | Eén auditfeed en gedeelde Nederlandse formatter | Unieke ID's, bekende/onbekende/verwijderde onderwerpen, export | Lokaal geverifieerd; staginggate volgt |
| P01 | Synchrone lokale stop; duurzaam ingressmoment; gedeelde timing; begrensde queue | Voor/na traces, input/queue/DB/correctie, vertraagde bevestigingen | Lokaal geverifieerd; fysieke apparaten/120 Hz niet getest |
| A01 | Bestaande CI en gecontroleerde stagingpipeline | Typecheck, tests, build, operations, release-SHA/HTTPS | Lokaal geverifieerd; staginggate volgt |

## Bestanden per eis

Alle paden zijn relatief aan de repositoryroot; de volledige bestandswijzigingen zijn zichtbaar in de implementatiecommits.

| Eis | Belangrijkste implementatiebestanden | Gerichte verificatie |
|---|---|---|
| L01 | `apps/web/public/landing/index.html` | `tests/e2e/update-2026-10-13.ts`, `tests/e2e/interface.ts` |
| L02 | `ops/Caddyfile.landing.template`, `ops/update-host.template.py`, `scripts/build-host-update.py` | `tests/integration/landing-proxy.py` |
| L03 | `packages/data/src/launch.ts`, `apps/web/app/api/launch-signups/route.ts`, `apps/web/app/api/launch-unsubscribe/route.ts`, beide `20261013*`-migraties, `scripts/launch-export.ts` | `tests/integration/update-2026-10-13.ts`, `tests/integration/restore.ts`, `scripts/verify-launch-storage.ts` |
| U01 | `apps/web/components/darts-community.tsx`, `darts-community.css`, `darts-play-shell.css` in dezelfde map | `tests/e2e/update-2026-10-13.ts`, `tests/e2e/interface.ts` |
| U02 | `apps/web/components/darts-app.tsx`, `darts-lobby.tsx`, `darts-practice.tsx` in dezelfde map; `packages/data/src/community.ts`, `practice.ts` in dezelfde map | `tests/integration/update-2026-10-13.ts`, `tests/e2e/practice.ts` |
| U03 | `packages/data/src/projections.ts`, `community.ts` in dezelfde map; `apps/realtime/src/server.ts`, `apps/web/components/chat-badge.tsx`, `apps/web/lib/chat-unread.ts` | `tests/e2e/chat-read.ts`, `tests/integration/update-2026-10-13.ts` |
| U04 | `apps/web/components/player-identity.tsx`, app-/beheercomponenten; `packages/emails/src/templates.ts`, `apps/web/lib/darts-email-templates.ts` | `tests/unit/update-2026-10-13.test.ts`, `tests/integration/mail.ts`, browserbeelden |
| U05 | `apps/web/components/darts-community.tsx`, `darts-community.css` in dezelfde map | `tests/e2e/visual.ts`, `tests/e2e/update-2026-10-13.ts` |
| U06 | `apps/web/components/darts-app.tsx`, `darts-game.tsx` in dezelfde map; `packages/data/src/admin.ts`, `community.ts` in dezelfde map | `tests/integration/update-2026-10-13.ts`, mobiele/desktop Meer-beelden |
| U07 | `packages/game-core/src/audit-presentation.ts`, `packages/data/src/admin.ts`, `apps/web/components/admin/darts-admin.tsx` | `tests/unit/update-2026-10-13.test.ts`, `tests/e2e/visual.ts` |
| P01 | `apps/web/lib/use-server-game.ts`, `use-timing-input.ts` in dezelfde map; `packages/game-core/src/timing.ts`, `packages/data/src/timing.ts`, `matches.ts`, `practice.ts` in dezelfde map; `apps/realtime/src/server.ts` | `tests/e2e/game-timing.ts`, `tests/e2e/update-2026-10-13.ts`, `tests/integration/load.ts`, unit-/retrytests |
| A01 | `.github/workflows/deploy.yml`, `scripts/ci-integration.sh`, `ops/scripts/deploy.py`, `backup-gate.py`, `restore-db.py` in dezelfde map | Bestaande CI, lokale acceptatie- en infrastructuretests; stagingrun volgt na rootinstallatie |

## Woordenlijst

**DP — DartsPoints** zijn rankingpunten. De bestaande ratingformule, plaatsing en historie blijven behouden; interne Elo-veldnamen blijven waar passend. DP zijn geen koopbaar tegoed. **Divisiepunten / competitiepunten** tellen afzonderlijk mee voor het klassement.

## Technische bronnen

Lokale Next.js 16.3.8-documentatie (`node_modules/next/dist/docs/`), [pointerdown](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointerdown_event), [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), [INP](https://web.dev/articles/optimize-inp), Caddy [handle](https://caddyserver.com/docs/caddyfile/directives/handle) en [reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). De projectmeting gebruikt frame-opnamen naast handler-/netwerk-/servermetingen.

## Implementatie en lokaal bewijs

- Frozen update: alle 207 manifestbestanden ongewijzigd onder `reference/update-2026-10-13`; publieke landing in `apps/web/public/landing/index.html`, inclusief oorspronkelijke premiumlogo, fonts en illustraties. Originele prototype-CSS/assets blijven intact met drie expliciet toegestane aanvullende stylesheets.
- Nieuwe expand-only migratie `20261013000100_landing_chat_timing.sql`; lokaal daadwerkelijk toegepast. `private.launch_subscriptions` is alleen voor de approl. Signup is geen Auth-account, login, OTP of mailing. Token wordt alleen gehasht opgeslagen; POST-afmelding is idempotent en GET vraagt bevestiging. Private export-CLI is meegebundeld.
- `artifacts/update-integration-result.json`: drie accounts, 6→4, eigen/gesloten/geblokkeerde/gemute/redacted berichten, cursor bij terugkeer, meerdere kamerbeheerders/revocation, oefenrechten en afwijzing tijdens actieve partij, identieke retry met origineel ingressmoment, 300 ms verwerkingvertraging, gelijktijdige normalisatieduplicaten, echte fout bij ingetrokken INSERT-grant, anon/authenticated denied en ratebudget.
- `artifacts/chat-read-result.json`: daadwerkelijk zichtbaar lezen in de browser, rustige beurt plus eigen later bericht slaan verborgen ontvangen berichten niet over, gesloten DM/concept bewaard, ander kanaal onveranderd en oudere scrollpositie leest nieuwe berichten niet.
- Browserbeelden: `artifacts/update-2026-10-13/before` en `after`; de nieuwe zeven schermgroepen zijn op alle zeven gevraagde maten vastgelegd, plus toetsenbordformaat. Voorbeelden gebruiken afzonderlijke echte QA-accounts; dit is een vergelijking van indeling/gedrag, geen pixelvergelijking met identieke namen. De oude gamebeelden tonen de voorbereidingsfase; bestaande oude multiplayerbeelden geven aanvullend de actieve spelindeling weer.
- `artifacts/update-2026-10-13/before/results.json`: bij 100/300/1000 ms vastgehouden praktijkbevestiging bleef de oude meter bewegen; de 1000 ms casus bevestigde na 1165 ms. `after/results.json` meet lokale handler/rAF, stilstand bij dezelfde vertragingen, serverontvangst/toelating/verwerking, correctie en gesimuleerde RTT 20/80/180/350 ms. Geen fysieke touch- of hoge-refreshclaim. Hoge RTT blijft een gemeten correctie geven door de compensatiegrens van 90 ms.
- `artifacts/game-timing-result.json`: echte Colyseus-game, pointer/Enter, vertraagde receipts/snapshots en deterministische jitter, beide assen vast tijdens vlucht. Een echt verloren stopantwoord met socketverlies herstelt het oorspronkelijke horizontale lock en produceert daarna precies één dart.
- `artifacts/landing-proxy-result.json`: echte tijdelijke Caddy tegenover gebouwde webserver; root/HEAD/query, twee POST-routes en afwijzing van app, admin, auth, assets, interne control, matchmaking en andere methodes/paden.
- Bestaande multiplayer/ranked wedstrijd met ±16 DP, 50 sockets/8 partijen, social/competitions/recovery/owner/drain/mail/auth/practice/visual/interface slaagden. Echte PG17-dump/restore inclusief aanmeldrijen, private toegangscontrole, Node/libpq-TLS en versleutelde Restic-restore/retention slaagden. Unitchecks, typecheck, operations, actionlint en web/realtime/worker-build slagen.

## Deployment en externe stap

De gekozen stagingvariabele `LANDING_ORIGIN=https://binnenkort.dartspoint.nl` staat in GitHub. Geen nieuwe secrets. De bestaande app-origin blijft `https://staging.dartspoint.nl`. De publieke A-record resolveert al naar 178.105.113.148; IPv6 is niet als werkend opgegeven. Native Caddy moet het aparte beperkte hostblok nog krijgen.

`python3 scripts/build-host-update.py` maakt na commit een SHA-256-gebonden beheerderbestand in `artifacts`. Het wijzigt alleen gedeelde root-owned deliveryhelpers en voegt één landinghost toe aan het bestaande Caddybestand. Het bewaart het originele bestand, valideert vóór vervanging, reloadt bestaande Caddy en draait terug bij fouten. Productiecontainers, productiedatabase, sudoers, timers, compose en runtimepermissies worden niet aangepast. De runner mag alleen de vaste app-deployhelper uitvoeren; deze rootinstallatie moet daarom als `danny` via sudo worden gedaan.

Na installatie volgt de bestaande stagingpipeline met alle gates. Nieuw stagingbewijs vereist ook een post-migratie, gereserveerde aanmeldprobe: dubbel aanmelden → webrestart → dezelfde rij → nieuwe offsite Restic-backup en echte restore → probe verwijderen. Resultaat wordt vastgelegd in `launch-evidence.json` en `backup-evidence.json`. Stagingrelease en publieke HTTPS worden pas als voltooid genoteerd na die daadwerkelijke uitvoering.

Lokale laatste meetrun: **30 stops**, handler p95 0.20 ms, eerstvolgende rAF p95 15.60 ms (maximum 16.10 ms), geauthenticeerde berichtnotificatie 107 ms. CSS-posities bleven gedurende de vastgehouden bevestiging gelijk. rAF meet de eerstvolgende framekans; het is geen fysieke camera-/pixelmeting. De drie extra live-gamecases geven dezelfde lokale stop, met 100/300/1000 ms receipt/snapshotvertraging en 0/25/50 ms deterministische ontvangjitter.

De acceptatietest brengt de timingpagina expliciet naar de voorgrond op 390×844 en controleert zichtbaarheid/focus. De 50 ms-framegrens geldt volgens de opdracht voor p95 van alle 30 stops; iedere sample blijft in het rapport en ook het maximum wordt vastgelegd. De test wacht begrensd op de echte eerstvolgende rAF-callback en verwerpt ontbrekende metingen. Er worden geen langzame samples weggegooid of opnieuw geprobeerd. De eerste stagingrun `38356494835` is vóór imagepublicatie/deployment geweigerd door de eerdere, strengere per-sample-frameassertie; de oude gezonde release bleef actief.

Aanvullende expand-only migratie `20261013000200_unsubscribe_links.sql` bewaart eerdere uitgegeven afmeldtokenhashes. Een tweede private export maakt oudere afmeldlinks niet ongeldig. Afmelden verwijdert de aanmelding plus alle bijbehorende hashes; plaintext tokens worden niet in PostgreSQL opgeslagen. De testbot kalibreert nu op de werkelijk toegelaten ingress-tijd, met fallback voor oudere receipts.

`artifacts/native-unsubscribe-result.json` verifieert deze fix tegen de opnieuw gebouwde webserver en de gebundelde worker-export: dubbele signup blijft één rij, twee exports leveren verschillende links, de oudste link verwijdert de rij plus gekoppelde hashes en herhaald afmelden blijft succesvol. Een nieuwe echte dump/restore na beide migraties slaagt. GitHub CI voor implementatiecommit `e8f855e` is volledig geslaagd; aanvullende wijzigingen doorlopen dezelfde bestaande pipeline.
