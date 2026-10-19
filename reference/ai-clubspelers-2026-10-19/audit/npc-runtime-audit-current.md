# NPC runtime-audit — DartsPoint current main

Read-only audit van `dartspoint/platform`, vastgepind op commit `d2d95b7e2954eb99dc911cd61e70150f6360e89d`. Gelezen via de GitHub-connector; geen repository- of databankwijzigingen uitgevoerd. Dit zijn implementatieaanbevelingen op basis van broncode, geen bewijs van live configuratie of testresultaten.

## 1. Bestaande integratiepunten

- `apps/realtime/src/server.ts`: Colyseus `DartsMatch` is de huidige commandowner. `onCreate` roept `acquireMatch(matchId, writerId)` aan; `MatchWriterLease` vernieuwt iedere 10 seconden, met DB-lease van 30 seconden. Alle gameplayopdrachten gaan door een geserialiseerde roomqueue en `matchCommand`. `publish` leest elke 100 ms nieuwe versies zonder de commandqueue te belasten.
- `apps/realtime/src/match-writer-lease.ts`: closing/renew/dispose beschermen tegen een verloren schrijver en een in-flight renewal. NPC-timers moeten dezelfde closing/fence-bescherming volgen en na dispose stoppen.
- `apps/worker/src/worker.ts`: bestaande lichte gameloop van 50 ms. Roept iedere tick `settleImpacts` en `settlePractice` aan; lifecycle, disconnects en kamerexpiry ongeveer iedere 5 seconden.
- `apps/worker/src/support-worker.ts`: bestaande achtergrondloop van ongeveer 1 seconde. Roept daadwerkelijk `deliverOutbox`, `advanceQueues`, competities en reminders aan. De overeenkomstige imports in de hoofdworker betekenen niet dat die daar al worden uitgevoerd.
- `apps/worker/src/delivery.ts`: daadwerkelijke outboxconsument. `deliverOutbox` claimt batches van maximaal 16 met `FOR UPDATE SKIP LOCKED`, een lock van 60 seconden en retries met exponential backoff.
- `packages/data/src/db.ts`: `transaction` herhaalt serialization/deadlockfouten maximaal tweemaal; `outbox(c,key,kind,user,payload)` voegt transactioneel toe met unieke `dedupe_key`.
- `packages/data/src/community.ts`: bestaande `joinRoom`, `roomAccess`, `heartbeat`, `markRoomActivity`, `sendMessage`, `publishChatChange`, `personalChatChange`.
- `packages/data/src/matches.ts`: `invite`, `respondInvite`, `createMatch`, `matchCommand`, `persist`, `settleImpacts`, `finishMatch`, `connection`, `expireDisconnects`.
- `packages/data/src/queue.ts`: bestaande wachtrij voor de winnaar die een volgende tegenstander uitnodigt; dit is geen algemene jobqueue. `advanceQueues` heeft al persistente `private.queue_advances`.
- `packages/data/src/settings.ts` en `settings-model.ts`: instellingen zijn streng gevalideerd; onbekende secties/velden worden geweigerd. NPC-configuratie toevoegen aan type, defaults, validatie, opslag en beheer; geen willekeurige JSON-sectie die ongemerkt wordt genegeerd.
- `packages/data/src/lobby.ts`: bestaande CMS-/lobbyfeed en contentbeheer. Geen bestaande NPCscheduler aangetroffen in dit bestand.

## 2. Concreet identitypad zonder NPC-authaccounts

Huidige schema: `profiles.id` is primair en direct een FK naar `auth.users(id)` (`20261012000100_platform.sql:10-17`). Andere domeintabellen verwijzen naar `profiles.id`. Daarom kan men niet simpelweg 25 willekeurige NPCprofielen invoegen.

Aanbevolen beperkte schema-aanpassing:

1. Voeg `profiles.actor_kind` toe met NOT NULL/default `human`, toegestane waarden `human|npc`.
2. Voeg nullable `profiles.auth_user_id` toe met een echte FK naar `auth.users(id)`; behoud de huidige NO ACTION delete/updatebescherming.
3. Backfill uitsluitend bestaande mensen met `auth_user_id=id`.
4. Voeg en valideer een declaratieve CHECK met expliciete nullcontrole:
   `(actor_kind='human' AND auth_user_id IS NOT NULL AND auth_user_id=id) OR (actor_kind='npc' AND auth_user_id IS NULL)`.
   Alleen `auth_user_id=id` is onvoldoende: SQL CHECK accepteert UNKNOWN.
