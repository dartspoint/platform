# 05 — Database, API's, rechten en migratie uit Sites

Status: **bouwcontract voor de development-VPS**. Dit document specificeert wat Codex moet implementeren en bewijzen, niet wat het huidige prototype al veilig server-side doet. Gecontroleerd op 12 oktober 2026. Het ontwerp sluit aan op de exacte UI uit het meegeleverde bronarchief.

## 1. Gegevensgrenzen

De productiebron is PostgreSQL in een apart Supabase-project per omgeving. Supabase Auth beheert alleen de authidentiteit, verificatie en sessies. Het DartsPoint-profiel verwijst naar `auth.users.id`. Colyseus maakt **geen tweede losstaand accountsysteem** aan. Redis is voor vluchtige coördinatie; browseropslag uitsluitend voor voorkeuren, lokale concepten en toegestane oefensessies.

De huidige code gebruikt namen zoals `Nick`, vaste match-ID `83626`, seedspelers en lokale stores. Die zijn demonstraties. Productie gebruikt onveranderlijke UUID's en een aparte unieke leesbare game sequence. Verwijder de prototype-shortcuts uit alle live autorisatie. De visuele labels, kleuren, layout, animaties en componenten blijven behouden.

Publiceer alleen een allowlist-projectie voor marketing: openbare nickname, toegestane avatar/badge, Elo, aggregate spelstatistieken, gepubliceerde eventtekst/data en divisieklassement. Geen e-mail, auth-ID als trackingveld, privéberichten, IP, sanctionsnotities, interne audit of geheime roomopties. Ownerbeheer moet ook in de API beschermd zijn als iemand de URL rechtstreeks intypt.

## 2. Databaseconventies

- UUID-primary keys, `timestamptz` voor tijdstippen, UTC-opslag; toon en plan standaard in `Europe/Amsterdam`. Sla bij terugkerende/planningsregels de bedoelde tijdzone apart op en test zomer-/wintertijd.
- Numeric voor Elo (bijvoorbeeld `numeric(16,8)`), niet integer. Afronden alleen in de UI. Bestaande TypeScriptformule is de referentie; kies en test één consistente afronding bij databasewrites zodat A+B gelijk blijft.
- Elke mutabele domeinaggregate heeft `version`, `created_at`, `updated_at`; belangrijke overgangen hebben een actor en reden.
- Identityvelden, rollen, scoretotalen, winner en ranking staan niet in door gebruikers vrij wijzigbare JSON-metadata.
- JSONB is geschikt voor een immutable geversioneerde regelssnapshot, presentatievoorkeuren en gecontroleerde eventpayload. Gebruik relationele sleutels/constraints voor lidmaatschap, Elo, exclusieve reserveringen en rechten.
- Alle user-facing tabellen hebben expliciete grants en RLS. Voor gevoelige interne tabellen: apart schema, geen browsergrants. Een tabel met alleen “RLS aan” maar onbedoeld ruime policy is niet voldoende.
- Indexeer foreign keys en veelgebruikte filters; pagineer op cursors in plaats van complete chat- of matchhistorie te laden.
- Verwijderen van een account mag geen wedstrijdledger of auditeerbaar competitieresultaat cascade-wissen. Gebruik gecontroleerde pseudonimisering waar behoud nodig is; definieer een bewaarbeleid vóór livegang.

## 3. Entiteiten en invarianten

### Identiteit, profiel en voorkeuren

| Tabel | Belangrijkste velden | Regels |
|---|---|---|
| `profiles` | `id` FK auth.users, `username`, `username_key`, avatar, country, `onboarded_at`, `status`, `session_version` | Username pas na succesvolle OTP; unique canonical key; actieve complete profiel vereist voor spelen |
| `profile_private` | profiel-ID, privacy-/notificatie-instellingen, accountactiestatus | Alleen eigenaaraccount en strikt noodzakelijke backendtoegang; e-mail niet dubbel publiek opslaan |
| `user_roles` | user-ID, rol, granted_by/at, revoked_at | Alleen server/bevoegde owner wijzigt rollen; geen self-promotion |
| `vip_entitlements` | user-ID, starts_at, ends_at, source, status | VIP is een voordeel/badge, geen moderatorpermissie; effectieve naamkleur volgt owner > admin > VIP > speler |
| `player_ratings` | user-ID, rating=1500, ranked_played=0, policy_version | Browser kan niet schrijven; distinct-opponentcount afgeleid uit bevestigde results |
| `player_opponents` | user-ID, opponent-ID, first_ranked_match_id | Unique `(user_id, opponent_id)`; geen zelftegenstander |
| `preferences` | user-ID, schema_version, gevalideerde voorkeuren | Alleen eigen rij, allowlist van bestaande UX-voorkeuren |
| `notifications` | user-ID, type, veilige payload, read_at | Alleen eigen notifications; geen willekeurige user-ID als ontvanger vertrouwen |

