# DartsPoint NPC / OpenAI key integration audit — current repository

Read-only source audit of dartspoint/platform pinned to d2d95b7e2954eb99dc911cd61e70150f6360e89d (2026-10-18). No production configuration, actual env files, real secrets, databases, or provider credentials were read. No repository mutation, API-key provisioning, API request, deployment, or test execution was performed.

## Critical findings

1. Never put an API key (even encrypted ciphertext) into AdminSettings or private.system_settings[key='settings']. packages/data/src/projections.ts bootstrap() unconditionally selects that entire data object and returns it as settings to every authenticated player, not just staff (approximately lines 49 and 58). That object is a client projection by design.
2. Existing saveSettings() is owner-only: packages/data/src/settings.ts line 7 calls staff(actor,true). packages/data/src/auth.ts defines staff(actor,true) as exactly owner; plain staff(actor) accepts owner and admin. Do not broaden the existing settings handler merely to add the integration.
3. Actor.role only has owner/admin/vip/player. The newer support roles are separate: tournament/chat/game/platform, defined in packages/contracts/src/support.ts. A support platform role is not an Actor.role.
4. No reusable encryption or encrypted server-secret facility was found in the inspected production packages/data/src files or deployment configuration. Existing API credentials are environment variables. INTERNAL_DEPLOY_TOKEN, SUPABASE_SECRET_KEY, RESEND_API_KEY and webhook signing material serve different purposes and must not become encryption master keys.
5. apps/worker/src/worker.ts serially awaits impact settlement, practice settlement and lifecycle maintenance inside a 50 ms loop. Never await an OpenAI network call in that loop: provider latency would delay authoritative gameplay maintenance.

## Actual extension points

| Concern | Existing source / behavior |
| --- | --- |
| Settings validation | packages/data/src/settings-model.ts: four typed sections, defaults, bounds checks; no integrations or secrets |
| Settings mutation | packages/data/src/settings.ts: strict Zod input, owner gate, transaction, row lock, version increment, audit metadata |
| Admin UI | apps/web/components/admin/darts-settings.tsx: AdminPlatformSettings; apps/web/components/admin/darts-admin.tsx: navigation and tab mounting |
| Client settings adapter | apps/web/lib/darts-admin-settings.ts: duplicated browser-safe settings types; updateAdminSettings calls mutate('settings', ...) |
| API boundary | apps/web/app/api/platform/[...path]/route.ts: Node runtime, dynamic rendering, no-store/private response headers, currentActor authentication, trusted-origin POST check, strict JSON dispatch |
| Error handling | Same route: domain/validation codes and localized messages; unknown failures log a fixed event and return a generic 503 |
| Auth | packages/data/src/auth.ts: actorById/loadActor, verified provider identity, fresh profile/role/sanction/session state per request |
| Audit | packages/data/src/db.ts: audit(c, actorId, action, subject, data, reason) writes private.audit_events; admin projections expose these records, so metadata only |
| Recent reauth | packages/data/src/privacy.ts: hasRecentReauthentication checks verified session and private.privacy_reauths, valid 10 minutes; reusable sensitive-operation pattern |
| Rate limits | packages/data/src/db.ts: Redis-backed rateLimit(key, limit, seconds) |
| Support roles | packages/data/src/support.ts: supportCapabilities and supportFreshIdentity; private.support_roles_for returns explicit support roles plus platform for legacy owner/admin |
| Private-table policy pattern | supabase/migrations/20261015133111_support_tickets_team.sql: private schema, RLS, revoked PUBLIC/anon/authenticated grants, dartspoint_app-only policies |

## Permissions recommendation

Preserve the owner-only default for credentials. If delegated platformbeheer access is required, introduce one explicit capability such as integrations.manage / can_manage_integrations, grantable by the owner and valid only alongside an active platform support role. Do not infer this capability from admin, chat, game, tournament, canManageTeam or ticket access. The support-role SQL currently automatically returns platform for legacy admins, so checking only roles.includes('platform') would grant every existing admin credential-management rights.

Implement a dedicated canManageIntegrations server check, fresh on every read/save/test/rotate/delete request. Return 401/403 appropriately to anonymous users, players, chat/game/tournament staff and delegated platform staff without the capability. UI hiding is supplementary. Reuse the recent-auth pattern for key mutations and credential tests; do not weaken existing privacy reauthentication.

## Proposed storage and API design

