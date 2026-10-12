# TARGET: VPS-operatiecontract voor DartsPoint

Deze map bevat **inactieve doeltemplates**, geen bestaande productievoorzieningen. De Sites-broncode werkt nog niet met deze Dockerfile: Codex moet eerst de echte Next.js-, Colyseus-, database- en workerimplementatie bouwen. Geen VPS, repository, branch, GitHub Environment of runner is door dit pakket aangemaakt.

De bestanden zijn voorbereid om tijdens die implementatie over te nemen naar `ops/` in de nieuwe repository. Bestanden in `workflow-templates/` worden pas daarna gekopieerd naar `.github/workflows/`. Hun huidige `.template`-extensie voorkomt dat het overdrachtspakket zelf deploys activeert.

## Vast doel

- Development-VPS: ontwikkelen en volledig toetsen, daarna naar `main` pushen.
- `main`: integratiebron, geen deploy naar staging/production.
- Merge naar `staging`: GitHub Environment `staging`, eigen runnerlabel `dartspoint-staging`, automatische deploy na controles.
- Merge naar `production`: GitHub Environment `production`, eigen runnerlabel `dartspoint-production`, automatische deploy na controles.
- Afzonderlijke staging- en production-VPS, Supabase-projecten, Redis-data, mailkeys, databases en secrets.
- Eén bestaande/native Caddy-installatie per host. Siteblocks toevoegen; bestaande Fieldgrid/Cluvo-sites of andere poorten nooit overschrijven.
- V1 één Colyseus-proces per omgeving. Een tweede gameserver toevoegen vereist eerst gedeelde presence/driver, procesadressen, leasefencing en routering.

## Bestanden

| Bestand | Doel |
|---|---|
| `Dockerfile.target` | Native Node runtime per web/realtime/worker, gebouwd uit dezelfde SHA |
| `compose.target.yml` | Containers en private Redis; alleen web/game op host-loopback |
| `dockerignore.target` | Basis voor repository `.dockerignore`; sluit configuratie/secrets uit |
| `environment.example` | Inventaris van GitHub Environment variables/secrets; geen bruikbare credentials |
| `Caddyfile.staging` / `.production` | Te reviewen siteblocks voor bestaande Caddy |
| `scripts/prepare-release.py` | Valideert omgeving; schrijft private bestanden per backendrol |
| `scripts/build-release.py` | Bouwt exact git-archief van SHA met publieke buildconfig; legt image-ID's vast |
| `scripts/deploy.py` | Backupgate, drain, expand-migratie, health, activeren; rollbackmodus |
| `scripts/health.py` | Minimale lokale readiness en optioneel exacte SHA |
| `scripts/control.py` | Alleen operator: status/drain/resume na onderbroken deploy |
| `scripts/backup-gate.example.py` | Expliciet blokkerende voorbeeldhook; echte providerintegratie nog nodig |
| `workflow-templates/*` | Pas activeren na implementatie en acceptatie |

## Buildcontract dat Codex moet implementeren

Kies een compatible, actuele stabiele Node LTS en leg de volledige OCI-digest vast. Gebruik dezelfde Node-major op development, CI en runtime. Behoud eerst bestaande UI-pins; upgrade geen frontenddependencies alleen om ze te moderniseren. De contractbestanden nemen `npm` plus één gereviewde `package-lock.json` aan. Als een andere package manager wordt gekozen, pas Dockerfile en beide workflowtemplates gezamenlijk aan.

Root-package scripts:

- `npm run verify:ci`: lint/typecontrole, deterministische score/Elo/301-double-in/finish/bust-tests, pure lifecycle/authorization-tests. Geen externe productioncredentials; falen blokkeert de build. Breid hosted CI uit met geïsoleerde Postgres/Redis en echte tweeclient- en browserintegratietests.
- `npm run build:deploy`: bouw gedeelde rules/protocolpackages, native `next build` met `output: 'standalone'`, realtime en worker. Maak drie **zelfstandige** directories `dist/deploy/web`, `dist/deploy/realtime`, `dist/deploy/worker`.
- Elke directory start via `node server.js`. Web bevat correct verplaatste Next standalone-output, `public` en `.next/static`; controleer monorepo tracing/rootpaden. Backend-output bevat alle runtimepackages inclusief gekoppelde workspacepackages, geen runtime-afhankelijkheid van de oorspronkelijke checkout of `tsx`.
- Worker-output bevat `scripts/health.mjs` en `scripts/migrate.mjs`. Migratiecommand `node scripts/migrate.mjs --expand-only` gebruikt alleen de migration-DB-credential, advisory lock, geregistreerde checksums, duidelijke stop bij drift en een transactionele aanpak waar Postgres die toestaat. Geen demo-data/owner automatisch bij elke deploy seeden.
- Build mag zonder database/serversecret werken. Pages die gegevens nodig hebben worden dynamisch gemaakt of gebruiken expliciet publieke, lege builddata. Geen productiondatabase tijdens static rendering bevragen.
- `NEXT_PUBLIC_*` wordt tijdens Next-build ingebakken. Daarom buildt ieder environment dezelfde commit afzonderlijk met zijn eigen publieke project/originwaarden. De images van staging worden niet blind naar production doorgezet. De templates kiezen Cloudflare Turnstile: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is per environment verplicht; de private CAPTCHA-secret staat in Supabase Auth. Gebruik eigen domeingebonden keys en nooit testkeys in production. Bij een bewust andere CAPTCHA-provider moet Codex dit contract en de UI gezamenlijk aanpassen.

