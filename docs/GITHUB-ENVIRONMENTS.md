# GitHub Environment-inventaris

Configureer in GitHub → dartspoint/platform → Settings → Environments afzonderlijk `staging` en `production`. Alleen de gelijknamige beschermde branch mag zijn environment gebruiken. Beide draaien op dezelfde doel-VPS, met afzonderlijke externe Supabaseprojecten, accounts, mailkeys en backuprechten. Developmentcredentials mogen hier niet worden hergebruikt.

## Secrets — zeven basisinstellingen en twee private supportinstellingen

De zeven basisinstellingen zijn verplicht. De twee supportinstellingen blijven in staging tijdelijk leeg totdat de provider is ingericht; productie vereist beide. De hosted stap `Validate settings without displaying secret values` controleert eerst hun formaat, het Supabaseproject, de databaseverbinding en het Hetzner-endpoint. Bij een fout toont hij alleen de betreffende instelling of contractregel; hij maakt geen verbinding met providers en schrijft geen configuratiebestand. Daarna ontvangt `Deliver to the installed environment helper` de waarden voor de private overdracht. De hosted imagebuild ontvangt uitsluitend publieke variabelen. De private overdracht wordt na de helper verwijderd. Rolbestanden zijn app-owned en `0600`.

| Naam | Doel en herkomst | Consumer en tijdstip |
|---|---|---|
| `SUPABASE_SECRET_KEY` | `sb_secret_…` uit het betreffende Supabaseproject, Settings → API Keys | Serverauth in web/realtime/worker, runtime; eenmalig ownerbootstrap |
| `DATABASE_URL` | Eén beheerlogin van het betreffende Supabaseproject, doorgaans `postgres`, met rechten voor expand-migraties en volledige backups | De helper gebruikt dezelfde login voor app, migraties en backups. Appverbindingen schakelen vóór gebruik naar `dartspoint_app` |
| `RESEND_API_KEY` | Omgevingsgebonden Resend-key met verzendrechten, ontvangen mail en uitlezen van het verzenddomein | Alleen worker/support, applicatiemail en veilige ontvangst |
| `TURNSTILE_SECRET_KEY` | Private sleutel van de Cloudflare-widget op het appdomein | Alleen web, publiek supportformulier; afzonderlijk van de publieke sitekey |
| `RESEND_WEBHOOK_SECRET` | `whsec_…` van de geconfigureerde Resend-webhook | Alleen web, handtekening van inkomende mail en bezorggebeurtenissen |
| `INTERNAL_DEPLOY_TOKEN` | Eenmalig gegenereerde 32 random bytes, base64url zonder padding; bijvoorbeeld lokaal `openssl rand -base64 32` naar base64url omzetten; in kluis bewaren | Alleen realtime; interne drain/status/resume. Houd stabiel over releases |
| `RESTIC_PASSWORD` | Zelf gekozen sterk wachtwoord bij nieuwe repository; genereer 32 random bytes in je wachtwoordmanager of lokaal met `openssl rand -base64 32` | Alleen Restic backup/restore/init/retention. Bewaar ook in de kluis; bestaande repository vereist oorspronkelijk wachtwoord |
| `AWS_ACCESS_KEY_ID` | Hetzner Object Storage S3-access key met toegang uitsluitend tot de betreffende backupbucket | Alleen Restic/S3 |
| `AWS_SECRET_ACCESS_KEY` | Bijbehorende Hetzner S3-secret; direct veilig bewaren bij aanmaken | Alleen Restic/S3 |

`DATABASE_URL` is de enige database-secret. Kopieer de directe of session-pooler-URL uit Supabase Connect. De helper voegt ontbrekende TLS-configuratie toe, gebruikt `sslmode=verify-full` en zet bekende Supabase transaction-endpoints op session/direct-poort 5432. Dubbele, uitgeschakelde of andere ongeldige TLS-opties worden geweigerd; project, certificaat en hostname blijven gecontroleerd. URL-encode gereserveerde tekens in het wachtwoord.

De helper schrijft dezelfde genormaliseerde URL onder de consumernaam `MIGRATION_DATABASE_URL` in het tijdelijke migratiebestand en `BACKUP_DATABASE_URL` in het backupbestand. Deze twee namen zijn geen vereiste GitHub-secrets meer; bestaande items kunnen blijven staan en worden niet gebruikt. De eerste migrations kennen de bestaande beheerlogin de wachtwoordloze rechtengroep `dartspoint_app` toe. Iedere nieuwe app-poolverbinding wacht op `SET ROLE dartspoint_app`; de live gate blijft NOSUPERUSER/NOBYPASSRLS op de effectieve app-rol controleren. De gedeelde login zelf houdt beheerrechten: `SET ROLE` is geen grens tegen misbruik van gelekte logincredentials.