5. Werk de bestaande `private.new_auth_user`-triggerfunctie gecontroleerd bij zodat nieuwe Auth-users een humanprofiel met `id=auth_user_id` krijgen. Inspecteer de actuele functie vóór vervangen en behoud alle inmiddels toegevoegde logica.
6. Een beperkte compatibility-trigger voor oudere menselijke `INSERT profiles(id)`-paden mag `auth_user_id=id` invullen wanneer de expliciete/default actor_kind human is. Hij mag nooit automatisch npc worden.
7. Pas nadat de nieuwe FK en CHECK bewezen valide zijn: verwijder alleen de oorspronkelijke `profiles.id -> auth.users.id`-FK. Ontdek de echte constraintnaam uit catalogusmetadata; neem geen gegenereerde naam aan.
8. Behoud alle bestaande match-, chat-, rating-, rollen-, privacy- en overige FK's naar `profiles.id`. Bestaande menselijke UUID's veranderen niet.
9. Seed exact 25 vaste NPCprofielen met `actor_kind=npc` en `auth_user_id=NULL`, plus een private definitionregistry die FK's naar hun profiel-ID's gebruikt. Idempotente seedkeys; geen reset van DP, actieve spellen of beheerwijzigingen bij herdeploy.

Dit is bewust een kleine, gecontroleerde constraintvervanging; benoem haar eerlijk als uitzondering op louter additieve migraties. Het is geen nieuw authplatform.

Geen Auth-users, fictieve e-mailadressen, JWT's, refresh tokens, sessies of fictieve voorwaardenakkoorden voor NPC's. Public human-authpaden blijven alleen humans toelaten. Verander `actorById` niet in een onbeveiligde publieke impersonationhelper: introduceer een expliciete interne NPCcontext uit de private registry, met uitsluitend playerbevoegdheden. Laat een browser geen `actor_kind`, NPC-ID, service-vlag of bypassboolean kiezen. Menselijke autorisatie, sessierevocatie, bans, RLS en grants blijven intact.

`assertLegalParticipation` kijkt momenteel voor ieder profiel naar echte juridische acceptaties. Deel die controle zodanig op dat mensen hun bestaande verplichte acceptatie houden en een bewezen interne NPCcontext geen menselijke acceptatie verzint. Een door de caller gekozen skipLegal=false/true-veld is geen veilige oplossing.

Minimale migration/authproeven:
- Bestaande human-ID's en alle domeinrelaties onveranderd; iedere human heeft exact zijn eigen geldige Auth-FK.
- Human met NULL auth_user_id, andere auth_user_id of niet-bestaande Auth-user wordt geweigerd.
- NPC met niet-NULL auth_user_id wordt geweigerd.
- Auth-user verwijderen/updaten terwijl zijn humanprofiel bestaat houdt dezelfde FKbescherming als tevoren.
- Nieuwe registratie via de bestaande Auth-trigger werkt tijdens gemengde applicatieversies.
- Bestaande login, OTP, Google indien aanwezig, logout, revocation, onboarding, deletion en retention blijven werken.
- NPC kan nooit public sessie-/token-/onboarding-/privilegeroutes gebruiken of menselijke staffrollen krijgen.
- Geen enkele nieuwe Supabase Auth-user voor de 25 NPC's.
- Rollback is feature uit, schema voorwaartscompatibel laten staan; geen NPC's verwijderen die nog historische FKrelaties hebben. Oude FK niet blind opnieuw toevoegen na NPCseed.

## 3. Aanwezigheid: exact 25 globaal, niet 25 per kamer

Huidige `room_memberships.user_id` is de primary key; één profiel kan dus tegelijk maar in één kamer zitten. `active_player_reservations.user_id` staat ook maximaal één actieve wedstrijd toe. Gebruik dit; maak geen kopie van dezelfde bot per kamer of domein.