Usernamepolicy uit de accountflow centraal afdwingen: trimmen, exact `[A-Za-z0-9_-]{3,20}`, lowercase unieke `username_key` en dezelfde gereserveerde namenlijst als het prototype. Geen Unicode- of locale-afhankelijke alternatieve normalisatie toevoegen. UI-check is alleen feedback; de unieke databaseconstraint beslist bij twee gelijktijdige claims. `onboarded_at` en username worden in één transactie vastgezet. Een account zonder nickname mag de keuze hervatten, maar krijgt geen room-/matchtoegang. Nicknamewijzigingen later zijn een expliciete productfunctie met audit/history; ze veranderen nooit de identiteit of rechten.

### Sociale relaties, toegang en berichten

| Tabel | Doel | Belangrijke constraints |
|---|---|---|
| `friend_requests` | pending/accepted/rejected/cancelled met sender/recipient | Geen self-request; één effectief pending verzoek per canoniek accountpaar; ontvanger mag accepteren/weigeren, verzender annuleren |
| `friendships` | Twee geordende account-ID's | Unique/PK `(user_low, user_high)`, `user_low < user_high`; verwijderen door één van beide |
| `user_blocks` | Blokkeerrelatie | PK `(blocker_id, blocked_id)`, ongelijk; lezen/schrijven eigen blockerzijde |
| `personal_mutes` | Eigen demping | PK `(user_id, muted_id)`; geen globale sanctie |
| `channels` | `private`, `community`, `match` plus context-FK | Precies één passende context; privépair key uniek |
| `channel_memberships` | channel/user, rol, joined_at, left_at, last_read_cursor | Toegang uit serverdomein; privéconversatie heeft exact twee gerechtigde accounts |
| `chat_messages` | channel-ID, sender-ID, seq, body, created_at, redacted_at | Unique `(channel_id, seq)` en `(sender_id, client_message_id)`; plain text; bodylimiet |
| `chat_preferences` | user/channel, closed_at, pinned, notification_mode | Alleen eigen rij; tab sluiten verandert geen channelmembership/historie |
| `chat_reports` | reporter, message-ID, category, status, assigned_to | Gemeld bericht wordt server-side opgezocht; geen vervalste clientcontext als bewijs |

Gebruik geordende UUID-paren voor vriendschap/DM, niet twee vrije usernames. Een constraint of gecontroleerde functie bewaakt dat een privéchannel exact twee deelnemers heeft; maak geen generieke browser-API waarmee de derde gebruiker zichzelf toevoegt. Blokkeren annuleert pending verzoeken en stopt toekomstige uitnodigingen/DM-verzending in beide richtingen. Bestaande berichten worden daardoor niet stilzwijgend gewist.

`everyone/friends/nobody` geldt voor nieuwe gesprekken. Een bestaand gesprek kan volgens bestaand UX-beleid hervat worden zolang geen blokkade of sanctie geldt. Persoonlijke mute is lokaal ontvangstgedrag; servermute is schrijfverbod. Toon in de UI het verschil. Een gesloten privétab blijft gesloten bij een nieuw bericht; inbox/unread verandert wel. Berichthistorie en concept blijven behouden.

### Kamers, uitnodigingen en wedstrijden

| Tabel | Doel en sleutelregels |
|---|---|
| `community_rooms` | Name, slug, beschrijving, categorie, status, capacity standaard50, ratingvoorwaarden, regels; bezetting is afgeleid |
| `room_memberships` | User/room, joined/left, player/spectatorstatus, connectionlease; één actieve gekozen communitykamer per account |
| `room_moderators` | Scope room/user; alleen bevoegd beheer kan toekennen |
| `game_invites` | Inviter/invitee, immutable rules snapshot, ranked, expires_at, state; accept alleen door ontvanger, idempotent |
| `matches` | UUID, unique `game_number`, room, mode, rules/version, lifecycle, winnaar/resultaatsoort, start/einde, state_version, writer_fence |
| `match_players` | Match/user, seat0/1, joined/ready; unique `(match_id, seat)` en `(match_id,user_id)` |
| `active_player_reservations` | `user_id` PK → match-ID + lease/fence; voorkomt tegelijk meerdere competitieve partijen |
| `match_snapshots` | Match-ID, laatste volledige officiële state, eventcursor, checksum, schema_version |
| `match_commands` | Match/actor/command-ID, payloadhash, ontvangst, commitversie; identieke retries leveren dezelfde receipt |
| `match_events` | Match/sequence PK, kind, actor, immutable payload, server_at, rules_version |
| `match_darts` | Match/dart-ID, speler, leg/visit, x/y door server, label/score, credited, bust, pending/impacted, impact_at |
| `match_results` | Eén finale per match, outcome/reason, winner-ID, final_version, result_hash |
| `rating_ledger` | Match/user unique, before/after/delta, policy_version, result reference; geen direct editpad |
| `match_statistics` | Afgeleide totals/averages/checkouts/180's; alleen gecommitteerde events, aparte filters per mode |

