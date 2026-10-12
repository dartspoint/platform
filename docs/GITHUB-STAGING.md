# GitHub staging instellen

Maak in `dartspoint/platform` onder **Settings → Environments** de environment **`staging`**. Onderstaande namen komen exact overeen met `.github/workflows/deploy.yml`. Gebruik uitsluitend credentials van het aparte stagingproject. Voeg echte waarden via de GitHub-interface toe; zet ze niet in Git, chat of een workflowbestand.

## Environment secrets — negen verplicht

| Naam | Waarde en herkomst |
|---|---|
| `SUPABASE_SECRET_KEY` | Supabase **staging** serverkey (`sb_secret_…`), Project Settings → API Keys. |
| `DATABASE_URL` | Postgres-connectionstring van een aparte applicatielogin die lid is van `dartspoint_app`. Geen superuser, geen `BYPASSRLS`. Directe verbinding of session pooler, poort 5432; eindigt op `?sslmode=verify-full`. |
| `MIGRATION_DATABASE_URL` | Afzonderlijke geprivilegieerde Postgres-login voor schema's, functies, rollen en migraties; bijvoorbeeld de stagingdatabasebeheerder. Direct/session connection, TLS en certificaatcontrole. |
| `RESEND_API_KEY` | Resend-key met verzendrechten voor het geverifieerde stagingmaildomein. Applicatiemail wordt door de worker verzonden. |
| `INTERNAL_DEPLOY_TOKEN` | Minimaal 32 willekeurige bytes, base64url zonder padding: ten minste 43 tekens. Genereer lokaal met `openssl rand -base64 32`, zet `+`/`/` om naar `-`/`_` en verwijder padding/newline. Behoud dezelfde waarde in de huidige en volgende release tijdens deployment. |
| `RESTIC_PASSWORD` | Sterk uniek wachtwoord van de versleutelde stagingbackuprepository. Bewaar ook in de eigen wachtwoordkluis; zonder dit wachtwoord zijn backups onleesbaar. |
| `AWS_ACCESS_KEY_ID` | S3-compatibele access key voor de externe stagingbackupbucket. |
| `AWS_SECRET_ACCESS_KEY` | Bijbehorende S3-secret. Bucketrechten voor backup, lezen en restore; geen accountbrede sleutel nodig. |
| `BACKUP_DATABASE_URL` | Afzonderlijke TLS-connectionstring van een login die een volledige `pg_dump` kan maken: databasebeheerder of expliciete backuprol met de benodigde rechten om RLS volledig te dumpen, plus toegang tot `auth`, `public`, `private` en `dartspoint_migrations`. De gate exporteert een consistent snapshot en herstelt een echte dump. Deze credential gaat uitsluitend naar het backupgereedschap. |