NPCs kunnen zich over alle geschikte open kamers verdelen en er doorheen bewegen. Selectiepredicate minimaal `status='open' AND category<>'tournament'`, plus capaciteit, ratinggrenzen, sancties en alle bestaande toegangsvoorwaarden. Nieuwe geschikte kamers worden automatisch opgepikt. Private, gesloten en toernooikamers worden ook server-side geweigerd bij beweging, uitnodiging en matchcreatie; alleen filtering in het adminscherm of de scheduler is onvoldoende.

`joinRoom` beschermt de aanwezigheid met een advisory lock per profiel, lockt de kamer, bewaakt capaciteit, maximaal 10 switches/minuut en verbiedt kamerwissel tijdens een wedstrijd in een andere kamer. Het maakt een uniek bezoek en een bestaand gelokaliseerd `room.member_joined`-event. Hergebruik het transactionele domeingedrag, niet losse inserts.

Aanwezigheid verloopt na 5 minuten echte activiteit. Een connectivitypoll met `active=false` verlengt die termijn niet. Plan voor NPCs expliciete interne activiteit tijdens hun geplande onlinesessie; wijzig niet het menselijk idlebeleid. Presenceplanner bewaart eigen volgende deadlines en claimlease in DB zodat dubbele workers geen flapperende bewegingen veroorzaken. Geen vertrek of kamerwissel midden in een spel.

Laat echte spelers voorrang houden op beperkte capaciteit. Geen random keuze uit een lege eligible-roomlijst. Als er meer kamers dan NPC's bestaan kan men geen gelijktijdige dekking van elke kamer garanderen met dit bestaande singletonmodel; kies roterende dekking.

## 4. Authoritatief werpen binnen de bestaande writer

De huidige menselijke commandflow gebruikt `render-sample-v3`, `faster-v2`, gemeten connection-ID, minimaal drie clocksamples, phaseToken, stateVersion, dartNumber, deadlines en writerFence. Zij is bedoeld voor echte browser-renderwaarnemingen. Geef NPCs geen gefingeerde renderSample, latency of connection-ID, en verlaag deze controles niet.

Voeg een expliciete interne NPCadapter toe aan de huidige DartsMatch-writer. De scheduler/worker mag beslissen wanneer een NPC beschikbaar is en een actie aan de runtime aanbieden; hij wordt niet een tweede gameplaywriter. Factor waar nodig de bestaande gedeelde validatie/transitiestappen uit `matchCommand` naar interne helpers. Hergebruik `scoreDart`, `dartsGameReducer`, `persist`, `match_darts`, `settleImpacts`, `settleLeg` en `finishMatch`.

Plan door de server bepaalbare legale horizontal/vertical meterstops met expliciete NPCbron en versie; laat de adapter zelf state, fase, seat, turn, pending impact, deadlines, actor_kind en huidige writerlease opnieuw controleren. Resultaat is een echte dart met gewone vlucht (`FLIGHT_MS=560`), impact en regels. Geen directe score/winnaar of resultaatinsert.

Stable action-ID/dedupe per match, NPC, dart en fase; éénmalige acceptatie bij retries. Timers onder dezelfde huidige writer en gestopt bij dispose/leaseverlies. Revalidate na pauze/recovery en annuleer verouderde planningen. Geen langlopende LLM- of provider calls in de gamecommandqueue of 50ms-impactloop.

Bot-botwedstrijden zonder aangesloten mens hebben ook een gematerialiseerde huidige matchroom/writer nodig. De bestaande writer ontstaat nu bij Colyseus onCreate en kan zonder clients worden opgeruimd; werk de interne roomlifecycle bij zodat actieve NPCmatches niet afhangen van een nepclient of menselijke toeschouwer. Nooit een tweede writer nemen omdat er geen menselijke socket is.

## 5. Skill, luck en DP zijn aparte begrippen

`darts-rules.ts:46-55` scoort coördinaten deterministisch. Er bestaat een `opponentTarget`-helper met ongekalibreerde Math.random; dit is geen bewijs van een production-ready 25persoonlijkheden/NPCskillmodel. Er is geen aangetroffen NPCskill/luck-contract in de geaudite bestanden.

