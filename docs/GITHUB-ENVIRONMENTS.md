# GitHub Environment-inventaris

Configureer in GitHub → dartspoint/platform → Settings → Environments afzonderlijk `staging` en `production`. Alleen de gelijknamige beschermde branch mag zijn environment gebruiken. Beide draaien op dezelfde doel-VPS, met afzonderlijke externe Supabaseprojecten, accounts, mailkeys en backuprechten. Developmentcredentials mogen hier niet worden hergebruikt.

## Secrets — negen per omgeving

Alle negen zijn verplicht. Alleen de stap `Deliver to the installed environment helper` ontvangt deze waarden; de hosted build ontvangt uitsluitend publieke variabelen. De private overdracht wordt na de helper verwijderd. Rolbestanden zijn app-owned en `0600`.

| Naam | Doel en herkomst | Consumer en tijdstip |
|---|---|---|
| `SUPABASE_SECRET_KEY` | `sb_secret_…` uit het betreffende Supabaseproject, Settings → API Keys | Serverauth in web/realtime/worker, runtime; eenmalig ownerbootstrap |
| `DATABASE_URL` | Directe of session-pooler-URL van eigen app-login, lid van `dartspoint_app`, `NOSUPERUSER NOBYPASSRLS`; database `postgres`, `?sslmode=verify-full` | Appdriver/runtime en pre-deploy rol/TLS-verificatie |
| `MIGRATION_DATABASE_URL` | Afzonderlijke privileged migratielogin; directe/sessionverbinding, TLS | Alleen tijdelijke migratiecontainer; bestand verwijderd na gebruik |
| `BACKUP_DATABASE_URL` | Afzonderlijke backup-login, volledige leesrechten op auth/public/private/migratiegegevens en sequences; gecontroleerde RLS-bypass voor deze rol nodig | Snapshot-export en pg_dump, uitsluitend backuphelper |
| `RESEND_API_KEY` | Omgevingsgebonden Resend-key voor geverifieerd verzenddomein | Alleen gewone worker, applicatiemail |
| `INTERNAL_DEPLOY_TOKEN` | Eenmalig gegenereerde 32 random bytes, base64url zonder padding; bijvoorbeeld lokaal `openssl rand -base64 32` naar base64url omzetten; in kluis bewaren | Alleen realtime; interne drain/status/resume. Houd stabiel over releases |
| `RESTIC_PASSWORD` | Zelf gekozen sterk wachtwoord bij nieuwe repository; genereer 32 random bytes in je wachtwoordmanager of lokaal met `openssl rand -base64 32` | Alleen Restic backup/restore/init/retention. Bewaar ook in de kluis; bestaande repository vereist oorspronkelijk wachtwoord |
| `AWS_ACCESS_KEY_ID` | Hetzner Object Storage S3-access key met toegang uitsluitend tot de betreffende backupbucket | Alleen Restic/S3 |
| `AWS_SECRET_ACCESS_KEY` | Bijbehorende Hetzner S3-secret; direct veilig bewaren bij aanmaken | Alleen Restic/S3 |

`AWS_*` zijn S3-clientnamen en verplichten niet tot Amazon AWS. Restic verzorgt encryptie; Hetzner bewaart de versleutelde objecten. [Hetzner Restic](https://docs.hetzner.com/storage/object-storage/howto-backups/restic/).

## Variables — negen verplichte en één optionele

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

`NODE_IMAGE`, `REDIS_IMAGE` en `POSTGRES_IMAGE` zijn **geen Environment-variabelen meer**. Hun enige bron is `ops/image-pins.json`, ook eenmalig root-owned geïnstalleerd op de VPS. De manifestcontrole weigert afwijkende pins. Een upgrade vereist code-review en een bewuste operatorupdate van de geïnstalleerde pins; Redis heeft bovendien een apart onderhoudsplan nodig. PostgreSQL 17 is de werkelijk geteste major, inclusief Auth-schema, pgcrypto, RLS en migraties; contrib-extensionnamespace/versie wordt apart vastgelegd en gecontroleerd; een andere externe major stopt de backupgate.

`GITHUB_TOKEN` is automatisch, tijdelijk en jobgebonden; maak geen extra registry-PAT-secret. Geef deze repository toegang tot de private GHCR-packages. Geen serverkeys in public buildargs, image-layers, frontend of release-artifact. Het artifact bevat alleen publieke configuratie, commit/run, amd64-platform, basispins en drie immutable image-digests.

## Providerinstellingen buiten GitHub

In elk Supabase Auth-project: juiste site-URL en expliciete redirectallowlist; email-OTP met zes cijfers, 600 seconden verval en 60 seconden resendinterval. Confirmation/magiclinktemplates gebruiken `{{ .Token }}`. Configureer custom SMTP met Resend (`smtp.resend.com`, poort 465, username `resend`, geschikte SMTP/API-key, geverifieerde afzender). Supabase verstuurt OTP, de worker overige applicatiemail. Configureer SPF/DKIM/DMARC bij je DNS-provider. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

De private Turnstile-secret staat uitsluitend in Supabase Auth CAPTCHA-configuratie. Publieke sitekey/projectkey mogen openbaar zijn; serverkeys niet. `SUPABASE_ACCESS_TOKEN`, `BOOTSTRAP_OWNER_EMAIL`, SMTP-password en private Turnstile-key zijn geen extra GitHub Environment-items. Ownerbootstrap gebruikt een tijdelijk operatorbestand, buiten de gewone workflow.

Controleer in GitHub de daadwerkelijke vereiste check op een PR: de huidige standalone CI-job heet `verify`, workflow `DartsPoint CI`; de herbruikbare deploymentverificatie heet `Verify / verify`. Selecteer de bestaande check in branchbescherming; verzin geen naam. Bescherm workflowbestanden/pins met verplichte review en beperk bypass/forcepush. Labels en YAML-voorwaarden zijn geen toegangsgrens. Configureer waar beschikbaar runnergroepen voor uitsluitend deze private repository en `.github/workflows/deploy.yml` op de twee beschermde environmentrefs. Als je abonnement die beperking niet biedt, mogen alleen vertrouwde beheerders workflows/Actions en de repository beheren; is dat niet haalbaar, gebruik een aparte besloten deploymentrepository voordat je deze runners registreert. [GitHub runnergroepen](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access).