Er zijn precies twee verschillende spelers in een match voordat hij start. De database voorkomt dubbele actieve spelersreservering; een losse `if (!activeMatch)` in Node is daarvoor niet voldoende. Matchrules worden na beide acceptaties immutable. Resultaatsoorten omvatten gespeeld, opgave, disconnectverlies, pre-start-no-show, bye, abandoned, systeem-invalidatie en administratieve correctie; behandel ze bewust bij Elo/statistieken.

### Toernooien, seizoenen en planning

| Tabel | Doel/invariant |
|---|---|
| `tournaments` | DartsPoint organisator, knockout/double-elimination, publicatiestatus, timing/deelname/rules snapshot, version |
| `tournament_entries` | Toernooi/user unique, registratie/wachtlijst/goedkeuring/check-in/withdrawn, seed, accepted_rules_version |
| `tournament_nodes` | Bracket node, ronde/index, winners/losers/finale/reset, toestand, echte match-ID |
| `tournament_edges` | Bronnode/outcome winner of loser → doelnode/seat; geen cyclus of dubbeldoel |
| `tournament_results` | Node/result-reference, soort, reden, correctierevisie; koppeling aan officiële matchresultaten |
| `boards` | Toernooi/nummer unique, enabled; 1–16 bestaande opties |
| `board_reservations` | Bord uniek zolang actief, node/match uniek, deadline, release_at; geen dubbele boardclaim |
| `seasons` | Eigen competitie-entiteit, start/einde/status, regels, promotie/degradatie, previous_season_id |
| `divisions` | Season/level unique, naam/kleur; bestaande 1–8 divisies |
| `division_memberships` | Season/user unique, division, join/withdrawstatus, Elo bij indeling |
| `division_fixtures` | Division, speeldag, twee spelers of bye, deadline, gekoppelde match/resultaat; paar één keer per single round-robin |
| `division_movements` | Afgesloten seizoen, speler, oude/nieuwe divisie, reden/beslissing; geen afleiding uit Elo |
| `competition_decisions` | No-show/withdrawal/tie-break/correctie met actor, reden, evidence refs, policy_version |

Capaciteiten uit prototype zijn UI-bounds, geen bewezen servercapaciteit: toernooi max4/8/16/32/64; divisie max24; seizoen max192. Controleer dat publicatie/deelnamecapaciteit bij roomcap50 past: een 64-deelnemerstoernooi vereist bijvoorbeeld gecontroleerde gefaseerde kamerinstroom of expliciete grotere geteste eventkamer. **Niet automatisch 64 deelnemers plus publiek in een kamer van50 toestaan.** Maak voor V1 een publicatievalidatie: `maxPlayers <= tournamentRoom.capacity` tenzij een bewust ondersteunde instroompolicy is gekozen. Benoem dit in beheer bij de instelling, zonder het spelontwerp te veranderen.

### Beheer, betrouwbaarheid en verzending

| Tabel | Doel |
|---|---|
| `sanctions` | target, scope platform/room, type warn/mute/suspend/remove, from/until, actor, reason, revoked_at |
| `moderation_cases` | Meldingen, status, toegewezen beheerder, antwoord, gekoppelde sancties; geen publiek bewijsdump |
| `audit_events` | Append-only actor/action/subject/before-after-redacted/reason/request-ID/at; geen OTP of JWT |
| `system_settings` | Geversioneerde gevalideerde spel-/platforminstellingen; secrets blijven in environment/providerconfig |
| `outbox_events` | Transactiegebonden event-ID, type, aggregate/version, payload, attempts, next_try, delivered_at |
| `scheduled_jobs` | Type, aggregate, due_at, dedupe_key unique, lease, attempts, status; timerduurzaam |
| `email_deliveries` | Template/version, ontvangerreferentie, event/dedupe key, provider-ID, status/bounce; geen OTP-plaintext bewaren |
| `idempotency_keys` | Scope/actor/key unique, payloadhash, resultreference, TTL waar toepasselijk |
| `owner_bootstrap_events` | Expliciete geverifieerde UUID, uitvoerder, omgeving, timestamp, succes; nooit sleutel of OTP |

