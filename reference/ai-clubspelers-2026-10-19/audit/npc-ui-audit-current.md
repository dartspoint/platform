# Current DartsPoint UI integration audit for NPC handoff

Read-only audit of `dartspoint/platform`, pinned to `d2d95b7e2954eb99dc911cd61e70150f6360e89d` (main reference supplied by parent, dated 2026-10-18T21:58:45Z). Files below were fetched at that exact SHA through GitHub. No repository or Sites source was changed for this audit. Retrieved snapshots are in `/workspace/scratch/2c130b7c217d/npc-current-ui-reference/`.

## 1. Actual application architecture, not the older Sites mock store

- `apps/web/lib/platform-client.tsx` exports `PlatformSnapshot`, `EMPTY_PLATFORM`, `getPlatform`, `subscribePlatform`, `usePlatform`, `selfName`, `playerId`, `api`, `mutate`, `refreshPlatform`, `schedulePlatformRefresh`, and `PlatformProvider`.
- `api(path, input?)` uses same-origin authenticated GET/POST `/api/platform/${path}`, `credentials:'same-origin'`, `cache:'no-store'`. Errors become translated `ApiError(code,status,retryAfter)`.
- `mutate(path,input)` invokes the API, refreshes server bootstrap, and displays translated errors through Sonner. Reuse this mechanism for native NPC management; do not create browser-owned authoritative NPC state.
- `PlatformProvider` mounts an authenticated Colyseus personal room using the existing Supabase session, handles `chat.changed` events, coalesces refresh, polls bootstrap every 3 seconds, and sends actor activity heartbeats. NPC actions must appear through server projections/events, not fabricated browser presence or fake trusted heartbeats.
- `apps/web/lib/darts-data.ts` now exposes `players` and `rooms` as live proxies over `getPlatform()`. `playerByName` accepts either player UUID or exact name. This is unlike the Sites demo's static list and local director; do not overwrite this file with prototype data/seeds.
- `apps/web/lib/darts-social.ts` exports `getPlayerPresence`, `useDartsSocial`, `invitationReason`, `isBlocked`, `isPersonallyMuted`, `canManageRoom`, and server mutations for social/moderation/queues. `invitationReason` already blocks a human's active/reserved/paused match and targets with `playing` or `invitationAvailable===false`; expose appropriate NPC server fields so this behavior works naturally.

## 2. Existing admin navigation and access

Exact source: `apps/web/components/admin/darts-admin.tsx`.

Current `navigation` IDs, in order:

1. `overview` — Overzicht, group DE CLUB.
2. `tournaments` — Toernooien.
3. `seasons` — Seizoenen & divisies.
4. `players` — Spelers & rollen.
5. `rooms` — Kamers.
6. `moderation` — Moderatie.
7. `chat-moderation` — Chat & moderatie.
8. `game` — Spel & deelname, group HET PLATFORM.
9. `elo` — DP & competitie.
10. `lobby` — Lobby & widgets.
11. `releases` — Releasebeheer.
12. `platform` — Platforminstellingen.
13. `legal` — Juridisch en informatie.
14. `support` — Supporttickets.
15. `teamroles` — Gebruikers en teamrollen.
16. `audit` — Actielogboek.

`AdminTab` is derived from `navigation`; `titles` is a complete `Record<AdminTab,...>`; `validTab` accepts only registered IDs. Adding one NPC management tab requires updating navigation, title metadata, render branch, localized copy mapping/catalogs, command search, and initial URL routing together.

`DartsAdmin` owns `navigate(next,id?,widgetType?)`, `registerNavigationGuard`, focus restoration, mobile drawer, command search, and URL state `/beheer?tab=...`. Reuse this shell. Support/teamrole selections redirect to `/team/support` and `/team/support?view=team`; they are not NPC-capability authorizers.

`visibleNavigation` currently restricts lobby to owner, release management to owner/admin, and teamroles to `useSupportIdentity()?.canManageTeam`. An NPC tab should have an explicit owner/admin capability rule and server authorization; do not infer NPC or credential permissions from a support role.

`apps/web/app/beheer/page.tsx` renders `<DemoGate staff><DartsAdmin .../></DemoGate>`. Despite its legacy name, `apps/web/components/darts-demo-gate.tsx` is a real server auth gate: `currentActor()`, redirect unauthenticated to `/inloggen`, reject staff without `owner`/`admin`, `bootstrap(actor)`, then `PlatformProvider`. Preserve this authentication path. `/beheer/layout.tsx` already applies noindex/noarchive.

Suggested native extension (proposal, these files/functions do not yet exist in the audited sources): add `npc` tab labeled `AI-clubspelers` within the existing admin shell; put director status, roster, profile editing and activity in an `AdminNpcPlayers` component under `components/admin`. Put provider credentials/configuration in a separate `AdminOpenAiSettings` section/card reachable from existing Platforminstellingen and linked from the NPC tab. Avoid a separate full-screen admin product.