## Runtimecontract

| Dienst | Intern | Host | Runtimegegevens |
|---|---|---|---|
| Web | `3000` | `127.0.0.1:4300` | Supabase SSR/session, veilige API, app-DB-role, serverkey alleen backend |
| Colyseus | `2567` | `127.0.0.1:42567` | geverifieerde identiteit/JWKS, app-DB-role, Redis, intern deploytoken |
| Worker | geen publiek HTTP | geen | duurzame Postgres-outbox, mail, deadlines/toernooiplanning; heartbeat |
| Redis | `6379` | geen gepubliceerde poort | AOF/presence/locks/cache; nooit bron van gespeelde scores |

`/readyz` op web en realtime retourneert bij gereedheid `200 {"ok":true,"release":"<exacte sha>"}`. Gereedheid controleert essentiële database/Redis/protocolverbindingen. Een drain is geen readinessfout: bestaande wedstrijden moeten doorgaan. Toon geen schema's, tokens, stacktraces, versies van infrastructuur of persoonsgegevens in die publieke response. Workerhealth verifieert een recent, perproces heartbeat en backendconnectiviteit; alleen `process exists` is onvoldoende.

Caddy blokkeert `/internal` en `/internal/*`. Realtime controleert daarnaast een server-only bearer-token voor de interne deploy-API en weigert verzoeken via de publieke ingress. Het interne endpoint mag niet via een alternatieve proxyroute of forwarded header openkomen. Native hostpoort is uitsluitend loopback.

### Deploy-API (te implementeren, geen standaard Colyseus-functie)

- `POST /internal/deploy/drain`: atomair gedeelde drainstatus inschakelen. Web, worker en Colyseus stoppen nieuwe wedstrijdstarts, toernooironde-starts en nieuwe matchreservaties. Bestaande partijen, worpen, hervatten van een bestaande partij en uitslagfinalisatie blijven werken. Geef spelers een rustige onderhoudsmelding; geen nieuwe no-shows uitdelen door onderhoud.
- `GET /internal/deploy/status`: `{draining, activeMatches, pendingImpacts, pendingWrites, safeToStop}`. De drie counters zijn integers. Alleen `safeToStop=true` wanneer alle drie nul zijn én geen scheduler/job alsnog een partij kan starten. Leaseoverdracht en uitslagoutbox moeten consistent zijn.
- `POST /internal/deploy/resume`: pas na gezonde deployment nieuwe starts weer toelaten. De oorspronkelijke drainstatus wordt door nieuwe processen gerespecteerd. Bij eerste bootstrap zonder status is de default **gesloten**, totdat dit endpoint expliciet opent.
- Game/events worden duurzaam in Postgres opgeslagen voordat de server ze bevestigt. Redis-drainstatus is geen vervanging voor durable matchdata. Een onverwachte restart moet herstelbaar zijn zonder fictieve forfeit/Elo-mutatie.
- Deploytoken minimaal 32 cryptografisch willekeurige bytes, base64url gecodeerd. Roteer buiten een lopende deploy en werk huidige/volgende configuratie gecoördineerd bij.

Colyseus' standaard graceful shutdown kan clients sluiten. Alleen een SIGTERM plus langere timeout garandeert dus niet dat partijen kunnen uitspelen. Deze applicatiedrain moet **voor** de containerstop gebeuren. Wachten duurt maximaal twintig minuten; bij een langere partij wordt deployment afgebroken en de oude versie weer geopend. Nooit een forcekill als automatische fallback.

## Secrets en bestanden

`prepare-release.py` krijgt GitHub-waarden via process environment, niet via geïnterpoleerde shellcode. Het script schrijft met umask `077` naar `/opt/dartspoint/<omgeving>/releases/<sha>-<run>-<attempt>/`. De rootmap moet vooraf runner-owned en `0700` zijn. Service-envbestanden zijn `0600`; Compose `format: raw` voorkomt dat `$`, quotes of `=` anders worden geïnterpreteerd. Daarom minimaal Docker Compose 2.30.