Outbox en jobs zijn duurzaam in PostgreSQL. Redis pub/sub is geen berichtenarchief en geen garantie dat een consument het event heeft ontvangen. Workers verwerken at-least-once; effecten zijn idempotent. Exact-één zakelijke verwerking ontstaat uit unieke sleutels en transacties, niet uit de aanname dat een queue nooit dubbelt.

## 4. Rollen en moderatorgrenzen

| Actie | Speler / VIP | Kamerbeheerder in scope | Admin | Owner |
|---|---|---|---|---|
| Eigen profiel, vrienden, eigen DM | Ja | Ja | Ja | Ja |
| Spelen/toeschouwen | Volgens game- en kamertoegang | Zelfde regels | Zelfde regels | Zelfde regels |
| Persoonlijk muten/blokkeren/melden | Ja | Ja | Ja | Ja |
| Waarschuwen/kamermute/verwijderen | Nee | Alleen toegewezen kamer | Ja, binnen bevoegdheidsbeleid | Ja |
| Platformmute/schorsing | Nee | Nee | Gewone spelers/VIP; geen owner/peeradmins | Ja, beschermd tegen laatste-ownerverlies |
| Kamers/events/divisies beheren | Nee | Geen automatisch platformrecht | Alleen toegekende beheercapabilities | Ja |
| VIP/adminrollen toekennen | Nee | Nee | Geen self-/peerpromotie | Ja |
| Ownerrol toekennen/verwijderen | Nee | Nee | Nee | Apart beschermd ownerproces |
| Alle privéchats vrij doorzoeken | Nee | Nee | Nee | Geen standaardfunctie; casegebonden toegang met audit |
| Secrets/providercredentials zien | Nee | Nee | Nee | Niet via de web-UI; infrastructureel beheer |

De bestaande zichtbare rollen blijven `owner`, `admin`, `vip`, `player`; kamerbeheer is een scope, geen nieuwe naamkleur. Als VIP-entitlements naast beheerdersrollen worden opgeslagen blijft één effectieve naamkleur gelden. Een blue nickname bewijst geen rechten: alle checks zijn server-side.

**Voorgestelde aanscherping voor productie:** admin mag geen peeradmin of owner sanctioneren, niemand mag zichzelf omhoog promoveren; de laatste actieve owner kan niet verdwijnen. Doe ownerwijzigingen in een transactie met lock op de ownergroep zodat twee gelijktijdige demoties niet beide slagen. Bootstrap vereist expliciete account-UUID + geverifieerde e-mailcontrole en een server-only operatoractie. De eerste willekeurige signup krijgt nooit beheer.

Ban/mute-expiratie gebruikt servertijd. Een sanctie is effectief zolang geldig en niet ingetrokken, ook als de worker die het label bijwerkt vertraagd is. Schrijfcontrole vergelijkt de echte tijd/gegevens en vertrouwt niet alleen op een cached tekst `active`. Elke sanctie/correctie heeft reden en audit; logs tonen geen gevoelige berichtinhoud tenzij het doel dat vereist.

## 5. RLS en serversleutels

### Toegangsmatrix

| Gegevens | Anonymous | Ingelogde speler | Privileged backend |
|---|---|---|---|
| Gepubliceerde marketingprojecties | Alleen lezen | Lezen | Beheerde publicatie |
| Publiek spelerprofiel/ladder | Alleen expliciet gepubliceerde velden | Toegestane velden | Gecontroleerd schrijven |
| E-mail/Authidentiteit | Geen | Eigen via authflow, nooit ledenlijst | Alleen noodzakelijke account-/mailoperaties |
| Eigen voorkeuren/profielvelden | Geen | Eigen allowlist | Valideert uitzonderingen |
| Rollen/rating/resultaatledger | Geen schrijven | Geen schrijven | Alleen specifieke diensttransacties |
| Vriendschapsverzoek/relatie | Geen | Alleen eigen pair/context | Autorisatie + transactie |
| Privéberichten | Geen | Alleen eigen twee-persoonschannel | Alleen toegestane delivery of gemelde case |
| Kamerchat | Geen | Huidig toegestaan lidmaatschap | Toegang gecontroleerd op ieder verzoek |
| Matchchat/resultaatdetails | Alleen publicatieprojectie indien gekozen | Gerechtigde matchcontext | Gecontroleerde verwerking |
| Moderatie/audit/jobs/outbox | Geen | Geen algemene toegang | Specifieke beheer-/servicerechten |