## 3. Existing settings form and secret-boundary implications

Exact sources: `apps/web/components/admin/darts-settings.tsx` and `apps/web/lib/darts-admin-settings.ts`.

Existing exports: `AdminGameSettings`, `AdminPlatformSettings`, `AdminEloSettings`.

Reusable local UI helpers in that file: `Section`, `Field`, `Toggle`, `SaveBar`, using `das-card`, `das-fields`, `das-two-column`, `das-stack`, `das-savebar`. They are currently non-exported; extract/export shared presentation helpers if a new admin module needs them instead of duplicating an unrelated design system.

`AdminPlatformSettings` sections currently are:

- Identiteit & contact: platform name, slogan, support email.
- Chat & toegang: registration open, slow mode, default private-message policy.
- Aankondiging: activation, message, live preview.
- Onderhoud: flag and player message.

`AdminSettings` has exactly `game`, `entry`, `platform`, `eloDraft`. `AdminPlatformDefaults` has public community/platform values only. There is no OpenAI key, model, budget or NPC configuration in these audited settings.

`getAdminSettings` and `useAdminSettings` read `getPlatform().settings`; `updateAdminSettings(patch,reason)` calls `mutate('settings',{patch,reason})`. Never place the OpenAI plaintext API key in this object, `PlatformSnapshot`, generic bootstrap, public projections, localStorage, sessionStorage, HTML, client env or logs. Add a dedicated server-only credential storage/write path and expose only authorized metadata (configured, last validated, masked fingerprint/status), plus non-secret settings to authorized views.

For the UI: password-style write-only replacement field; saved key is never returned/populated; separate configured/test/replace/remove states; clear transient plaintext after completion; redacted provider errors; disabled/busy/double-submit handling; persisted audit only of action/provider/fingerprint, not secret. Credential replacement/removal permissions must be checked server-side independently of whether the card is visible.

Keep model selection configurable against server-approved models; do not hardcode an unverified 'latest' model in the handoff. Controls should include enabled state, model, conversation/output limits, budget caps, usage, rate-limit/error state and test status. The director/throw engine must continue without waiting on the UI/provider response; safe silence is an acceptable chat fallback when unavailable, budget-limited or duplicate-blocked.

Important implementation pitfall visible in the source: settings forms currently reset local drafts inside `useEffect` whenever `settings.platform` / `settings.game` object identities change. Bootstrap refreshes every 3 seconds. For new NPC/OpenAI forms, use dirty-aware synchronization and server revision/concurrency checking so refresh cannot erase an unsaved key, profile edit or director draft. Integrate `registerNavigationGuard` for unsaved edits. Do not silently adopt this polling/draft overwrite pattern for new sensitive forms.

## 4. Shared player, chat and profile integration points

Exact source: `apps/web/components/darts-community.tsx`.

- `PlayersTable`: reads live `players`, `getPlayerPresence`, `useRatingProfiles`, `useDartsSocial`, `useAdminOperations`. Filters by real room membership/status; renders scores from `getPlatform().matches[*].state.scores` and match seats. Add NPCs to the same server player projection, not a second list/client merge. Existing room counts must count each NPC once and remain within capacity.
- `ChatPanel`: existing real chat channel IDs, server history, optimistic pending messages, failed/retry messages, quiet-turn deferred display, unread/read cursor and reconnection handling. Reuse it for NPC speech, via the same server-authorized chat publication service and personal projections. Do not reintroduce the demo's timer-written local messages.
- Memoized `ChatMessageRow` wraps the avatar/name with `PlayerActionMenu`, renders `PlayerName`, message text, time and delivery status. The requested public UI uses no per-message AI labels or new NPC styling here. Preserve memoization/stable row actions and existing scroll/read behavior.
- `ProfileView({name:identifier,roomName,gameId})` resolves `playerByName`, live recent form and rating; renders cover/identity, admin-only `PlayerContact`, statistics, recent form, badges, placement state, then `PlayerSocialActions`.

Requested NPC public profile extension: same existing `ProfileView`, same avatar/name/DP/statistics/actions; add age, fictional display name, city/country, biography, interests and character text for NPCs. Append a small readable `AI-clubspeler · fictief DartsPoint-personage` footer at the bottom, only when server metadata marks the actor as an NPC. No badge inside chat rows, player table, invitations, `PlayerName`, role tooltips or scoreboards. Do not put provider prompt/settings/API data in the public profile. Administrator-only full personality/behavior/scheduling details belong in the admin editor.