URL-encode bijzondere tekens in databasegebruikersnamen en wachtwoorden. De driver controleert servercertificaten ook wanneer de URL `sslmode=require` gebruikt; `verify-full` maakt die bedoeling expliciet. Controleer dat de stagingdatabase PostgreSQL 17 gebruikt, de hier geteste versie; een andere major vraagt eerst een passende gereviewde dump/restore-image en acceptatie. Gebruik geen transaction pooler voor deze langlopende backend- en migratieverbindingen. Een IPv4-host kan de session pooler gebruiken als het directe endpoint IPv6 vereist. Zie de [Supabase verbindingsdocumentatie](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Environment variables — elf verplicht, één indien nodig

| Naam | Waarde |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://staging.dartspoint.nl` |
| `NEXT_PUBLIC_REALTIME_URL` | `https://realtime.staging.dartspoint.nl` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<staging-projectref>.supabase.co`, de kale origin van het stagingproject. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publieke stagingkey (`sb_publishable_…`) uit Supabase API Keys. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Publieke Cloudflare Turnstile-sitekey voor `staging.dartspoint.nl`. |
| `NODE_IMAGE` | Exacte `NODE_IMAGE` uit `ops/image-pins.json`. |
| `REDIS_IMAGE` | Exacte `REDIS_IMAGE` uit `ops/image-pins.json`. |
| `POSTGRES_IMAGE` | Exacte `POSTGRES_IMAGE` uit `ops/image-pins.json`; gebruikt voor dump en geïsoleerde restore. |
| `MAIL_FROM` | Bijvoorbeeld `DartsPoint staging <noreply@staging.dartspoint.nl>`, nadat dit verzenddomein in Resend is geverifieerd. |
| `MAIL_REPLY_TO` | Het gekozen, bewaakte supportadres. |
| `RESTIC_REPOSITORY` | `s3:https://<externe-S3-endpoint>/<bucket>/<staging-pad>`. Werkelijke offsiteopslag; niet deze VPS. |
| `DATABASE_CA_CERT_BASE64` | Optioneel bij een publiek vertrouwde CA; nodig als het databasecertificaat een eigen/provider-CA vereist. Download de CA uit Supabase Database Settings en base64-encode het PEM-bestand op één regel, bijvoorbeeld `base64 -w0 database-ca.crt`. Dit is een publiek CA-certificaat, geen private key. |

De volledige gereviewde imagewaarden staan in het kleine JSON-bestand; kopieer de strings inclusief `@sha256:…`. Verander een Redis-digest via apart onderhoud, niet tijdens een gewone applicatiedeploy. Publieke frontendwaarden worden per environment ingebakken. De lokale `.env.local` bevat uitsluitend ontwikkelcredentials en is geen bron voor staging.

## Providerinstellingen buiten GitHub

Configureer in **Supabase Auth** de site-URL `https://staging.dartspoint.nl`, alleen de gebruikte stagingredirects, emailaanmelding met zes cijfers, OTP-vervalduur **600 seconden**, resendinterval **60 seconden** en CAPTCHA met Turnstile. Zet in de confirmation- en magiclink-emailtemplates `{{ .Token }}` in plaats van een inloglink. De bestaande HTML staat in `packages/emails/templates/` en de Supabaseconfig verwijst naar de lokale OTP-templates.

De **private Turnstile-secret** hoort in Supabase Auth CAPTCHA-instellingen, niet in `NEXT_PUBLIC_*` en niet als extra GitHub-secret in deze workflow. Configureer daar ook custom SMTP: Resend `smtp.resend.com`, gebruikersnaam `resend`, poort `465`, wachtwoord een geschikte Resend-API-key en de geverifieerde afzender. Supabase verstuurt OTP; de worker verstuurt overige applicatiemail. Verifieer SPF/DKIM en het gewenste DMARC-beleid. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend/Supabase](https://resend.com/docs/send-with-supabase-smtp).

`SUPABASE_ACCESS_TOKEN`, `BOOTSTRAP_OWNER_EMAIL` en een SMTP- of Turnstile-secret zijn **geen benodigde GitHub Environment-items** voor deze workflow. Ownerbootstrap is een eenmalige operatorhandeling, geen deploymentseed.

## Runner, eerste database en eerste release

`main` draait hosted CI. Een push/merge naar `staging` start de deployment voor exact die commit, op een aparte runner met labels **`self-hosted`, `Linux`, `X64`, `dartspoint-staging`**. Beperk de environment tot branch `staging`; bescherm die branch met review en de CI-check `DartsPoint CI / verify`. Geef nooit pull requests toegang tot deze runner. Production krijgt een eigen VPS/project/runner/environment.

Provision Docker, Compose ≥2.30, Python 3, git, native Caddy en Restic op die staginghost. Provision `/opt/dartspoint/staging` runner-owned met modus `0700`; installeer de gereviewde backuphook en restorehelper zoals beschreven in `ops/README.md`. Maak de twee staging-DNS-records, voeg uitsluitend de bijbehorende Caddy-siteblocks toe en verifieer HTTPS/WebSocketverbindingen. Initialiseer de externe Restic-repository bewust met de backupcredential via een privé operatoromgeving (`restic init`); zet geen credentials op de commandline.

Een **lege Supabase-database** heeft nog geen DartsPoint-tabellen en kan de domeinbackupgate nog niet doorlopen. Bootstrap daarom eenmalig, vóór openstelling: bouw de gereviewde workerimage; voer `node scripts/migrate.mjs --expand-only` in die image uit met een tijdelijk `0600` migration-envbestand; maak met de databasebeheerder de aparte `LOGIN NOSUPERUSER NOBYPASSRLS` applicatierol en `GRANT dartspoint_app TO <app-login>`. Verbind de publieke applicatie pas nadat de normale backup/deploy/readinessgate slaagt. De migratierunner registreert checksums; gebruik geen Supabase CLI automatische applicatiemigraties. Migrations maken alleen kamerconfiguratie aan, geen accounts, fake resultaten of owner.

Na OTP en onboarding van de echte owner: verkrijg de Auth-UUID uit het stagingproject. Maak buiten de checkout een tijdelijk `0600` bestand met de al gebruikte server-/app-DB-configuratie en `APP_ENV=staging`, `BOOTSTRAP_OWNER_USER_ID=<UUID>`, `BOOTSTRAP_OWNER_EMAIL=<geverifieerd-emailadres>`, `BOOTSTRAP_OWNER_CONFIRM=staging:<UUID>`. Start de gereviewde workerimage met dat envbestand en command `node scripts/owner-bootstrap.mjs`. De CLI verifieert email, UUID en voltooid profiel bij Auth, neemt een exclusieve lock, schrijft een audit en weigert herhaling of een bestaande owner. Verwijder het tijdelijke bootstrapbestand daarna. Geef andere beheerders vervolgens rollen via de owner-UI.

De live stagingrelease blijft een afzonderlijke acceptatiestap: echte domeinen, CAPTCHA, externe SMTP, S3-backup/restore, runner en rollback moeten met deze stagingcredentials worden bewezen. De lokale acceptatie gebruikt echte lokale services, zonder toegang tot die externe accounts.