Gebruik een public read-view met expliciete kolommen; voorkom dat een later toegevoegd privéveld automatisch publiek wordt door `select *`. RLS-policies vertrouwen op `auth.uid()` en serverbeheerde membership/roledata, nooit op `user_metadata` waarin de gebruiker zelf een rol kan zetten. Cross-table helpers moeten hun search_path en privileges expliciet vastleggen. `SECURITY DEFINER` alleen waar nodig; zet `search_path`, revoke execute van PUBLIC en geef de minimaal benodigde grant. Een brede callable RPC met ownerrechten is een even grote datalekroute als een ruime tabelpolicy.

Nieuwe Supabaseprojecten gebruiken publishable en secret keys. Publishable mag in de client maar is geen gebruikersautorisatie op zichzelf; de gebruikers-JWT en RLS bepalen toegang. Secret keys omzeilen RLS en horen alleen op de backend. Gebruik geen secret-keyclient als algemene shortcut voor onbeveiligde user API's. Bij serverauth: verifieer identiteit, bepaal toegestaan doel en voer daarna de beperkte actie uit.

Directe databaseverbinding vanuit Next/Colyseus/worker gebruikt aparte servercredentials met minimale privileges waar praktisch. Migrator is een aparte rol, niet de runtimegebruiker. Kies direct/session-pool verbinding voor langlopende processen en transacties volgens de daadwerkelijk beschikbare netwerkroute; begrens poolgrootte per proces en tel ze op. Als een transaction-pooler wordt gebruikt, geen afhankelijkheid van session-scoped locks of ongeteste prepared statements. Kritieke transacties gebruiken transaction-scoped locks.

RLS negatieve tests zijn verplicht met anon, twee gewone gebruikers, moderator buiten scope, admin en owner. Test ook rechtstreeks REST/RPC, niet alleen verborgen UI-knoppen.

## 6. API-contract

HTTP beheert duurzame resources; Colyseus behandelt de actieve wedstrijd en realtime delivery. Beide delen dezelfde auth-/permission-/domeinservices. Gebruik consistente foutcodes en veilige gebruikersmeldingen: `unauthenticated`, `profile_incomplete`, `forbidden`, `banned`, `capacity`, `conflict`, `expired`, `rate_limited`, `unavailable`. Intern detail niet terugsturen.

| Routefamilie | Verantwoordelijkheid |
|---|---|
| `POST /api/auth/otp/request` en `/verify` | OTPflow uit accountdocument; anti-enumeratie, serverrate limits, geen logging van code |
| `POST /api/onboarding/username` | Unieke username claim, profiel afronden; conflict409 geeft bruikbare feedback |
| `GET /api/me` | Huidige identiteit, profielstatus, eigen effectieve mogelijkheden |
| `GET /api/public/*` | Alleen gepubliceerde tournament/ladder/division/roomprojecties; cache/revalidation |
| `GET /api/rooms`, `POST /api/rooms/:id/join` | Kamerlijst, autorisatie en capaciteit; join-reservering pas na geldige toegang |
| `POST /api/game-invites`, `/:id/accept`, `/:id/reject` | 301/501/701, legs/sets/ranked, wederzijdse blockchecks; immutable aanvaarde rules |
| `GET /api/matches/:id` en `/events?after=` | Gerechtigde snapshot/historie; nooit clientscore PUT |
| `POST /api/friends/requests`, `/:id/accept`, `/reject`, `/cancel` | Relationele vriendschapsflow |
| `DELETE /api/friends/:userId` | Alleen eigen relatie verwijderen, idempotent |
| `GET /api/channels`, `/:id/messages?before=` | Inbox/cursorhistorie volgens lidmaatschap |
| `POST /api/channels/private` | Canoniek bestaand of nieuw DMkanaal; block/new-DM-policy |
| `PATCH /api/channels/:id/preferences` | Eigen tab/sluit-/leesstatus |
| `POST /api/reports` | Servergebonden evidence references, geen vrij meegestuurd slachtofferprofiel |
| `GET/POST /api/tournaments/*` | Registratie/check-in; beheerschrijfacties aparte autorisatie |
| `GET/POST /api/seasons/*` | Deelnamestand, fixturestart, standings; beheerschrijven apart |
| `/api/admin/*` | Serverrollen en scope, versieconflicten, audit en reden waar nodig |
| `/internal/deploy/*` | Alleen loopback + server-token, exacte drain/status/resume uit opscontract |

