# Staging instellen

Staging en production draaien op **dezelfde nieuwe Hetzner-VPS**. Development blijft op de development-VPS. De applicatie en runner gebruiken afzonderlijke accounts; staging heeft een eigen rootless Docker-daemon, Supabaseproject, mailkeys en private Hetzner-backupbucket.

## Invulstappen

1. **Bij Supabase:** maak/kies het stagingproject en configureer Auth, SMTP en Turnstile zoals in [de gezamenlijke inventaris](GITHUB-ENVIRONMENTS.md). Bewaar één bevoegde databasebeheerlogin als `DATABASE_URL`; de helper controleert TLS en laat appverbindingen de beperkte `dartspoint_app`-rol gebruiken.
2. **Bij Hetzner:** maak bewust een private backupbucket, bijvoorbeeld `dartspoint-staging-backups`. Kies de regio; maak een werkelijk beperkt bevoegde S3-key. Genereer het eigen `RESTIC_PASSWORD` en bewaar het in je wachtwoordkluis. De eerste deployment kan de nieuwe repository met dit wachtwoord initialiseren; een bestaande repository vereist het oorspronkelijke wachtwoord en wordt nooit overschreven. [Bucketrechten en backupbeleid](../ops/README.md).
3. **In GitHub:** voeg de zeven secrets en negen verplichte variables uit [GITHUB-ENVIRONMENTS.md](GITHUB-ENVIRONMENTS.md) toe aan Environment `staging`; optioneel de CA-variable. Web-URL `https://staging.dartspoint.nl`, realtime-URL `https://realtime.staging.dartspoint.nl`. Voor fsn1: `AWS_DEFAULT_REGION=fsn1`, `RESTIC_REPOSITORY=s3:https://fsn1.your-objectstorage.com/dartspoint-staging-backups`. Gebruik je werkelijke bucket/regio.
4. **Op de doel-VPS, als beheerder `danny`:** voer de [eenmalige installatie](../ops/HOST-INSTALLATION.md) uit. App `/srv/dartspoint/staging`, account `dartspoint-staging`; runner `runner-staging`, installatie `/opt/actions-runner-dartspoint-staging`, naam `dartspoint-staging-01`, label `dartspoint-staging`.
5. **In DNS:** `staging` en `realtime.staging` wijzen publiek naar dezelfde doel-VPS als production. Testers gebruiken Tailscale en split DNS/hosts naar het Tailscale-IP voor beide stagingnamen. De geïnstalleerde Caddy-siteblokken weigeren andere bronnen, voor web én realtime. AAAA alleen als IPv6 aantoonbaar werkt.
6. **In GitHub:** bescherm branch/environment `staging`, beperk runnertoegang en merge zelf de gereviewde `main` naar `staging`. Hosted acceptance/builds publiceren drie private GHCR-images; de stagingrunner doet alleen deployment. De helper initialiseert automatisch alleen een aantoonbaar lege database en een nieuwe repository in de reeds gemaakte bucket. De gewone database-, backup- en restoregates blijven verplicht.
7. **Op staging:** test echte OTP, CAPTCHA, SMTP, HTTPS, matchmaking, WebSocket, reconnect, backup/restore en rollback. Activeer de periodieke timers na de eerste gezonde release. Maak pas daarna de echte owner via de operatorprocedure.

De poorten zijn alleen `127.0.0.1:3001` (web) en `127.0.0.1:2568` (realtime). Redis en restore-Postgres hebben geen hostpoort. `main` start uitsluitend hosted CI; het pusht geen stagingrelease. De gebruiker geeft deployment vrij met de merge naar `staging`.

Production: [GITHUB-PRODUCTION.md](GITHUB-PRODUCTION.md). Technische uitvoering, herstel en beperkingen: [ops/README.md](../ops/README.md).