Definieer skill als meetbare aimspreiding, checkoutkeuze en tempo; luck als begrensde variatie op een vastgelegde, reproduceerbare seed. Bewaar seed en configuratieversie per match. Herhaal dezelfde dart niet opnieuw met nieuwe randomuitkomst bij retry. LLM/personality mag tekst beïnvloeden, nooit targets, regels, worpacceptatie, scoring, winnaar of DP.

DP is een geleerde rating, geen aimparameter die na elke wedstrijd moet worden teruggezet. Een NPC heeft dezelfde duurzame `player_ratings` en echte ledger. Startwaarde is 1500; de formule heet intern Elo. `eloDraft` in settings is expliciet een draft en niet automatisch de actieve gamepolicy.

Belangrijk verschil met oudere projectkennis: nieuwe matches zetten `ratingPolicyVersion:2` (`matches.ts:24`). Gerankte DP wordt per leg verwerkt via `settleLeg`; `finalizeLegRatings` schrijft de samenvattende `rating_ledger` bij het matchresultaat. Policy 1 blijft voor bestaande matches. Niet nog eens DP aan het einde toevoegen.

`settleLeg` lockt de beide ratings in vaste user-IDvolgorde; rondt de gedeelde delta eenmaal op 10 decimalen; gebruikt SQL numeric met gelijke plus/minus; dedupliceert op `(match_id,leg_number)`. `finishMatch` dedupliceert het resultaat. Leg ook geannuleerde, verlaten en forfeitgevallen volgens de bestaande policy af. Geen extra NPCwinbonus, minimum/maximumclamp of ratingreset die zero-sum verbreekt.

Huidige kleurlogica: voorlopig wit totdat zowel 10 ranked matches als 5 unieke tegenstanders zijn bereikt. Daarna zichtbaar afgeronde rating <1450 rood, >=1550 groen, anders amber (`darts-elo.ts`). Dit is anders dan oudere 1500grens-aannames; gebruik huidige broncode. De exacte actieve constanten zijn `ELO_START=1500`, `ELO_K=32`, `PLACEMENT_MATCHES=10`, `PLACEMENT_OPPONENTS=5`; `isProvisional` gebruikt `rankedPlayed` en `new Set(opponents).size`. De duurzame tellers komen uit `player_ratings.ranked_played` en `player_opponents`; tel matches niet opnieuw per afgerekende leg. `ratingStatus` gebruikt `Math.round(profile.rating)` met de grenzen 1450 en 1550. De instellingen `eloDraft.redBelow` en `eloDraft.greenFrom` wijzigen dit actieve model niet vanzelf.

## 6. Globale 12uursherhalingscontrole en betrouwbare outbox

De eis betreft dezelfde of bijna dezelfde TEKST: geen van de 25 NPCs mag binnen een rolling 12 uur een tekst herhalen die een van hen eerder heeft gepubliceerd, ongeacht kamer, worker of domein binnen dezelfde omgeving. Het is GEEN limiet van één NPCbericht per 12 uur. Nieuwe, voldoende verschillende teksten blijven toegestaan volgens de normale rate-, context- en aanwezigheidsregels. Productie en staging delen geen dedupehistorie.

Bewaar een private gedeelde historie van gepubliceerde NPCteksten met bronmessage-ID, opportunity-ID, published_at, normalisatie-/fingerprintversie en voldoende afgeleide representatie om bijna-identieke varianten te herkennen. Alleen een exacte hash herkent geen kleine tekstvariaties. Definieer en test de normalisatie en nabijheidsgrens expliciet, inclusief case, whitespace, interpunctie, emoji's en korte standaardzinnen. Behandel de 12 uur per publicatie-entry; geen kalenderbucket en geen globale next_allowed_at die alle verschillende teksten samen beperkt.

Gebruik een private singletonlockrij of gelijkwaardige transactionele advisory lock uitsluitend om de globale vergelijking+publicatiebeslissing te serialiseren. Na verkrijgen van de lock: vergelijk met alle relevante entries uit de laatste 12 uur met server-DBtijd; weiger hetzelfde of te nabije tekst; schrijf bij een verse tekst de historie-entry, het persistente chatbericht en de outbox-intentie in één databasecommit. Een unieke opportunity-ID voorkomt dubbele publicatie na retry of ackverlies. Deze lock is geen 12uurslock of tijdelijk globaal publicatieslot.

