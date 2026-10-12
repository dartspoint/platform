# DartsPoint deployment en herstel

Deze repository bevat werkende native Next.js-, Colyseus- en workerimages. `.github/workflows/` is de actieve configuratie; `workflow-templates/` bewaart een identieke kopie ter referentie. Alle drie images zijn lokaal gebouwd en met echte PostgreSQL, Auth, Redis en workerheartbeat gestart. De externe staginghost en providers worden apart geconfigureerd met `docs/GITHUB-STAGING.md`.

## Hostconfiguratie

Gebruik een afzonderlijke staging- en productionhost, elk met eigen Supabaseproject, runner, mailkeys en externe backuprepository. V1 draait één Colyseusproces per omgeving. Provision Docker met Compose ≥2.30 (raw envfiles), Python 3, git, Caddy en een bewust gekozen, geverifieerde Restic-installatie. Gebruik de pinned Node/Redis/PostgreSQL-images uit `image-pins.json`.

Provision `/opt/dartspoint/<environment>` runner-owned, modus `0700`. Releases komen in `releases/<40-character-sha>-<run>-<attempt>`. Elk rol-envbestand is `0600`; geen credentials in de checkout, buildargs, image of CI-artifacts. De applicatierol is geen superuser en heeft geen RLS-bypass; migrations en backup gebruiken aparte credentials. TLS verifieert certificaten, met optionele provider-CA. Git-archivering en een schone checkout beperken de build tot de triggering commit.

Installeer `scripts/backup-gate.py` als root-owned uitvoerbaar `/opt/dartspoint/<environment>/hooks/pre-deploy-backup` en `scripts/restore-db.py` naast die hook. Files en hookdirectory mogen niet door groep/anderen worden geschreven. Maak de hook bijvoorbeeld met `install -o root -g root -m 0755`; wijzig nooit een bestaande hook zonder de nieuwe bron te beoordelen. Init de externe encrypted Restic S3-repository met een privé operatoromgeving. `backup-gate.example.py` is een historisch fail-closed voorbeeld en wordt niet gebruikt.

De echte gate exporteert een repeatable-read Postgres-snapshot, maakt een dump plus rijtellingen, bewaart die versleuteld offsite, leest de snapshot terug uit S3, controleert Restic-integriteit, herstelt de dump in een disposable netwerkloze PostgreSQL-container en controleert Auth-accounts, resultaten, Elo-ledger, migraties en RLS. Alleen echte successen leveren JSON-evidence. De gate faalt bij onbereikbare opslag, ontbrekende keys/repository, CA-fouten of mislukte restore. Dumps blijven in tijdelijke private releasefolders en worden verwijderd; automatische retention/prune is bewust een aparte operatorhandeling.

Een volledig leeg project moet vóór zijn eerste domeinbackup eenmalig de gereviewde expand-migrations krijgen terwijl admissions gesloten blijven; zie staginginstructies. Een planabonnement of handmatige timestamp vervangt deze gate niet.

## Services en Caddy

| Service | Container | Host |
|---|---|---|
| Web | 3000 | 127.0.0.1:4300 |
| Realtime | 2567 | 127.0.0.1:42567 |
| Worker | Geen publiek endpoint | Geen |
| Redis | 6379, AOF, eigen volume | Geen |

Voeg `Caddyfile.staging` of `.production` toe aan de bestaande native Caddy-installatie op de betreffende host. Behoud andere sites en poorten. `/internal` wordt door Caddy geblokkeerd; de applicatie vereist daarnaast loopback, een server-only token en weigert forwarded headers. Operatorcontrol verloopt via `docker compose exec` en localhost binnen de realtimecontainer, zodat Docker bridge-adressen geen uitzondering op die beveiliging krijgen. Geheimen staan niet in de exec-argumenten.

Web en realtime `/readyz` geven alleen `{"ok":true,"release":"<sha>"}`. Ze controleren echte DB/Redis-verbindingen, een recente workerheartbeat van dezelfde SHA en, bij web, de realtime-SHA. Workerhealth gebruikt `scripts/health.mjs`. Process presence is geen readiness.

## Release en drain

`main` is de integratiebron en deployt niet. De beschermde `staging` en `production` branches gebruiken hun corresponderende GitHub Environment en aparte self-hosted runner. Checkout- en Node-setupactions zijn immutable gepind. Hosted CI krijgt geen environmentsecrets en voert geïsoleerde database- en browsertests uit; geen PR-workflow op de privileged runner.

`prepare-release.py` schrijft private rolconfig; `build-release.py` bouwt alle images uit het exacte Git-archief, met uitsluitend publieke frontend-buildwaarden, en registreert immutable image-ID's. `deploy.py` controleert backup, zet admissions atomair dicht, annuleert ongeopende assignments en laat bestaande partijen/inslagen/finalisatie doorgaan. De stopgate vereist **activeMatches=0, pendingImpacts=0, pendingWrites=0**. Na maximaal twintig minuten wordt de deploy afgebroken en de bestaande release hervat. Er is geen forcekillfallback.

Bij eerste bootstrap is admission standaard gesloten. Redis bewaart drainstatus over procesrestarts. Compatible migrations gebruiken een advisory lock en SHA-256-register; drift of een ontbrekend toegepast bestand stopt de release. Alleen expand-migrations zijn toegestaan. Contract/destructieve wijzigingen vereisen een later apart onderhoudsplan. Redis-upgrades worden tijdens reguliere deployment geblokkeerd.

## Herstel en rollback

`current` wijst naar de laatst gezond geactiveerde private release. Fout vóór vervanging behoudt de oude containers. Fout bij nieuwe readiness herstelt vorige images/config en vereist oude readiness vóór resume. Als een resume-response onduidelijk is nadat een gezonde nieuwe release mogelijk spelers aannam, vindt geen automatische rollback plaats. Inspecteer dan eerst de huidige toestand.

```bash
python3 ops/scripts/control.py /opt/dartspoint/staging/current status
python3 ops/scripts/control.py /opt/dartspoint/staging/current resume
python3 ops/scripts/deploy.py /opt/dartspoint/staging/releases/<vorige-release> --rollback
```

Gebruik `resume` pas na controle van release, DB, Redis en readiness. Rollback gebruikt dezelfde backup/drain/healthgates en herstelt images, nooit automatisch schema/data. Bewaar huidige en vorige gereviewde releaseconfig/images; verwijder geen actieve image of Redis-volume met `down -v`. Na een crash kan maintenance actief blijven totdat een operator bewust hervat.

`VALIDATION.md` en `docs/LOCAL-ACCEPTANCE.md` onderscheiden bewezen lokale checks van de nog uit te voeren externe SMTP/CAPTCHA/DNS/S3/runner-acceptatie.