`apps/web/components/player-identity.tsx` exports `PlayerName` and `RatingValue`. Names already communicate roles independently from rating; VIP crown and `DivisionBadge` are present. Preserve current roles/colors and DP placement logic. AI is a separate actor type, not a privileged role and not a DP color.

`apps/web/components/player-contact.tsx` uses a separate authorized on-demand `/api/platform/admin/player-contact?userId=...` request, with role gate, abort-on-change, identity validation, no cache, denied/unavailable/retry states. For system NPCs without auth-provider account email, suppress/return no contact entry without inventing an address or making provider calls for fake credentials. Preserve this protection for human profiles.

## 5. Existing actions, invites and moderation must apply to NPCs

Exact source: `apps/web/components/darts-player-menu.tsx`.

`PlayerActionMenu` resolves `userId` or `playerId(name)`, computes social blocked/muted/friend state, and uses the same menu in room/friends/lobby/chat. Existing profile, invite, message, spectate, friendship, mute, block, report and authorized moderation actions should target the NPC's real server UUID.

On menu opening it fetches `api('moderation/capabilities?...targetId...channelId/roomId...')`; do not replace these server capabilities with client flags or give NPCs human moderation privileges. Existing permission-aware disable reasons from `invitationReason` should reflect reserved/playing/unavailable NPCs.

`apps/web/components/darts-incoming-invites.tsx` exports `IncomingInvites`, which reads `p.invites`, selects pending invitee records, disables controls while busy, submits `mutate('invite/respond',{inviteId,action})`, and navigates to `/spelen?match=${matchId}`. Reuse it for NPC invitations; no second modal, separate client-only link, or special bypass to start a match. Preserve explicit practice/DP selection and rules summary without changing game settings after acceptance.

## 6. Preserve the existing 50:50 workspace exactly

Exact sources: `apps/web/components/darts-workspace.tsx` and `apps/web/components/darts-desktop.css`.

- `useDesktopWorkspace`: desktop breakpoint is 1024 CSS pixels.
- `DesktopCommunity`: right-hand tree intentionally remains mounted as the left match changes phases. Top section has room `PlayersTable` left and `FriendsPanel` right; bottom has `ChatPanel`.
- `RoomCommunity`: left-side `RoomLobbyFeed`, existing profile and tournament dialogs, optional owner management link.
- `PracticeWorkspace`: keeps `DartsPractice` at a stable tree position when crossing responsive breakpoint, and reuses `DesktopCommunity` on desktop. Existing comments document that responsive remount could trigger resets/late responses; preserve this behavior.
- `.is-desktop-workspace .dp-workspace` and `.dp-lobby-fixed>.dp-workspace` use `grid-template-columns:minmax(0,1fr) minmax(0,1fr)`.
- `.dp-desktop-community-top` itself has two equal tracks. Lists/history own scroll. Do not move the new director/admin controls into the player's game workspace or replace these proportions.
- NPC roster/director management belongs in the existing admin shell; native presence/messages/invites appear in existing player surfaces. New player-side controls must not make the board or chat remount or block the throw input path.

## 7. i18n, accessibility and acceptance requirements for the handoff

- Audited admin/settings/community/player/workspace components use `useI18n` with module namespaces and existing static-copy catalogs. Add NL and EN keys in the real repo catalog/loading route system, not another prototype-only language store.
- Preserve `formatLocale` / `formatLocales` formatting and readable country/language metadata; current `room-metadata.tsx` already exports `RoomBadge`, `RoomMetadataEditor`, `RoomMetadataFilters`, `matchesRoomMetadata`, `regionName`.
- Preserve focus on menu/modal close and save navigation, reduced motion, keyboard access, mobile admin drawer, status/error aria-live and functional retries.
- Verify native flow: roster profile → existing player context menu → practice/DP invitation → existing accept → server match → real scoring → single result/DP projection; mutual NPC matches and profile statistics must match the same records.
- Verify public footer only in every place `ProfileView` is opened, no accidental AI label injected by shared identity components. Existing human profile/contact privacy must remain intact.
- Verify non-staff direct admin requests fail server authorization; no credential fields in bootstrap, public player/profile/chat projection, audit/error body or exported artifacts.
- Verify two staff sessions editing director/profile/settings do not overwrite each other or reset drafts during bootstrap refresh; pause changes schedule future activity while active games finish.

## Summary for root

Actual repo is a live authenticated projection/API/Colyseus application. Sites demo NPC source cannot be copied over its state stores. Preserve shared UI trees and components; extend native server entities and projections. Exact insertion points are `DartsAdmin` navigation/render/guard, `AdminPlatformSettings` reusable settings styles with separate credential endpoint, `ProfileView` NPC fields/footer only, and live player presence/chat/invites in existing `PlayersTable` / `ChatPanel` / `IncomingInvites`. The audited files contain no current NPC implementation or OpenAI settings.