`AWS_*` zijn S3-clientnamen en verplichten niet tot Amazon AWS. Restic verzorgt encryptie; Hetzner bewaart de versleutelde objecten. [Hetzner Restic](https://docs.hetzner.com/storage/object-storage/howto-backups/restic/).

## Variables — negen verplichte en vijf aanvullende

| Naam | Verplicht | Herkomst en doel | Consumer en tijdstip |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Ja | Staging `https://staging.dartspoint.nl`; production `https://dartspoint.nl` | Hosted Next-build, webserver, realtime-origin en mail |
| `NEXT_PUBLIC_REALTIME_URL` | Ja | Staging `https://realtime.staging.dartspoint.nl`; production `https://realtime.dartspoint.nl` | Hosted browserbuild; Colyseus SDK doet HTTP matchmaking en veilige WebSockets |
| `NEXT_PUBLIC_SUPABASE_URL` | Ja | `https://<20-character-project-id>.supabase.co`, eigen project per omgeving | Hosted build en serverauth |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Ja | `sb_publishable_…`, publieke key uit hetzelfde Supabaseproject | Hosted browserbuild en webserver |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Ja | Publieke Cloudflare-sitekey voor het juiste webdomein | Hosted browserbuild |
| `MAIL_FROM` | Ja | Gecontroleerde afzender, bijvoorbeeld `DartsPoint staging <noreply@staging.dartspoint.nl>` of `DartsPoint <noreply@dartspoint.nl>` | Alleen worker, runtime |
| `MAIL_REPLY_TO` | Ja | Bewaakt supportadres | Alleen worker, runtime |
| `RESTIC_REPOSITORY` | Ja | Bijvoorbeeld `s3:https://fsn1.your-objectstorage.com/dartspoint-staging-backups` of aparte productionbucket | Alleen backuphelper/Restic |
| `AWS_DEFAULT_REGION` | Ja | Werkelijke Hetzner-bucketregio: `fsn1`, `nbg1` of `hel1`; moet overeenkomen met endpoint | Alleen Restic/S3 |
| `DATABASE_CA_CERT_BASE64` | Indien provider-CA nodig | Publiek PEM CA-certificaat uit databaseprovider, op één regel base64; bijvoorbeeld lokaal `base64 -w0 database-ca.crt` | Node app/migratie en libpq dump/bootstrap; keten én hostname worden gecontroleerd |

`NODE_IMAGE`, `REDIS_IMAGE`, `POSTGRES_IMAGE` en `CLAMAV_IMAGE` zijn **geen Environment-variabelen meer**. Hun enige bron is `ops/image-pins.json`, ook eenmalig root-owned geïnstalleerd op de VPS. De manifestcontrole weigert afwijkende pins. Een upgrade vereist code-review en een bewuste operatorupdate van de geïnstalleerde pins; Redis heeft bovendien een apart onderhoudsplan nodig. PostgreSQL 17 is de werkelijk geteste major, inclusief Auth-schema, pgcrypto, RLS en migraties; contrib-extensionnamespace/versie wordt apart vastgelegd en gecontroleerd; een andere externe major stopt de backupgate.

`GITHUB_TOKEN` is automatisch, tijdelijk en jobgebonden; maak geen extra registry-PAT-secret. Geef deze repository toegang tot de private GHCR-packages. Geen serverkeys in public buildargs, image-layers, frontend of release-artifact. Het artifact bevat alleen publieke configuratie, commit/run, amd64-platform, basispins en drie immutable image-digests.

## Providerinstellingen buiten GitHub

In elk Supabase Auth-project: juiste site-URL en expliciete redirectallowlist; email-OTP met zes cijfers, 600 seconden verval en 60 seconden resendinterval. Confirmation/magiclinktemplates gebruiken `{{ .Token }}`. Configureer custom SMTP met Resend (`smtp.resend.com`, poort 465, username `resend`, geschikte SMTP/API-key, geverifieerde afzender). Supabase verstuurt OTP, de worker overige applicatiemail. Configureer SPF/DKIM/DMARC bij je DNS-provider. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

De private Turnstile-secret staat in Supabase Auth CAPTCHA-configuratie en als web-only `TURNSTILE_SECRET_KEY` voor het publieke supportformulier. Publieke sitekey/projectkey mogen openbaar zijn; serverkeys niet. `SUPABASE_ACCESS_TOKEN`, `BOOTSTRAP_OWNER_EMAIL`, SMTP-password zijn geen extra GitHub Environment-items. Ownerbootstrap gebruikt een tijdelijk operatorbestand, buiten de gewone workflow.

Controleer in GitHub de daadwerkelijke vereiste check op een PR: de huidige standalone CI-job heet `verify`, workflow `DartsPoint CI`; de herbruikbare deploymentverificatie heet `Verify / verify`. Selecteer de bestaande check in branchbescherming; verzin geen naam. Bescherm workflowbestanden/pins met verplichte review en beperk bypass/forcepush. Labels en YAML-voorwaarden zijn geen toegangsgrens. Configureer waar beschikbaar runnergroepen voor uitsluitend deze private repository en `.github/workflows/deploy.yml` op de twee beschermde environmentrefs. Als je abonnement die beperking niet biedt, mogen alleen vertrouwde beheerders workflows/Actions en de repository beheren; is dat niet haalbaar, gebruik een aparte besloten deploymentrepository voordat je deze runners registreert. [GitHub runnergroepen](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access).

## Publieke landingspagina (13 oktober 2026)

Environment `staging` krijgt variabele `LANDING_ORIGIN=https://binnenkort.dartspoint.nl`. Deze waarde is serverconfiguratie en gaat via het gecontroleerde deliverycontract naar web/worker; de bestaande `NEXT_PUBLIC_APP_URL` blijft de staging-app. Geen nieuwe secrets nodig. Het afzonderlijke native Caddy-hostblok uit `ops/Caddyfile.landing.template` biedt alleen GET/HEAD `/` en de twee exacte POST-formulierroutes.

DNS: A-record `binnenkort` → `178.105.113.148`. Verwijder een conflicterend AAAA-record totdat IPv6-routing is geverifieerd. Na de DNS-wijziging vraagt bestaande Caddy automatisch het certificaat aan. Staging-app en realtime houden hun Tailscale-bronrestrictie.

Private export binnen de worker: `node scripts/launch-export.mjs`; optioneel `--issue-unsubscribe-links` maakt persoonlijke afmeldtokens; eerder uitgegeven links blijven geldig en alleen hashes staan in de database voor een handmatig voorbereide export. Sla de uitvoer uitsluitend in een privébestand (umask 077) op. Er is geen publieke export, automatische mailing of verzonnen bevestigingsmail.

De staging-deployment voert na migratie een gereserveerde `validation.invalid`-probe uit: normalisatieduplicaat, webrestart, dezelfde rij teruglezen en een nieuwe echte Restic-backup/restore inclusief private aanmeldtabel. De probe wordt daarna verwijderd; bewijs staat privé in `launch-evidence.json` en `backup-evidence.json`. Productiedeploys voeren deze probe niet uit.


## Support, mailboxontvangst en scanner

De runtime bevat een aparte service `support`, met dezelfde immutable worker-image, 0,25 CPU en 384 MiB geheugen. Deze verzorgt mail, privacytaken en bijlagenscans buiten de snelle gameplayworker. De eigen healthcheck controleert de supportheartbeat en release. De private ClamAV-sidecar heeft 0,5 CPU, 3 GiB RAM, een eigen volume met virusdefinities, geen gepubliceerde poort en geen applicatiecredentials. Niet-concurrent herladen begrenst het geheugen; bestanden blijven in quarantaine tijdens opstart, een storing of het herladen van definities. De image is per digest vastgezet in `ops/image-pins.json`; FreshClam actualiseert de definities vier keer per dag. [ClamAV-geheugenvereisten](https://docs.clamav.net/manual/Installing/Docker.html).

Een VPS met 8 GiB heeft bij twee omgevingen alleen al maximaal 6 GiB voor de scanners nodig. Deze sprint richt staging eerst in; productie en gelijktijdige QA worden pas na een gemeten capaciteitscontrole aangezet. Een niet-beschikbare scanner opent nooit bijlagen. Web en realtime mogen tijdens de scanneropstart wel gezond worden.

De aanvullende Environment Variables zijn `SUPPORT_INBOUND_ADDRESS` (voorgesteld `support@ontvangen.dartspoint.nl`), `SUPPORT_RESEND_DOMAIN_ID` (het Resend-domein van `MAIL_FROM`) en `GOOGLE_AUTH_ENABLED=false`. De eerste twee blijven in staging leeg tot de daadwerkelijke inrichting; productie vereist beide. `GOOGLE_AUTH_ENABLED` gaat pas naar `true` nadat de Google-client en Supabase-provider per omgeving zijn geconfigureerd. Er staat geen Google-clientsecret in de browserbuild.

Hostnet ontvangt de bestaande mailbox `support@dartspoint.nl`. Behoud de huidige MX-records van `dartspoint.nl`. Richt een afzonderlijk ontvangstdomein `ontvangen.dartspoint.nl` met de door Resend opgegeven MX in en verifieer dat domein. Laat Hostnet uitsluitend de supportmail doorsturen naar de exacte `SUPPORT_INBOUND_ADDRESS`; gebruik voor staging en productie gescheiden forwardingdoelen of schakel expliciet om tijdens de gecontroleerde ingebruikname. Forward niet rechtstreeks naar een SMTP-serveradres uit een MX-record. [Resend ontvangen naast een bestaande mailbox](https://resend.com/docs/dashboard/receiving/custom-domains).

Registreer de webhook op `https://<appdomein>/api/support/inbound` voor `email.received`, `email.sent`, `email.delivered`, `email.bounced`, `email.failed`, `email.suppressed`, `email.complained` en `email.delivery_delayed`. Bewaar de signing secret als `RESEND_WEBHOOK_SECRET`. De server slaat een gecontroleerde ontvangst duurzaam op vóór de HTTP-bevestiging; alleen betrouwbare oorspronkelijke berichtreferenties, een geverifieerde mailbox en de door Resend vastgestelde DKIM/DMARC-resultaten mogen een reactie aan een bestaand dossier toevoegen. Overige mail komt in afgeschermde triage. Nieuwe CC-adressen krijgen geen toegang.

Schakel open- en kliktracking uit op het supportverzenddomein. De support- en privacymailer lezen de werkelijke domeininstellingen vóór verzending en bewaren een niet-verzendbaar bericht met foutstatus als tracking aanstaat of niet kan worden gecontroleerd. `Reply-To` is exact `support@dartspoint.nl`. Test op staging een gewone en privacyvraag, een vervalste reply, dubbele webhook, bounce en schone plus EICAR-bijlage. Stagingacceptatie vereist de werkelijke scannercontrole voordat de bijbehorende publieke privacybeloften worden gepubliceerd.

Stel in Hostnet daarnaast automatisch wissen van veilig verwerkte mailboxkopieën na uiterlijk 30 dagen in. De applicatie kan een Hostnet-kopie niet via haar database verwijderen. Controleer die instelling en de verwerkersafspraken apart; bewaar geen extra onbeperkte archiefkopie. Hiervoor worden geen bestaande mailbox- of DNS-instellingen automatisch gewijzigd.


De vier applicatieservices schrijven via `/app/retained-log.mjs` naar één privaat, omgevingsgebonden `technical-logs`-volume. Dockerlogging voor deze services staat op `none`, zodat geen tweede onbeperkte JSON-kopie achterblijft. De launcher houdt argumenten en afsluitsignalen van de applicatie intact, gebruikt mappen `0700` en bestanden `0600`, begrenst iedere service op 2 MiB per UTC-dag en verwijdert partities na 28 dagen. De uurlijkse opruiming en dagelijkse hosttaak houden marge onder de maximale termijn van 30 dagen. Een schrijf- of rechtenfout beëindigt de service met zichtbare foutstatus. `docker compose logs` is daardoor geen archief meer; een bevoegde operator leest de private bestanden via de applicatiecontainer. De aparte `log-prune`-taak gebruikt geen netwerk of secrets en ruimt ook op wanneer applicaties stilstaan.

Deliverydiagnostiek komt in private `operations-YYYY-MM-DD.log` per release. De dagelijkse taak verwijdert alleen oude lognamen in eigen, private releasedirectories; envbestanden, broncode en actuele runtimebestanden blijven bewaard. Oude `operations.log`-bestanden worden op hun bestandstijd beoordeeld. De ClamAV-uitvoer bevat uitsluitend engine-/definitiediagnostiek en scant via INSTREAM zonder gebruikersbestandsnamen of inhoud; de bestaande beperkte Dockerrotatie blijft daar actief. Caddy-accesslogging blijft uitgeschakeld.

`scripts/make-support-host-update.py` verpakt uitsluitend gecommitteerde, beoordeelde broncode in een bestand met SHA-256. Het installeert gedeelde compatibele helpers, voegt alleen de gecontroleerde ClamAV-pin toe, werkt alleen staging-Compose en de staging-privacy-/retentietimers bij en maakt een volledige private rollbackinventaris. Het laat productie-Compose, productietimers, overige Caddy-sites en de countdown intact. De enige publieke staging-uitzondering is `POST /api/support/inbound`; een andere methode op dat exacte pad krijgt 405 en andere staging-paden houden hun Tailscale-beperking. De helper wordt pas na review door de beheerder uitgevoerd en start of herstart geen applicatiecontainers.