- Add a dedicated private integration-secret table, not a public/client projection. Store ciphertext, fresh random nonce, authentication tag, key version, secret version, creation/update timestamps, updater ID and non-secret test status. Optional display: last 4 characters, never the full key.
- Use authenticated encryption, e.g. AES-256-GCM, with a dedicated randomly generated 32-byte master key supplied only through the server runtime environment. Bind ciphertext to provider/record/environment/version as authenticated additional data. A fresh nonce is required for every encryption. Keep master-key IDs for controlled re-encryption rotation.
- Staging and production must have different master keys. Backups contain ciphertext; master-key backup/recovery must be separate. Missing or wrong master key disables AI safely rather than exposing data or blocking gameplay/readiness.
- Expose dedicated routes under the existing platform API, e.g. GET admin/integrations/openai for status only; POST admin/integrations/openai/save, /test, /rotate and /delete. These route names are proposed, not existing.
- Reuse no-store responses, currentActor, trusted-origin check, bounded strict input and server authorization. On writes use a secret-version precondition and transaction/row lock; stale forms cannot overwrite a later rotation.
- Save returns only configured/masked/version/updatedAt/lastTestStatus. No read/decrypt endpoint, reveal button, client persistence, bootstrap addition or user-visible network response containing the plaintext.
- After save/rotation clear the input and sensitive request state. Browser password field is blank on open; a masked existing value is separate display text, never submitted back as a replacement.
- Test against a fixed official provider endpoint from the server with strict timeouts, an explicit cost limit, rate limiting, sanitized responses and redirect rejection. No arbitrary base URL from the form. Store only categorized results such as valid/invalid/permission/rate-limit/provider-unavailable plus timestamp and secret version. A test result for an older secret version must not mark a newer key valid.
- Rotation must not erase a working key if replacement validation fails. Delete immediately stops new provider requests and invalidates secret caches; it does not imply revocation of the provider-side key, which is a separate operation.
- Audit save/rotate/delete/test with actor, provider, secret version, status and reason only. Never record key values, ciphertext, bearer headers, raw upstream error bodies or request bodies. ops/retained-log.mjs retains child stdout/stderr text; it is not a secret-redaction guarantee.
- Worker reads/decrypts only server-side; short-lived versioned cache and invalidation after rotation/deletion. Never send the key in Redis jobs, NPC configuration, chat context, serialized errors, browser state or logs.

## Deployment conventions and required documentation

- ops/environment.example lists the current GitHub Environment contract; there is no master key or OpenAI key.
- .github/workflows/deploy.yml uses staging and production GitHub Environments. It supplies existing secret names in BOTH configuration preflight and runner delivery. Adding a runtime master-key secret requires consistent additions in these two places; never as NEXT_PUBLIC, Docker build ARG, manifest, image layer or artifact.
- ops/scripts/deployment_config.py maintains exact field allowlists (SECRETS, PRIVATE_FIELDS, validate_values). Add the master-key field and strict validation there. Do not add it to PUBLIC.
- ops/scripts/prepare-release.py creates role-specific web.env, realtime.env, worker.env, migration.env and backup.env via write_env with mode 0600. Web needs encryption for form saves/tests; the AI worker needs decryption. Realtime/migration/backup do not need this key.
- ops/compose.target.yml reads raw role env files under the existing rootless deployment. Support currently shares worker.env. If a dedicated NPC process is added, use a separate npc.env to avoid giving support unrelated integration credentials.
- A separate NPC process may reuse the reviewed worker image, analogous to the support process, avoiding a new image-service manifest category. This still needs explicit health/log/deploy handling; it is a proposal.
- The target VPS never checks out/builds source. Keep pinned images, rootless Docker, branch-to-environment routing and isolated staging/production intact.
- Missing OpenAI credentials must leave NPC language generation disabled/paused while core platform/game services continue operating. Do not provision a key in this documentation-only handoff.

## Regression gates

Existing runtime is Node 24.18.x: package.json engines says 24.18.x and CI setup uses 24.18.0 plus reviewed ops/image-pins.json image. Reproduce any operator-database issue on that exact runtime; this audit did not reproduce or diagnose a new runtime failure.

Preserve: npm ci; npm run typecheck; npm test; node scripts/check-original-rules.mjs; npm run build:deploy; python3 ops/scripts/check-ops.py; python3 scripts/check-source-parity.py; actionlint; Caddy validation; scripts/ci-integration.sh and tests/integration/deployment-infrastructure.py. Do not activate or generalize the existing exact-SHA test-skip exception for this work.

tests/unit/operator-database.test.ts covers operator DATABASE_URL normalization to Supabase session port 5432 and verified TLS, rejects TLS downgrades/unreviewed SSL options and checks credential-free error text. Keep it passing; the integration must not introduce credentials into errors or relax the reviewed database contract.

Add meaningful tests for: encryption round trip/tamper/wrong master key; rotation and concurrent stale writes; configured/status endpoint no secret; no key/ciphertext in bootstrap/public projections/audit/logs; direct HTTP permission denials for every non-entitled role; recent-auth expiry; origin/body/rate bounds; stubbed provider success, invalid key, permission error, timeout and 429; secret-version test races; deletion/cache invalidation; environment isolation; missing master key safely disables AI only. Use provider stubs and fixture keys in automated tests, never production OpenAI calls.

Run existing gameplay/chat/auth/internationalisation/support/release tests after the change. Specifically preserve the serial game-timing and render-sample timing gates and their original thresholds; an AI outage or slow response must not delay throws, settlement or room/chat actions.