Maak geen `.env` in de checkout, geen secret-buildargs en geen tarball/GitHub-artifact van releases, logs, backups of docker-inspect. Zelfs gemaskeerde workflowlogs mogen geen OTP, emailadres, bearer-token of connectionstring bevatten. Behoud vorige private runtimeconfig zolang rollback nodig is, ruim daarna gecontroleerd op. Backups horen versleuteld en buiten deze VPS; release-envbestanden niet in de broncodebackup.

Moderne Supabase-keys zijn hier verplicht: `sb_publishable_...` publiek, `sb_secret_...` alleen backend. Als legacy `anon`/`service_role` nodig zou zijn, wijzig validatie en documentatie expliciet; gebruik nooit een `service_role` in `NEXT_PUBLIC_*`.

`DATABASE_URL` is een beperkte application-role voor serverdomeinfuncties; `MIGRATION_DATABASE_URL` is afzonderlijk geprivilegieerd. Beide verplicht TLS; implementeer certificaatverificatie in de gekozen driver, zet nooit `rejectUnauthorized:false`. Gebruik waar nodig de sessiepooler voor IPv4; controleer poollimieten per web/game/workerproces. Clienttoegang blijft onder RLS en object-/rolcontrole, ook als backend-DB-rollen extra rechten hebben.

## Backup en migratiegate

De meegeleverde backupvoorbeeldhook faalt bewust. De implementerende Codex moet een echte integratie toevoegen voor het gekozen Supabase-plan/offsitebackupgereedschap. Installeer die als root-owned, niet group/world writable uitvoerbaar bestand op `/opt/dartspoint/<omgeving>/hooks/pre-deploy-backup`.

De hook valideert het providerbewijs of maakt een backup, verifieert offsite opslag en levert uitsluitend JSON met `ok`, `environment`, `storage:"offsite"`, `backupCompletedAt`, `restoreVerifiedAt` en een echt providerbackup-ID. Maximaal 24 uur oud backupbewijs, maximaal 90 dagen sinds een aantoonbare restoreproef. Een handmatig aangemaakte timestamp, lokaal dumpbestand of planabonnement is geen werkende backupcontrole. Voor kritieke datamigraties een verse backup/PITR-positie eisen, bovenop deze basisgate.

Migrations zijn **expand/contract**. Deze deploy mag uitsluitend achterwaarts compatibele toevoegingen doen. Verwijderen/hernoemen/inperken pas in een latere release als oude images niet meer nodig zijn. Rollback herstelt images, nooit automatisch schema/data. Destructieve migraties krijgen een apart beoordeeld onderhouds- en herstelplan. Redis-digest wijzigen is in een gewone deployment geblokkeerd: infrastructuurupgrades zijn aparte onderhoudshandelingen.

## Herstel en rollback

- `current` verwijst naar de laatst gezond geactiveerde private release. Bekijk operational state vóór ingrijpen.
- Fout vóór containerwisseling: huidige versie blijft bestaan, drain wordt teruggedraaid.
- Fout tijdens nieuwe healthcheck: vorige images/config worden hersteld, oude health moet slagen, daarna resume.
- Nadat nieuwe versie gezond is geactiveerd en resume is geprobeerd, kan deze alweer spelers hebben aangenomen. Daarom vindt bij een onduidelijke resume-response **geen automatische rollback** meer plaats; inspecteer `control.py ... status` en hervat waar nodig.
- Handmatige rollback: `python3 ops/scripts/deploy.py /opt/dartspoint/<omgeving>/releases/<vorige-release> --rollback`. Ook rollback draint de huidige games, verifieert backup/image-ID's en health. Geen DB-downgrade. Alleen doen als de teruggezette code compatibel is met het huidige schema/protocol.
- Als runner/host tijdens deploy stopt, kan maintenance actief blijven. `python3 ops/scripts/control.py /opt/dartspoint/<omgeving>/current status` toont de toestand. Eerst juiste release, Redis en DB herstellen/controleren; pas daarna `resume`. Geen tijdgestuurde blind-auto-resume tijdens migratie.
- Bewaar minimaal de huidige en voorgaande gereviewde images/releaseconfig; verwijder nooit een actieve image of Redis-volume met `docker compose down -v`.

## Validatiestatus van deze templates

Dit zijn doelcontracten die syntactisch en met geïsoleerde unitchecks worden gecontroleerd. Ze zijn niet op een echte VPS, met Docker, Caddy, Supabase, mailprovider of GitHub runners uitgerold. De productie-implementatie is pas gereed na de acceptatiematrix in `docs/07-VPS-GITHUB-EN-DEPLOY.md`, inclusief echte tweeclientpartijen, browserbeeldvergelijking en restore-/rollbackproef.