Write-API's controleren Origin/CSRF voor cookie-auth, Content-Type, bodylimiet en schema. Rate limits op account/IP/actie; e-mailadres in OTP-rate-limiter hashen waar opslag nodig is. Ondersteun Idempotency-Key voor uitnodigingen, acceptatie, administratieve acties en eigen berichten. Eenzelfde key met andere payload levert conflict. Geen mutaties via GET.

Een UI disabled state is geen beveiliging. De gebruiker mag de `userId`, actor, eigenaar, winnaar, rol of rating niet zelf kiezen in payloads. Leidt de actor altijd af van de geverifieerde sessie. Een `next`-redirect blijft beperkt tot interne allowlisted apppaden; geen externe open redirect.

## 7. Transacties die verplicht atomair zijn

### Matchresultaat en Elo

1. Lock match en beide ratingprofielen in vaste UUID-volgorde.
2. Controleer finale stateVersion, writer fence, result hash, uitkomst en ranked policy.
3. Bestaand gelijk resultaat: return bestaande ontvangst. Bestaand afwijkend resultaat: conflict/correctieprocedure.
4. Schrijf één matchresultaat. Bereken Elo met beide originele ratings, twee tegengestelde delta's, nooit na elkaar met al gewijzigde rating.
5. Schrijf beide ledgerregels, profielupdates, unieke opponentrelaties, statistieken en de juiste competitiekoppeling.
6. Voeg outboxevents toe in dezelfde transactie; commit daarna. Broadcast/mail pas na commit.

Losse Supabase/PostgREST-calls zijn geen meerstappentransactie. Implementeer dit in een geaudite databasefunctie/RPC of een echte serverdatabase-transactie, met alle autorisatie en privileges geregeld. Retry serialisatie-/deadlockconflicten begrensd; locks in vaste volgorde. Bij tegenstrijdige correctie geen ledgerregel overschrijven: een geversioneerde correctie met zichtbare audit, en als Elo opnieuw berekend moet worden een expliciet volledige replaypolicy over latere resultaten. Het simpele terugdraaien van oude delta's na vele vervolgwedstrijden is niet automatisch een correcte Elo-reconstructie.

### Bordplanning

Lock het toernooi/planningaggregate, claim startklare nodes en vrije borden, controleer beide actieve spelersreserveringen en rusttijd. Schrijf assignment + reserveringen + notificatieoutbox atomair. Unique constraints zijn de laatste verdediging. `FOR UPDATE SKIP LOCKED` kan werkverdeling ondersteunen, maar vervangt geen businessconstraints. Geen database-lock vasthouden terwijl je een extern mail- of WebSocketantwoord afwacht.

### Vriend accepteren / uitnodiging accepteren

De server verifieert ontvanger en geldige pending status onder lock. Vriendschap wordt eenmaal aangemaakt en verzoek eenmaal afgerond. Matchuitnodiging moet beide spelers atomair reserveren, rules vastzetten en match + spelersreservering aanmaken. Bij bezet/verlopen/geblokkeerd geen halve match of spookvriendschap achterlaten.

### Moderatie en outbox

Sanctie + audit + revocatie-event samen committen. De realtimeactor past effectieve ban/mute toe en ack't event-ID; event kan opnieuw verwerkt worden. Als Redis/pubsub tijdelijk wegvalt blijven nieuwe writes de databasepolicy controleren. Actieve clients krijgen veilige uitleg, geen private reporteridentiteit.

## 8. Background jobs en herstel

Een Node-worker verwerkt PostgreSQLjobs/outbox: reminders, uitnodigingstermijnen, no-shows, check-in sluiten, automatisch plannen, seizoendeadlines, maildelivery en publieke cacheverversing. Gebruik unieke dedupekeys, lock/lease, attempts, exponentiële retry en dead-letterstatus met beheerwaarschuwing. Deadlines zijn absolute servertijden; `setTimeout` in een webproces is geen duurzaam planningssysteem.

Actieve dartimpact wordt primair door de matchwriter verwerkt; de duurzame pending-dartregistratie voorkomt verlies. Een recoveryjob mag niet parallel dezelfde match zonder writerlease overnemen. Jobs leggen `actor=system` en policyversion vast. Een offline worker veroorzaakt vertraagde verwerking, geen door gebruikers manipuleerbaar tijdvenster.

