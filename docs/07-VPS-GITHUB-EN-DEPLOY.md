# VPS, GitHub en deploymentcanon

Development gebeurt op de bestaande development-VPS. Staging en production draaien samen op één nieuwe Hetzner-VPS met Ubuntu 24.04 amd64; ieder heeft een eigen applicatiegebruiker, runner, rootless Docker-daemon, netwerken/volumes, extern Supabaseproject, mailconfig en Hetzner-backuprechten. Eigen Supabaseproject betekent geen eigen VPS. De applicatie/UI/spelcanon blijft gelijk; het onveranderde oorspronkelijke document staat in reference/handoff.

## GitHub en release

`main` draait hosted CI en veroorzaakt geen deployment. De gebruiker maakt en beschermt staging/production, configureert hun GitHub Environments en geeft uitsluitend met zijn eigen merges deployment vrij. Alle tests, npm-installatie en drie amd64 imagebuilds draaien hosted. De persistente self-hosted runners voeren uitsluitend gecontroleerde deployment/backup/readiness uit en checken geen repository uit. Full-SHA Actionpins, minimum jobpermissions, tijdelijke GHCR-auth, immutable image-digests/commit/run/provenance en juiste omgevingspublic-values zijn verplicht. Stagingimages bevatten staging-browserconfig en mogen niet onveranderd naar production.

Per omgeving geldt cancel-in-progress=false, een volledige hostlock en afwijzing van verouderde runs. Privileged runners verwerken geen PR-code; runnertoegang/workflow/branch/environmentbeheer moet buiten YAML worden beperkt. Runnerlabels zijn geen beveiligingsgrens. Als runnergroep/workflowbeperking niet beschikbaar is, alleen vertrouwde beheerders toegang, anders eerst een aparte besloten deploymentrepository.

## Vaste hostafspraken

| Omgeving | Branch / Environment | Runtime / appgebruiker | Runner / installatie / label | Web / realtime |
|---|---|---|---|---|
| staging | staging | /srv/dartspoint/staging / dartspoint-staging | runner-staging / /opt/actions-runner-dartspoint-staging / dartspoint-staging | staging.dartspoint.nl → 127.0.0.1:3001; realtime.staging.dartspoint.nl → 127.0.0.1:2568 |
| production | production | /srv/dartspoint/production / dartspoint-production | runner-production / /opt/actions-runner-dartspoint-production / dartspoint-production | dartspoint.nl → 127.0.0.1:3000; realtime.dartspoint.nl → 127.0.0.1:2567 |

Runnernamen: dartspoint-staging-01 en dartspoint-production-01; projecten dartspoint-staging/production. Geen algemene sudo, root-Docker-socket, publieke DB/Redis/app-poorten of hardcoded development-UID. Iedere runner kan alleen de vaste root-owned nulargument-wrapper uitvoeren als de eigen appgebruiker. Managed Python/Compose/pins, sudoers en systemd staan onder root-owned parents en wijzigen alleen via expliciet beheer. Configoverdracht is private JSON, nooit shell-source. Native Caddy blijft één service; vier DNS-records wijzen naar dezelfde publieke VPS-IP. Stagingbeperking geldt via Tailscale voor web én realtime. De Colyseus SDK gebruikt HTTP-seat/matchmaking en echte WebSocketroutes, geen /ws-rewrite. `/internal` wordt publiek geblokkeerd en vereist intern loopback/token/geen forwarding.

## Gates, bootstrap en herstel

Een release valideert echte GitHub-buildherkomst, app-role/TLS, resources en offsitebackup met echte isolated restore voordat wedstrijden worden gedraind/migraties uitgevoerd. Drain vereist exact nul activeMatches/pendingImpacts/pendingWrites en safeToStop; maximaal twintig minuten, nooit actieve games force-stoppen. Daarna alleen checksummed expand-only migraties, nieuwe containers/readiness met exactSHA, current atomisch activeren en admissions hervatten. Redis heeft intern AOF en blijft dezelfde digest bij gewone releases. Dagelijkse backup/restore en periodieke check/retention zijn begrensd en gescheiden per omgeving. Application rollback draait alleen oude images terug; databaseherstel is een aparte operatorhandeling.

Alle databaseconsumenten controleren certificaatketen en hostname, Node rejectUnauthorized=true, libpq verify-full met systeem/provider-CA; directe/sessionconnecties voor snapshot, geen transactionpooler. PostgreSQLmajor17 is getest en wordt gecontroleerd. Eén `DATABASE_URL` levert dezelfde beheerlogin voor app, migraties en backups; appverbindingen schakelen vóór gebruik naar de wachtwoordloze NOSUPERUSER/NOBYPASSRLS-rol `dartspoint_app`. De eerste deployment initialiseert alleen een over verify-full TLS bewezen lege database zonder current/marker. Bestaande domeintabellen worden nooit gereset; database-, backup- en restoregates blijven verplicht. Ownerbootstrap gebruikt uitsluitend echte geverifieerde Auth-UUID/email plus onboarding, lock, audit en weigering bij bestaande owner/herhaling, nooit een gewone deploymentseed.

Restic versleutelt naar private Hetzner S3, regio/endpoint expliciet; AWS-namen betekenen S3-clientvariabelen, geen AWS-account. Repositorypassword is zelf gekozen en ook buiten VPS in de kluis bewaard. Accountbrede sleutels blijven buiten applicatiecontainers. Dump bevat Auth/app/migratieregistratie, geen externe Storage-objecten/providerconfig/secrets. Herstelplan en aparte backup van nieuwe blijvende objecten zijn verplicht. Geen cloudinkopen, live DNS-, Tailscale-, SSH- of firewallwijzigingen door workflows.

## Canonieke uitvoeringsdocumenten

- [Secrets, variables, consumer en gebruiksmoment](GITHUB-ENVIRONMENTS.md)
- [Staginginvulstappen](GITHUB-STAGING.md) en [productioninvulstappen](GITHUB-PRODUCTION.md)
- [Eenmalige serverinstallatie, eerste bootstrap, owner en oude-pad-migratie](../ops/HOST-INSTALLATION.md)
- [Werkelijke deployment/backup/restore en operationele beperkingen](../ops/README.md)
- [Acceptatiebewijs en resterende externe controles](DEPLOYMENT-ACCEPTANCE.md)

Deze afspraken beschrijven de gereviewde repository. De werkelijke nieuwe VPS/providertoegang is een afzonderlijke acceptatie; tests worden alleen als geslaagd gerapporteerd met daadwerkelijk bewijs.
