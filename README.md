# DartsPoint

Native Next.js frontend, authoritative Colyseus game server and durable PostgreSQL worker. The Afterhours components, fonts and assets come from source SHA `f57c505709e317d457de447f00c822c270edcdaf`. The immutable handoff remains in `reference/handoff/`; it is excluded from deployment images.

## Local development

Use Node **24.18.0**, npm and Docker. Install the exact locked packages with `npm ci`. The Supabase CLI is a pinned development dependency; no global installation is required. On this development host Docker uses `DOCKER_HOST=unix:///run/user/1001/docker.sock`.

```bash
npm ci
npm run local:setup
npm run dev
```

Open `http://127.0.0.1:4300`. Actual six-digit OTP emails arrive in the local Mailpit inbox at `http://127.0.0.1:62424`. PostgreSQL, Auth, Redis and email capture are real local services. Registration creates a normal player with provisional 1500 Elo. No sample friends, matches, owner or competitions are seeded. The initial community rooms are configuration, not fictional activity.

The setup script creates ignored `0600` `.env.local` files with local provider keys, a randomly generated application database password and an internal deploy token. App migrations use an advisory lock and recorded SHA-256 checksums. The Supabase CLI's automatic application migrations are disabled. Existing `.env.local` files are reused; do not run `configure-local.mjs` against running application processes, since it rotates their local database password and token.

Ports: web `4300`, realtime `42567`, Supabase API `62421`, PostgreSQL `62422`, Mailpit `62424`, Redis `62479`. Published local service ports bind to loopback. `scripts/bind-local-services.py` changes only the three containers belonging to `dartspoint-development`; other projects are preserved.

`npm run dev` starts web, realtime and worker, waits for real readiness and explicitly opens admissions. A new Redis installation defaults to closed admissions until this succeeds. Individual commands are `npm run dev:web`, `npm run dev:realtime`, and `npm run dev:worker`. Stopping the app preserves provider/database volumes. Stop only this provider with `node_modules/.bin/supabase stop` from this repository if required.

## Verification

With the local app running:

```bash
npm run verify:ci
node_modules/.bin/playwright install chromium
npm run test:integration
python3 scripts/check-local-bootstrap.py
python3 tests/integration/containers.py
```

The acceptance suite creates clearly named, verified **local QA accounts** through the real Auth provider. It exercises OTP lifecycle and provider failure, two actual browsers and a spectator, a complete ranked match, authoritative impacts and exactly-once Elo, practice, rooms, private messages, roles, tournament planning, divisions, recovery, queues, isolated owner bootstrap, database restore and drain. The auth outage test briefly stops and restarts this project's local Auth container. Run the acceptance suites sequentially. The container check builds all three production images and briefly starts separate local containers; its local transport adapter is a test fixture outside the images.

Screenshots and private diagnostics stay in ignored `artifacts/`. No cookies, OTPs, connection strings, provider logs or database dumps are uploaded by CI. [Local acceptance](docs/LOCAL-ACCEPTANCE.md) records actual evidence and the external staging gates. [Traceability](docs/traceability.csv) maps the functional requirements to their adapters, storage and checks.

## Architecture and integrity

`packages/game-core` contains the original pure geometry, scoring, Elo, bracket and division rules. The server derives hit coordinates from its phase timestamps; clients send only UUID commands, the expected state version and phase token. A sealed throw does not change the score until its durable impact. PostgreSQL receipts, event sequences, writer fencing and unique result/ledger constraints survive retries and restarts. A lost writer pauses play and requires both players to resume. Administrative results create audited competition decisions without ordinary Elo or invented performance statistics.

The backend verifies Supabase sessions, account status and current roles at every boundary. Revoked session IDs are rejected immediately. UUIDs own data; display names never authorize actions. Anonymous database access is denied and browser data uses RLS. Database application credentials have no superuser or RLS-bypass privilege. Owner creation is an explicit one-time CLI action after verified OTP onboarding; see [staging setup](docs/GITHUB-STAGING.md).

## GitHub and deployment

`main` runs hosted CI and **does not deploy**. A merge to protected `staging` or `production` deploys that exact commit using its corresponding GitHub Environment and dedicated self-hosted runner. Hosted runners perform acceptance and publish all three amd64 images to GHCR by digest. Each environment builds its own public URLs and Supabase client key into the frontend. The self-hosted runners only deliver a public manifest to installed, root-owned helpers. Staging and production share one target VPS with separate app/runner accounts and rootless Docker daemons.

Configure [staging](docs/GITHUB-STAGING.md) and [production](docs/GITHUB-PRODUCTION.md) using the [Environment inventory](docs/GITHUB-ENVIRONMENTS.md), then follow the [one-time host installation](ops/HOST-INSTALLATION.md) and [backup/recovery contract](ops/README.md). Hetzner S3 stores the encrypted Restic repository; AWS-named keys contain Hetzner credentials. Deployments verify a real encrypted offsite backup and restore, drain existing games for up to twenty minutes, apply only compatible expand migrations, and check all three services at the same release SHA. A timeout aborts deployment and retains the running release. Rollback restores images and configuration without downgrading the database.