Realtime-outboxevents bevatten minimale payload en resource-ID; iedere ontvanger krijgt alleen zijn projectie. Mail-outbox bevat een template-ID en veilige variabelen. OTP komt uit de authproviderflow en is geen zelf te genereren algemeen jobtype. Mailwebhooks verifiëren providersignatuur en worden gededupliceerd; markeer bounce/complaint zonder complete webhookbody inclusief privégegevens in standaardlogs te bewaren.

Backups: databasebackup plus hersteltest; assets/config apart; Redisdata niet voldoende. Restore test moet aantonen dat laatste gecommitteerde score, finalisatie-ID, Eloledger, brackets en privéchatrechten samen terugkomen. Meet RPO/RTO en benoem bekende verliesvensters van het gekozen abonnement; verkoop geen “nul dataverlies” zonder meting.

## 9. Van lokale Sites-stores naar echte diensten

| Huidige bron | Productievervanging | Wat visueel gelijk blijft |
|---|---|---|
| `darts-session.ts` / DemoGate | Supabase sessie + onboarding/profilegate | Inloglayout, na OTP de usernamekeuze, bestaande routes |
| `darts-data.ts` | Openbare profielprojecties en echte roomdirectory | Namenlijst, badges, statkolommen, filters |
| `darts-social.ts` | Social service + DB + persoonlijke Colyseus-events | Dropdowns, verzoekkaarten, vriendenpaneel, mute/reportmodals |
| `darts-chat-state.ts` | Gepagineerde DBhistorie + Colyseusdelivery + eigen tabvoorkeur | Tabs, sluiten/heropenen, concept, composer, 60%-drawer |
| `darts-ratings.ts` | Serverratings/ledger readmodel | Ratingkleuren, [rating], ranglijst en resultaatkaart |
| `darts-game-state.ts` | Clientpresentationadapter over serverstate | Bord, timingbalken, vlucht, impactchip, scoretabel, checkoutstrip |
| `darts-fair-play-client.ts` + demoAPI | Colyseus inputprotocol voor echte matches | Geen andere speelervaring of nieuw dashboard |
| `darts-match-records.ts` | Officiële results/events/statistics query | Historie en statistiekweergave |
| `darts-tournament-store.ts` | Tournament service + worker + transactionele progression | Backoffice, deelnamestappen, bracket, spectatorflow |
| `darts-divisions-store.ts` | Season/division service | Seizoenpagina, badges, fixtures, ladder |
| `darts-admin-operations.ts`, `darts-admin-settings.ts` | RBAC API's, gevalideerde config, audit | Beheerindeling zonder dubbele headers |
| `darts-preferences.ts` | Eigen voorkeuren in DB, cache lokaal toegestaan | Sound/haptics/quiet/reducedmotion/overige bestaande opties |
| `darts-public-data.ts` | Serverallowlist query op gepubliceerde actuele data | Marketinghero, echte events, Elo/divisietabs |

Maak adapters/hooks met dezelfde verwachte UIvorm zodat de overname niet eindigt in een nieuwe interpretatie van de layout. Vervang hardcoded `Nick`, `Bullseye`, roleowner en initialen door de huidige profielprojectie. Plaats fixtures alleen in ontwikkelseeds. Productie start zonder fictieve online gebruikers, demotoernooien, fakevrienden of gekopieerde lokale Elo. Bestaande lokale browserdata heeft geen betrouwbare eigenaarsidentiteit en wordt **niet** gemigreerd naar echte accounts. Eventueel exporteer je alleen eigen onschuldige voorkeuren met gebruikerskeuze.

Port de runtime van Sites/Vinext/D1 naar regulier Next.js standalone + PostgreSQL. Behoud routes, CSS, fonts, SVG's, beeldassets, Radix/shadcncomponenten en Motionconfiguratie. D1-SQL/schema en Sitesconnectors niet blind op een VPS deployen. Het pure regelpakket kan vrijwel rechtstreeks mee; platformspecifieke adapters worden vervangen. Verwijder geen zichtbaar werkende functie omdat er nog geen endpoint voor bestaat: implementeer dat endpoint of markeer de bouwfase als onvoltooid.

## 10. Gefaseerde migratie en gates