Als vooraf LLMgeneratie nodig is: claim een concrete generationjob met token/expiry; genereer buiten DBlocks; controleer claim, actuele context en de globale 12uurshistorie opnieuw vlak vóór publicatie. Meerdere verschillende candidates mogen tegelijkertijd gegenereerd worden. Een timeout of mislukte generatie publiceert niets en laat geen permanente reservering achter. Leeftijd van een historie-entry begint bij de feitelijke publicatiecommit, niet bij generatie of jobclaim. Een afgewezen herhaling kan begrensd opnieuw worden geformuleerd of stil worden overgeslagen; geen oneindige regeneratielus.

`sendMessage` beheert nu zelf een transactie en roept pas na commit best-effort `publishChatChange` aan. Een buitenste transactie eromheen maakt de herhalingscontrole niet atomair. Factor een private transactional helper uit zodat herhalingscontrole+historie+bericht+outbox dezelfde PoolClient gebruiken, met normale inhoudsfilters, kanaaltoegang, serverlimieten en dedupe.

Huidige chatconstraint staat uitsluitend `human|room.member_joined` toe. Kies bewust een expliciet NPCberichttype met passende contextconstraint en updates van projecties/queries, of behoud aantoonbare NPCactorherkomst uit de profielregistry en zorg dat nergens een bot als human wordt voorgesteld. Houd redactie, rapporteren, blokkeren, persoonlijke inboxautorisatie en latere geschiedenis intact.

Nieuwe outboxkind heeft expliciete dispatch nodig: delivery.ts `send` retourneert bij onbekend kind uiteindelijk zonder fout en de caller markeert hem als geleverd. Alleen een nieuw kind in outbox invoegen voert dus geen NPCwerk uit. Voeg gerichte consumer toe vóór die fallback; acknowledgement pas na idempotente afhandeling. Blijf onder de claimlease of vernieuw met een veilig fencingtoken als externe generatie langer kan duren.

Voor chatpush: publiceer bestaande Redis-IDevents na commit vanuit de outbox; houd message-ID en kanaalcursor stabiel. Bij pushretry geen nieuw chatbericht maken. Bestaande personalChatChange voert toegangscontrole bij elke ontvanger uit en moet behouden blijven.

## 7. Release en belangrijke proeven

- Respecteer `admission`, onderhoud en deploydrain. Stop nieuwe NPCadmissions; laat bestaande wedstrijden via normale lifecycle aflopen. NPC's mogen safeToStop niet door eindeloze nieuwe matches blokkeren.
- Test 25 vaste profiel-ID's na herseed; maximaal één actieve room en match per NPC; beide domeinen tonen dezelfde NPCs.
- Parallelle schedulers: maar één presencebesluit/actie; recovery na leaseverlies zonder dubbele darts.
- NPC in private/gesloten/toernooikamer of competitionmatch wordt server-side geweigerd.
- Human-rendercontroles blijven exact; NPCcontext kan niet via browsercommand worden aangevraagd.
- Score/DI/DO/bust/checkout/leg/set/statistieken blijven dezelfde engine gebruiken.
- Per-leg DP plus/minus exact nul, retrydedupe, samenvattende ledger zonder extra award; causaliteit van skill en behaalde rating blijft gescheiden.
- 100 gelijktijdige IDENTIEKE of bijna-identieke kandidaten verspreid over 25 NPCs/kamers/domeinen publiceren maximaal één daarvan. 100 onderling voldoende verschillende verse teksten worden niet door een globaal 12uursberichtslot tegengehouden; de normale rate- en contextregels blijven wel gelden. Herhaling van een specifieke tekst kan pas wanneer zijn relevante historie buiten de rolling 12 uur valt. Test per-entry expiry, restart en crash vóór/na commit.
- LLMfout, promptinjectie uit chat, providerlatency en outage beïnvloeden geen gameplayauthority of 50ms-impactloop.
- Geen fakeauthsessions, geen NPCauthusers, geen fictieve juridische acceptaties; menselijke auth/deletion/retention en RLSregressies verplicht.

