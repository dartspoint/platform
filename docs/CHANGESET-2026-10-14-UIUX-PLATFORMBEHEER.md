# 14 oktober 2026 — kamerlobby, platformbeheer en wedstrijdoverzicht

De grafische bron is prototypecommit `6d473a3de23835494e238b6428cd3d5c15f240dd`, pakket `DartsPoint-UIUX-Platformbeheer-Codex-2026-10-14`. Alle 314 manifestbestanden zijn op lengte en SHA-256 gecontroleerd. Integratie startte op platformcommit `cdfa195dc520a14fd0130c7ada4ae303400e91f1`, zonder terug te gaan naar de oudere gelezen prototype-doelcommit. Documenten en bronmapping staan in `reference/update-2026-10-14/`.

## Implementatiematrix

| Onderdeel | Resultaat / productiebestanden |
| --- | --- |
| Bestaande negen chat/login/indicatorverbeteringen | Behouden; geen demo-auth, sampleklok, scores of werptiming overgenomen |
| Clubhuis met vier filters en acht widgettypen | `components/darts-room-feed.*`, `darts-workspace.tsx`; gepubliceerde serverprojectie en actuele domein-/oefengegevens |
| Mobiele panelen | `darts-play-shell.css` en `darts-app.tsx`: kamer/chat/ladder 90% bij idle kamerlobby, 60% tijdens gameplay; viewport en safe area blijven gebruikt |
| Lobbybeheer | `components/admin/darts-lobby-content.*`, `lib/darts-lobby-content.ts`: owner-only concept/publicatie, nieuws, reorder/duplicate, room-UUID-scopes, readonly preview en zichtbare versieconflicten |
| Persistentie en reacties | `packages/contracts/src/lobby.ts`, `packages/data/src/lobby.ts`: atomaire revisie/publicatie/audit, UUID-idempotentie, echte unieke stemmen en applaus |
| Toernooi- en widgethero | `darts-hero-background.*`, `admin/darts-hero-editor.*`, tournamentmodel/store/room en `data/competitions.ts`; afzonderlijke hero-versie voorkomt overschrijven van gelijktijdige wijzigingen |
| Media | `packages/data/src/media.ts`, `contracts/src/hero.ts`: geauthenticeerde uploads, gedeelde PostgreSQL-opslag en referentiebeheer |
| Wedstrijd hervatten | `darts-lobby.*`: opvallende blijvende banner op alle lobbyweergaven, numeriek gamenummer en directe link naar exact dezelfde wedstrijd |
| Tegenstander vertrekt | `data/matches.ts`: verbindingsadministratie wijzigt geen spelversie, fase-token, score of beurtdeadline; normale serverdisconnect- en timeoutregels blijven gelden |
| Einde en revanche | `use-server-game.ts`, `darts-match-experience.*`: bevestigde uitslag blijft geselecteerd, expliciet afsluiten naar kamer, uitnodigingstatus via geautoriseerde GET, wachten tot acceptatie/weigering, annuleren bij afsluiten en acceptatierace afhandelen |

## Backend en gegevens

Expand-only migratie: `20261014154749_lobby_content_media.sql`, aangemaakt via de geïnstalleerde Supabase CLI. Nieuwe private tabellen zijn niet toegankelijk voor `anon`/`authenticated`; de bestaande geverifieerde actor en `dartspoint_app`-servicegrens blijven gebruikt. De toernooitabel krijgt uitsluitend de extra presentatieversie `hero_version`.

De migratie publiceert zes widgets met echte gegevens/empty states. De twee redactionele widgets poll/communitymoment starten verborgen totdat een eigenaar inhoud heeft ingericht. Voorbeeldstemmen en fictieve prestaties zijn niet overgenomen. Voorbeelden uit de pakketdocumentatie zijn geen nieuwe API-autoriteit.

Voor lobbybeheer worden de bestaande `/api/platform`-auth/CSRF/rate limits gebruikt: GET `lobby/admin`, GET `lobby?roomId=...`, POST `lobby` (save/publish), POST `lobby/preview`, `lobby/vote` en `lobby/applause`. Preview wijzigt geen reacties. Widgets en doelgroepverwijzingen gebruiken stabiele kamer-ID's. Publicatie commit layout, revisie, referenties en audit als één transactie; readers ontvangen alleen de toegankelijke huidige publicatie. JSON-lobbyrequests worden streaming begrensd tot 1 MiB.

Media upload: POST `media/upload` (multipart), GET `media/:id` (wide/mobile), POST `media/delete`. Invoer is maximaal 8 MiB, één echte PNG/JPEG/WebP en 50 miljoen pixels. Sharp `0.35.5` decodeert en hercodeert zonder bronmetadata naar maximaal 1600×900 / 720×405 WebP. Binaire inhoud staat in `private.media_assets`, niet in settings/base64/localStorage of bootstrapresponses. Verwijderen van gerefereerde beelden wordt geweigerd; concept, huidige/historische publicatie en toernooi verwijzen atomair naar hun media.

Externe afbeeldingen zijn uitsluitend HTTPS van `images.unsplash.com` of `images.pexels.com`, zonder credentials, afwijkende poort of fragment. Ze laden in de browser; de server haalt geen gekozen URL op. Geen afbeelding of een laadfout gebruikt de grafische fallback. Media kan alleen worden gelezen na bestaande actor/room-/publicatierechtencontrole. Geen aanvullende media-secrets nodig.

PostgreSQL-media telt mee voor databasecapaciteit en bestaande versleutelde Restic-dumps; monitor database-/backupgrootte bij veel uploads. Gepubliceerde revisies blijven behouden, inclusief hun afbeeldingsreferenties. Een oude apprelease kan met de additive tabellen blijven draaien: rol bij applicatieproblemen terug naar de vorige image-digests, verwijder geen schema/revisies om terug te vallen.

Competitiewedstrijden worden niet via een gewone revanche als tweede bracket-/divisiewedstrijd gestart. Hun samenvatting verwijst naar uitnodigen vanuit een gewone kamer. Een ontoegankelijke/gesloten oude kamer stuurt afsluiten terug naar de lobby met een melding; de uitslag verandert niet.

## Verificatie en expliciete testuitzondering

De gebruiker heeft voor deze uitvoering uitdrukkelijk gevraagd om tests over te slaan. Er zijn geen unit-, spelregel-, integratie-, browser- of performanceacceptatietests uitgevoerd; de QA-eisen in het bronpakket zijn daardoor geen claim van uitgevoerde verificatie. Statische peerreview, `npm run typecheck`, `npm run build:deploy`, bron-/assetintegriteit en workflow-/Caddy-validatie blijven build-/deploymentcontroles.

Repositoryvariabele `DARTSPOINT_SKIP_TESTS_ONCE_SHA` wordt tijdelijk aan exact deze finale commit gekoppeld. Alleen vertrouwde main/staging-pushes op die SHA slaan tests over. Dockerpublicatie gebruikt dezelfde SHA-controle en uitsluitend `DEPLOY_ENV=staging`; production en PR's behouden hun normale tests. De variabele wordt na afloop verwijderd. Er worden geen bestaande timingmetingen opnieuw gebruikt als acceptatiebewijs voor deze release.

De bestaande beheerde staginghelper blijft migratie, image-identiteit, database-TLS, backup/restore en readiness uitvoeren. Dit zijn de bestaande gecontroleerde deploymentstappen; er is geen nieuwe handmatige testsuite of productie-deployment. Alleen staging is voor deze uitvoering geautoriseerd.