1. **Visuele baseline vastzetten.** Bron-SHA, assethashes, route-inventaris, viewportbeelden en interaction map. Geen style-rewrite tijdens data-aansluiting.
2. **Native runtime starten.** Exacte UI lokaal op development-VPS, nog met gescheiden devfixtures. Typecheck/build en routevergelijking.
3. **Database + auth.** Geversioneerde SQLmigraties, RLS negatieve tests, OTP, username, expliciete ownerbootstrap, eigen profiel.
4. **Sociale diensten.** Vriendschappen, invites, roomtoegang, privéchat en historie. Twee echte testaccounts en uitgesloten derde gebruiker.
5. **Colyseusmatch.** Serverinputprotocol, gedeelde regels, impact, reconnect, durable receipt, spectators, bans. Geen ranked totdat de gates uit hoofdstuk04 slagen.
6. **Resultaten + Elo.** Atomair finaliseren, historie/ladder, concurrentiereplaytests.
7. **Toernooien + divisies.** Echte matchkoppeling, planning, withdrawal/no-show/correcties, resetfinale, badges en seizoeneindstand.
8. **Publieke marketing + mail.** Gepubliceerde data uit DB, echte domeinen, mailtemplates, branding; geen demo-accounttekst in productie.
9. **CI/deploy + herstel.** Immutable build, environmentinjectie, drain, migrations, smoke, rollback, backuprestore. Main pas pushen wanneer afgesproken V1 compleet is; staging/production volgen eigen branch- en environmentflow.

SQLmigraties zijn append-only na gebruik in gedeelde omgevingen. Gebruik expand/contract bij schemawijzigingen; een vorige appversie moet de uitgebreide schemafase nog kunnen lezen. Geen destructieve downmigratie als automatische rollback. Fixtures/seeds en ownerbootstrap zijn expliciete opdrachten met omgevingsguard, nooit verborgen in normale startup.

## 11. Verplichte gegevens- en securitytests

- Twee OTP-geverifieerde accounts claimen dezelfde username tegelijk: precies één wint, de ander krijgt conflict; geen halfprofiel.
- Onboardingskip via URL/WS is onmogelijk. Clientmetadata `owner` verandert geen rol. Eerste signup wordt gewone speler.
- Anon en gebruiker A kunnen e-mail, privéchat en notificaties van B niet lezen, ook via REST/RPC met geraden UUID's.
- Een admin buiten roomscope kan geen scoped maatregel uitvoeren; peer/ownerbescherming en laatste-ownertransactie werken.
- Vriendrequests in beide richtingen, dubbel accepteren, blokkeren tijdens accept en relatieverwijdering zijn consistent.
- Verlopen/verwijderde roommembership ontvangt geen kamerchat meer; lobby heeft geen impliciete Nederland1-membership.
- Duplicate berichten/idempotency retries, cursors en reconnect leveren geen ontbrekende of dubbele zichtbare boodschap.
- Eén matchresultaat → één matchfinale en exact twee Eloledgerregels; retry en fout tussen writes veranderen niets gedeeltelijk.
- Nieuwe serverwriter met hoger fencingnummer sluit oude writer uit, ook na een lang databaseverzoek.
- Event/mailoutboxretry na crash vóór/na providersend is beheerst; provider-ID/dedupe is vastgelegd.
- Concurrente planner claimt elk bord/speler maximaal eenmaal; no-shows en byes produceren geen fictieve Elo/statistieken.
- Divisiecorrectie, withdrawal, gedeelde eindrang en promotiegrens volgen policy; Elo en divisiepunten blijven gescheiden.
- Seeds/demoreset/endpoints en ontwikkelowner bestaan niet bereikbaar op productie. Geen geheim in clientbundles, sourcemaps of logs.
- Backuprestore is daadwerkelijk uitgevoerd met consistente score, ledger, bracket en privatechannelrechten.

## Bronnen

Architectuur, tabelnamen en policies hierboven zijn DartsPoint-ontwerp. Primaire technische documentatie geraadpleegd 12 oktober 2026:

- https://supabase.com/docs/guides/database/postgres/row-level-security — grants, policies en service-rolegrenzen.
- https://supabase.com/docs/guides/getting-started/api-keys — publishable/secret keys en plaats van gebruik.
- https://supabase.com/docs/guides/auth/jwts — geverifieerde identiteit en claims.
- https://supabase.com/docs/guides/auth/server-side/creating-a-client — server-side authcontrole.
- https://supabase.com/docs/guides/database/connecting-to-postgres — verbindingstypen en pooling.
- https://www.postgresql.org/docs/current/explicit-locking.html — rijlocks, deadlocks en advisory locks.
- https://docs.colyseus.io/scalability — process ownership en gedeelde realtimecoördinatie.
