# 04 — Colyseus, spelregels en realtimecontract

Status: **productieontwerp en bouwopdracht**, geen claim dat de Sites-demo al echte multiplayer bevat. Gecontroleerd tegen de overgedragen broncode en officiële documentatie op **12 oktober 2026**. De begeleidende broncode is de visuele referentie. Vervang de lokale stores achter de bestaande componenten; ontwerp het scherm niet opnieuw.

## 1. Wat de bestaande bron al doet

| Bronbestand | Behouden gedrag | Benodigde productiestap |
|---|---|---|
| `lib/darts-rules.ts` | Bordgeometrie, segmenten, bull, double/treble, pijlpuntaankomst | Als gedeeld, puur domeinpakket gebruiken; dezelfde geometrie op server en client |
| `lib/darts-match-rules.ts` | 301/501/701, dubbel-in, dubbel-uit, legs/sets, bust en beurtwisseling | Alleen de server mag de officiële wedstrijdstaat wijzigen |
| `lib/darts-game-state.ts` | Pijlvlucht, scorechip, beurtstatistieken, feedback | Presentatiemodel behouden; animatiecallback mag geen officiële score bepalen |
| `components/darts-game.tsx` | Horizontale/verticale timingbalken, grote gooiknop, bord, scoretabel, checkoutstrip | Bewegingsparameters en lockmomenten van Colyseus ontvangen |
| `app/api/fair-play/route.ts` | Demo-validatie, volgordenummer, identieke retry, server berekent punten | **Geen productie-ranked endpoint:** het accepteert nog clientcoördinaten `x/y` en speelt tegen een bot |
| `lib/darts-elo.ts` | Elo 1500, K=32, plaatsingsperiode, kleurbanden | Eenmaal per voltooide ranked wedstrijd in een PostgreSQL-transactie |
| `lib/darts-tournament-model.ts`, `darts-tournament-planning.ts` | Bracketgrafiek, dubbele eliminatie, finale-reset, borden | Autorisatie, duurzame planning, transacties, herstel en no-shows toevoegen |
| `lib/darts-divisions-model.ts` | Seizoenen, round-robin, divisieladder, promotie/degradatie | Duurzaam opslaan en aan echte wedstrijden koppelen |

De bestaande `eligibleForRating: false` van de fair-play-demo is terecht. Noem clientcoördinaten die opnieuw server-side worden gescoord niet fraudebestendige multiplayer. Haal de productie-ranked route hier volledig van los. De demo kan alleen onder een duidelijke ontwikkelvlag blijven bestaan en mag geen productie-rating schrijven.

## 2. Afbakening van de techniek

- **Next.js** levert alle bestaande schermen, publieke pagina's, accountflow en gewone HTTP-API's.
- **Colyseus** is de enige autoriteit voor live aanwezigheid, spelcommando's, wedstrijdstaat en realtime chatdistributie.
- **PostgreSQL via Supabase** bewaart accounts/profielen, rollen, sociale relaties, berichten, wedstrijdlogboeken, Elo en competities.
- **Redis** bevat vluchtige aanwezigheid, rate limits en interne realtimecoördinatie. PostgreSQL blijft de bron voor resultaten, rechten en herstel. Redisverlies mag geen uitslagen wissen.
- **Supabase Auth** verzorgt e-mail-OTP en sessies. Gebruik Supabase Realtime niet als tweede spelbus naast Colyseus.
- Eén Colyseus-proces voor V1; één wedstrijd heeft één schrijver. Meer processen pas na routing-, lease- en belastingstests. RedisPresence en RedisDriver bereiden dit voor, maar verhuizen een actieve kamer niet automatisch naar een ander proces.

### Versiecontract

Officiële Colyseus-documentatie staat op v0.18. De migratiepagina geeft als samenhangend voorbeeld `colyseus`, `@colyseus/sdk` en de betreffende `@colyseus/*`-pakketten op **0.18.1**, met `@colyseus/schema` **5.0.8**. Gebruik deze combinatie als onderzochte basis; controleer bij de werkelijke installatie beschikbare onderhoudsversies, pin exacte onderling compatibele versies en commit één lockfile. Geen losse `latest`-dependencies of oud `colyseus.js`-voorbeeld mengen met nieuwe lifecyclehooks.

Huidige namen: `Room`, `defineServer`, `defineRoom`, `setTimestep`, `onDrop`, `onReconnect`, `allowReconnection`, `@colyseus/sdk` en `client.auth.token`. `setSimulationInterval` bestaat nog als verouderde alias. Voor deze turn-based game is de nieuwe automatische voorspelling/rollback-netcode niet nodig; bouw één expliciete deterministische timing- en commandolaag.

## 3. Kamers en capaciteit

De **lobby is een overzicht**, geen automatische deelname aan Nederland 1. Hij toont kamers met bezetting, toernooipromotie en navigatie. Alleen privéberichten zijn er beschikbaar. Geen spelchat of kamerchat totdat er echt lidmaatschap van die context bestaat.

| Realtime-eenheid | Doel | Wie ontvangt wat? |
|---|---|---|
| `DirectoryRoom` | Kamerbezetting, openbare wedstrijdverwijzingen, eventstatus | Ingelogde spelers ontvangen uitsluitend veilige overzichtsvelden; geen kamerchat |
| `CommunityRoom` | Eén gekozen kamer, spelerslijst en kamerchat | Toegelaten kamerleden; maximaal 50 gelijktijdige unieke personen als standaard |
| `MatchRoom` | Eén wedstrijd | Precies twee toegewezen spelers; toegelaten toeschouwers met alleen leesrechten op spelstaat |
| `PersonalRoom` | Privé-inbox, vriendschapsverzoeken, eigen notificaties | Alleen sessies van dezelfde geverifieerde account-ID; nooit een gezamenlijke globale privéchatroom |

**Voorgestelde V1-capaciteitspolitiek:** de 50 geldt voor alle aanwezige unieke personen in een communitykamer, dus spelers én toeschouwers. Een speler in een wedstrijd telt één keer mee in de bovenliggende kamer; de extra MatchRoom-verbinding telt niet nogmaals. Er is geen onbeperkte spectatorachterdeur om boven 50 uit te komen. Een aparte toernooikamer heeft dezelfde standaard; verruiming later is een expliciete configuratie met capaciteitsmeting. Meerdere browsertabs van hetzelfde account krijgen geen extra stoel. Toon `38 / 50`, afgeleid van effectieve lidmaatschappen, niet van een handmatig invulbaar tellergetal.

Een overgang tussen kamers reserveert de nieuwe stoel en beëindigt de oude deelname atomair of herstelt die bij mislukking. Een actieve speler kan niet ongemerkt van kamer wisselen en zijn wedstrijd achterlaten: toon eerst de bestaande opgave-/terugkeerkeuze. Vrijgegeven toeschouwers kunnen wel vertrekken. Kamer sluiten blokkeert nieuwe toetreding; lopende wedstrijden worden afgehandeld volgens een zichtbare beheeractie.

Toernooikamer: iedereen met toegestane toegang mag kijken, alleen ingeschreven én toegelaten/ingecheckte deelnemers mogen spelen, uitsluitend hun toegewezen wedstrijd. Een bezoeker zonder account kan publieke marketinggegevens zien; anoniem live spelen/chatten is geen V1-recht. `spectator: false`, een gekozen username of een gemanipuleerd room-ID uit de browser verlenen geen spelersrecht.

## 4. Identiteit, geverifieerde JWT en rollen

1. De speler verifieert e-mail-OTP via Supabase Auth en heeft een complete unieke gebruikersnaam.
2. De webapp gebruikt de actuele Supabase access-JWT als `client.auth.token` bij de Colyseus-SDK. Het token gaat uitsluitend over HTTPS/WSS, niet in querystrings, logs of analytics. Gebruik dezelfde Supabase-identiteit voor web en realtime; geen tweede login, eigen ticketissuer of Colyseus-accountdatabase voor V1.
3. De eigen `static onAuth(token, options, context)` valideert de handtekening met het vaste Supabase-JWKS-endpoint en controleert toegelaten algoritme, `iss`, `aud`, `exp`, `sub` en eventuele `nbf`. Een lege, vervalste, verlopen of voor een ander Supabase-project uitgegeven JWT wordt geweigerd.
4. Na cryptografische verificatie zoekt de backend de actuele account/profielstatus, schorsing, complete onboarding, rolversie en aangevraagde context op. Clientopties zoals username, owner, mode en spectator zijn geen toestemming. Geef alleen minimale geverifieerde identiteit terug als `client.auth`; verspreid de JWT nooit in roomstate.
5. Binnen `onJoin` controleert de room opnieuw de resourcekoppeling, eventuele toegewezen matchspeler en capaciteit onder de juiste lock/reservering. Daarna mag pas staat worden verzonden. Hercontroleer bij reconnect ook de effectieve ban en spelersstoel; een oude reconnectcapability omzeilt geen nieuwe sanctie.
6. Hercontroleer **ieder schrijfcommando** op identiteit, actieve spelersstoel, contextlidmaatschap, mute/ban en relevante bevoegdheid. Een geldig JWT is geen algemene autorisatie. Verwerk een account-/sessierevocatie via actuele serverdata; geldig gebleven handtekening alleen is onvoldoende.
7. Vernieuw de access-JWT vóór nieuwe matchmaking. Voor langlopende sockets: implementeer een expliciet `auth.refresh`-commando dat de nieuwe JWT opnieuw verifieert, dezelfde `sub` eist en vervaldatum bijwerkt, zonder de partij te resetten. Bij verlopen auth geen nieuwe spel-/chatwrites tot succesvolle refresh; toon herstelstatus en pas de begrensde reconnectpolicy toe. De gewone Supabase refresh-token blijft bij de authclient en wordt nooit aan Colyseus gestuurd.

Supabase-tokens worden geverifieerd met `getClaims()` of een correct ingestelde JWKS-verifier met vast project/issuer/audience en vervaldatum. Vertrouw niet op alleen een gedecodeerde JWT of ongeverifieerde `getSession()`-payload. Een lokaal gecontroleerde JWT bewijst zijn geldigheid maar vervangt geen actuele schorsingscontrole. Supabase secret/service-role keys horen uitsluitend op de server, nooit in `NEXT_PUBLIC_*`, de browser of het Colyseus-clientpakket.

**Colyseus 0.18-valkuil:** de statische `onAuth` draait bij matchmaking en kan de instance-`onAuth` overslaan wanneer hij authdata oplevert. Implementeer de eigen Supabase-JWT-validatie daarom bewust in `static onAuth(token, options, context)`; vertrouw voor roomgebonden toegang niet uitsluitend op instance-`onAuth`. In `onJoin` en commandohandlers blijven resourcechecks verplicht. De standaard tokenloze toelating moet voor alle DartsPoint-rooms expliciet worden geweigerd.

De gebruikers-ID uit `sub` is de identiteit. De nickname is alleen weergave. **`Nick` is nooit een magische ownernaam.** Eerste owner wordt eenmalig toegekend aan een expliciet geverifieerde Auth-UUID via de beveiligde bootstrapprocedure uit het account-/operationsdocument. Nooit aan de eerste registratie, een username uit de browser of publiek e-mailmetadata.

Bij schorsing: transacteer sanctie + audit + outboxevent; trek actieve realtimeledenrechten in, informeer alle processen, blokkeer reconnect en beëindig of pauzeer de wedstrijd volgens een expliciete sanctie-uitspraak. Als realtime revocatie niet beschikbaar is, moeten writehandlers de database opnieuw controleren; een netwerkfout mag geen toestemming betekenen.

## 5. Spelprotocol en timingbalken

### Officiële staat

Minimaal: `matchId`, leesbaar `gameNumber`, `protocolVersion`, `rulesVersion`, `stateVersion`, `serverEpoch`, `roomId`, beide account-ID's, immutable regels, turn/visit/dart-ID, resterende punten, sets/legs/totale legs, dubbel-in geopend per speler, darts over, beginstand van beurt, phase, timingepochs, deadline, verbindingstoestand en laatste gecommitteerde worp. Schema bevat uitsluitend informatie die beide spelers/toeschouwers mogen zien. Geen tokens, e-mailadressen, IP's, privéberichten of moderatienotities.

Gebruik een gedeeld typepakket voor HTTP/WS-contracten en runtimevalidatie. `Room`-staat is een openbaar leesmodel van de officiële wedstrijd; de database heeft de duurzame toestand en ontvangsten. Een writehandler wordt per wedstrijd in één seriële queue uitgevoerd; `async`-handlers mogen niet onderling over transacties heen lopen.

### Commando's

Alle writes hebben `{ protocolVersion, commandId, expectedStateVersion, matchId }`. `commandId` is een unieke client-UUID; server registreert ook actor, payloadhash en resultaat. Een identieke retry geeft dezelfde ontvangst terug. Zelfde ID met andere payload wordt geweigerd. Commands hebben volgorde en zijn alleen in passende phase geldig.

| Clientcommando | Invoer | Serverbesluit |
|---|---|---|
| `match.ready` | Match/context, geen regels achteraf | Controle beide deelnemers, startmoment en eerste worp |
| `dart.stop_horizontal` | Dart-ID, phase-token | Horizontale positie berekenen op toegelaten servermoment; start verticale phase |
| `dart.stop_vertical` | Dart-ID, phase-token | Verticale positie berekenen; definitief raakpunt en impacttijd vastleggen |
| `match.forfeit` | Expliciete bevestiging, match-ID | Geautoriseerde opgave verwerken; dubbele verzoeken idempotent |
| `match.resync` | Laatst ontvangen versie/event-ID | Snapshot plus ontbrekende gecommitteerde events sturen |
| `chat.send` | Channel-ID, message-ID, tekst | Lidmaatschap, beleid, sanitatie, rate limit, opslag en distributie |

**Verboden officiële clientvelden:** score, treble/doublelabel, winnaar, nieuwe Elo, zelfgekozen `x/y`, definitieve `elapsedMs`, leg-/setscore. De client geeft uitsluitend acties door. Onbekende velden afwijzen in writepayloads; geen spread van willekeurige clientobjecten naar domeinstaat.

### Behouden gevoel, andere autoriteit

De bestaande beweging is een driehoeksgolf. Horizontaal duurt een cyclus 2200 ms, verticaal 2500 ms. Startfase is 0,25 en de genormaliseerde coördinaten lopen van −1,14 tot +1,14. Behoud deze waarden in `TimingRulesV1` zodat dezelfde snelheid en miss-zone blijven bestaan:

```text
u = ((serverMoment - phaseEpoch) / periodMs + 0.25) modulo 1
p = u < 0.5 ? 2*u : 2 - 2*u
coordinate = (p - 0.5) * 2.28
```

De server bepaalt phaseEpoch en periode. De client tekent alleen een interpolatie met `requestAnimationFrame`; er hoeft geen netwerkpakket per beeldframe te worden verstuurd. Wanneer de beurt begint gaan de indicatoren automatisch lopen zoals in de gekozen UI. Na horizontale lock start de verticale phase. De tweede klik bepaalt de worp. Volgende phase/volgende dart krijgt een nieuw phase-token zodat een vertraagd dubbelklikpakket geen nieuwe worp kan beïnvloeden.

### Latentiebeleid voor V1 — expliciet, meetbaar

**Voorgesteld beleid: serverontvangsttijd is beslissend, zonder client-timestampcompensatie.** Dat is eenvoudig controleerbaar en voorkomt terugdateren naar een gunstiger positie. Kloksynchronisatie gebruikt periodieke ping/echo's en een gefilterde offset/RTT-schatting uitsluitend voor de weergave. De browserklok is nooit scoreautoriteit. Toon tijdens een lopend lockverzoek een korte pendingtoestand; de uiteindelijk vastgezette indicator is de door de server bevestigde positie.

Dit beleid kan bij hoge latentie merkbaar minder prettig zijn. Voor ranked admission is daarom een voorstel: gedurende vijf seconden meten, maximaal 180 ms mediane RTT en 60 ms p95-afwijking; boven de grens waarschuwen en geen nieuwe ranked partij starten. Dit zijn **te ijken startwaarden**, geen bewezen infrastructuurcapaciteit. Onderbreek een gestarte partij niet automatisch op basis van één trage ping. Log RTT, jitter en serverontvangsttijd zonder private tokens. Test 20/80/180/350 ms plus packet loss. Indien compensatie later wordt toegevoegd: alleen begrensde serverafgeleide compensatie, geversioneerd per match en opnieuw getest; nooit vertrouwen op door de client aangeleverde klikmomenten.

Ook een servergestuurd timingspel in de browser kan door een bot worden bediend. Claims als “cheatproof” zijn onjuist. Rate limits, herkenbare automatiseringspatronen, herhaalde tegenstanders, onmogelijke inputcadans en moderatoronderzoek zijn aanvullende middelen; legitieme perfecte worpen alleen zijn geen bewijs van fraude.

## 6. Vlucht, impact, scorechip en één waarheid

1. Bij toegelaten verticale stop berekent de server met gedeelde geometrie het raakpunt.
2. Schrijf een duurzame `dart_committed` ontvangst met dart-ID, raakpunt, scorelabel, starttijd en `impactAt`. Het raakpunt staat nu vast; de zichtbare score blijft de oude.
3. Zend `dart.launched`. Alle clients tekenen dezelfde pijl vanuit het gezichtspunt van de gebruiker naar exact de door de geometrie bepaalde **punt**, niet het midden van de SVG.
4. Op serverdeadline `impactAt` voert de server een idempotente `dart_impact` uit, werkt score/beurt/checkout/statistieken bij en commit dit. Zend daarna `dart.impacted` en de nieuwe versie.
5. De UI toont score en chip pas vanaf de bevestigde impact. Een late ontvanger toont de pijl meteen op de juiste plaats en de actuele stand. Hij speelt niet eerst een nieuwe volledige vlucht af om later pas de al bekende stand te tonen.
6. De chip (`T20`, `D20`, `20`, `BULL`, `25`, `MIS`) verdwijnt bij de volgende worp. De checkoutstrip wordt na iedere gecommitteerde impact opnieuw berekend voor de actieve speler en resterende darts; hij verdwijnt als er geen uitgooi mogelijk is.

De vluchtduur is een geversioneerde presentatieparameter, afgestemd op de bestaande animatie. Een verminderde-beweginginstelling mag de animatie inkorten/vervangen, maar verandert de officiële impacttijd niet. `onAnimationComplete` bevestigt uitsluitend presentatie, nooit score, beurt of winnaar. Stop een tab, sluit een telefoon of laat de clientcallback ontbreken: serveruitslag blijft correct. Bij procescrash tussen commit en impact moet herstel dezelfde pending dart exact eenmaal afwerken.

## 7. Spelregels en Elo

### Regels

- **301:** dubbel-in én dubbel-uit als vaste aangeboden V1-standaard. Singles/trebles vóór de openingsdubbel tellen niet; ze verbruiken wel een pijl. BULL geldt als dubbel.
- **501 en 701:** straight-in, dubbel-uit als standaard. Instellingen uit uitnodiging/toernooi worden bij acceptatie definitief vastgezet; geen mid-match wijzigingen.
- Maximaal drie pijlen per beurt. Bust bij negatief, één over of nul zonder vereiste dubbel; terug naar beginstand van de beurt. Dubbel-in-openstatus wordt bij een bust hersteld naar de status aan het begin van die beurt, conform gedeelde engine.
- Best-of legs oneven 1–21; best-of sets oneven 1–7, met best-of legs per set. Maak ook in toernooi- en divisiewedstrijden expliciet welke ondersteunde regels gelden; bestaande competitiemodellen bieden momenteel legs, niet automatisch elk setsformat.
- Starter beurt/leg/set volgt de bestaande gedeelde engine. Sla de initiële, servergekozen starter op; geen herloten door verversen.
- Undo bestaat alleen bij lokaal oefenen/casual bot waar dat expliciet is toegestaan. Geen client-undo in multiplayer of ranked. Beheercorrecties zijn aparte geaudite transacties met gevolgencontrole.

### Elo exact overnemen

```text
E_A = 1 / (1 + 10^((R_B - R_A)/400))
ΔA  = 32 * (S_A - E_A)        // S_A: winnaar 1, verliezer 0
ΔB  = -ΔA
R'_A = R_A + ΔA; R'_B = R_B + ΔB
```

Start 1500. Niet afronden bij opslag; afronden alleen voor weergave. Eén zero-sumwijziging voor de **volledige** ranked wedstrijd, nooit per pijl, leg of set. Bestaand prototypebeleid is wit zolang minder dan tien ranked wedstrijden of minder dan vijf verschillende tegenstanders; daarna rood bij afgeronde rating <1450, geel 1450–1549, groen ≥1550. Behoud deze gekozen bandbreedte rond 1500; verander dit niet stilzwijgend terug naar elke fractie onder/boven 1500. Nicknamekleur is onafhankelijk: owner blauw, admin oranje, VIP goud met kroon, gewone speler wit.

Praktijk, bots en casual geven geen Elo. **Voorgesteld productiebeleid:** een gespeelde ranked wedstrijd en opgave/disconnectverlies nadat de wedstrijd werkelijk is gestart tellen mee; bye en no-show vóór de start niet. Dubbele absentie, infrastructuurstoring en geannuleerde wedstrijd geven geen Elo. Vastleggen onder `rating_policy_version`; terugtrekken vlak voor verlies mag Elo niet ontwijken. Handmatige uitzonderingen vereisen eigenaarbesluit, reden, audit en correctieboekingen.

Finalisatie is één database-transactie: lock match + beide ratingrijen in vaste ID-volgorde; controle geldige eindstaat en uniek finalisatie-ID; schrijf resultaat + twee ledgerregels + aantallen/tegenstanders + competitievoortgang/outbox. Bij retry dezelfde uitkomst teruggeven. Gelijktijdige finale-events of workerrestart mogen geen tweede Elo-effect hebben. Dwing maximaal één actieve competitieve wedstrijd per account af.

## 8. Reconnect, no-shows en procesherstel

**Voorstel voor standaardpolicy**, bij start vastgeklikt en zichtbaar in de regels: 30 seconden per beurt, 90 seconden cumulatief herstelbudget per speler per wedstrijd, 120 seconden om een toegewezen match te accepteren. Toernooi-instellingen mogen deze waarden binnen beheerde grenzen vervangen. Herhaald disconnecten reset geen budget.

| Situatie | Gedrag |
|---|---|
| Tijdelijke netwerkuitval | `onDrop` reserveert spelersstoel via `allowReconnection`; spel pauzeert na eventuele al gecommitteerde impact. Hersteltijd en oorzaak zichtbaar |
| Herstel binnen budget | Identiteit/schorsing opnieuw controleren; snapshot + eventcursor; fase hervatten met bevroren resterende tijd, geen nieuw willekeurig doel |
| Hersteltijd verstreken bij één speler | Server-gecommitteerde opgave/niet-teruggekeerd; tegenstander wint volgens policy, audit met tijdlijn |
| Beide spelers weg | Geen willekeurige winnaar. Na budget `abandoned`/review, geen Elo; organisator beslist competitievervolg |
| Beurttijd verstreken | Resterende pijlen als misses afhandelen, bezoek sluiten, waarschuwing. Voorgesteld: twee opeenvolgende timeouts leveren opgave op; succesvolle eigen beurt reset deze teller |
| Geen check-in | Niet in bracket opnemen; wachtlijst alleen vóór bracketlock gecontroleerd opschuiven |
| Eén speler niet klaar voor toegewezen match | Deadline, herinnering, daarna no-show-walkover met reden; geen Elo vóór start |
| Beide spelers no-show | Geen automatische winnaar; organisator beslist dubbele diskwalificatie/doorschuiving. Geen verzonnen 3–0 uitslag |
| Expliciete opgave | Bevestigingsdialoog en serveractie; socket sluiten alleen is niet dezelfde bewuste actie |
| Server-/database-uitval | Systeempauze, geen no-showstraf. Hervat uit duurzaam log of markeer ongeldig met reden |
| Ontbrekende speler trekt zich definitief terug | Leg terugtrekking vast, verwijder toekomstige reserveringen en adjudiceer resterende fixtures expliciet |

Colyseus 0.18 onderscheidt `onDrop`, `onReconnect` en permanente `onLeave`. Bewaar de actuele reconnecttoken uitsluitend als tijdelijke sessiecapability; hij roteert bij reconnect. Mobiele reload vereist herstel van de account plus een beveiligde hervatroute; er mag geen tweede actieve spelersstoel ontstaan. `allowReconnection` alleen is geen persistent crashherstel.

V1 houdt iedere geaccepteerde spelactie duurzaam bij. Snapshot na impact + append-only events/receipts zijn voldoende om de partij na procesrestart opnieuw te laden. Een matchlease met monotonisch oplopend fencingnummer voorkomt twee schrijvers na timeouts. Iedere commit controleert leasehouder, fencingnummer en stateVersion. Een verlopen eigenaar kan dus geen oude updates meer schrijven.

Deploy: eerst nieuwe partijen blokkeren, actieve rooms laten uitspelen, daarna gecontroleerd stoppen. Als onderhoud uitstel niet mogelijk maakt, checkpoint/pauze expliciet registreren en spelers informeren. Het deployscript mag geen actieve wedstrijden abrupt als verloren afmelden. Graceful shutdown is een hulpmiddel; de domeinpolicy moet vóór SIGTERM al uitgevoerd zijn.

Het bijgeleverde operationscontract concretiseert dit met uitsluitend loopback-toegankelijke `POST /internal/deploy/drain`, `GET /internal/deploy/status` en `POST /internal/deploy/resume`, beveiligd met server-only `INTERNAL_DEPLOY_TOKEN`. De gedeelde Redis-drainvlag wordt door web, uitnodigingen, worker en matchmaking gerespecteerd; bestaande partijen en reconnects blijven werken. Status moet exact `{ draining: true, activeMatches: 0, pendingImpacts: 0, pendingWrites: 0, safeToStop: true }` opleveren voordat containers worden vervangen. De gate blijft tijdens vervanging bestaan; een nieuwe service mag hem niet automatisch wissen. Na maximaal twintig minuten zonder veilige stop breekt de deployment af en wordt de oude omgeving hervat; nooit geforceerd doorschakelen. Databasewijzigingen volgen pas na geslaagde drain. Bij onderbroken pipeline voert de operator de gedocumenteerde inspectie/hervatprocedure uit.

## 9. Competities en automatische borden

**Toernooivormen:** knock-out en dubbele eliminatie. **Seizoenen met divisies:** een aparte competitie/spelvorm. **Automatische bordplanning:** een optie, geen derde toernooivorm.

- DartsPoint is V1-organisator. Alleen bevoegde beheerders publiceren events en beheren deelname. Publieke pagina toont alleen gepubliceerde velden.
- Registratie, regels akkoord, Elo/minimumwedstrijden, VIP-only, eventuele goedkeuring, wachtlijst, check-in en seeding blijven afzonderlijke stappen.
- Bracket is een gerichte acyclische grafiek met expliciete winner-/loserbronnen. Een onbesliste bron is geen bye. Byes hebben geen gegooide darts, geen Elo en geen verzonnen wedstrijdstatistieken.
- Dubbele eliminatie: winners- en losersbracket; tweede nederlaag elimineert. Wint de ongeslagen finalist de eerste finale, klaar. Wint de finalist uit het losersbracket, volgt een resetfinale. Champion pas na geldige afhandeling.
- Een uitslagcorrectie die downstreamwedstrijden raakt mag niet stilzwijgend gespeelde wedstrijden wissen. Vóór downstreamstart kan het systeem opnieuw opbouwen; na downstreamstart is een expliciet correctieplan met organisatorbevestiging en audit vereist. De huidige lokale helper wist downstream; dat moet voor productie aangescherpt worden.
- Planner selecteert alleen startklare matches met bekende spelers, voldane rusttijd, geldige deelname en geen andere actieve reservering. Hij lockt beschikbare borden en spelers transactioneel. Eén bord → maximaal één toegewezen/lopende wedstrijd; één speler → maximaal één competitieve reservering. Conflicterende twee workerprocessen mogen niet dubbel boeken.
- Bordinstelling bestaande prototype: 1–16, rust 0–900 s, automatisch/handmatig. Bewaar deterministische wachtvolgorde en bied auditbare handmatige prioriteit; laat matches niet oneindig verhongeren.
- Seizoen: één divisie per speler per seizoen, round-robin, eventuele bye/rustweek, wekelijkse deadlines. Stand: 3 punten bij winst, daarna legsaldo, legs voor, onderling resultaat bij precies twee gelijkstaande spelers; daarna gedeelde rang. Alfabetische weergave is geen sportieve tie-break.
- Promotie/degradatie gebruikt de getoonde divisie-eindstand, nooit de Elo-ladder. Gelijke stand op de grens blokkeert automatische verplaatsing en vraagt beslissingswedstrijd/organisatorbesluit. Afsluiten met open fixtures vereist reden en expliciete afhandeling.
- Terugtrekking in een seizoen: kies en publiceer vóór start een policy (aanbevolen V1: gespeelde uitslagen blijven, toekomstige fixtures worden administratieve walkovers zonder Elo). Bewaar eigen resultaatsoort zodat fictieve legs niet als gegooide scores/statistieken meetellen.

## 10. Sociale laag en chat

- Vriendschap: verzoek sturen, ontvangen, accepteren/weigeren, uitgaand annuleren, vriendschap verwijderen. Canonieke accountparen voorkomen twee parallelle vriendschappen. Reeds geaccepteerd + retry is veilig.
- Privéchat: serverlidmaatschap van exact twee accounts, beleid iedereen/vrienden/niemand voor **nieuwe** gesprekken, blokkade in beide richtingen voorkomt nieuwe verzending. Bestaande historie blijft voor de deelnemers leesbaar volgens bewaarbeleid.
- Persoonlijke mute: verbergt notificaties/weergave voor één ontvanger; geeft de ander geen globale sanctie. Kamermute beperkt schrijven in die kamer. Platformmute beperkt alle toepasselijke chats. Schorsing ontneemt spel- en realtime-entree. Dit zijn verschillende rechten.
- Berichten sluiten sluit een tab, niet het gesprek of zijn historie. Geen nieuwe tab forceren bij binnenkomend bericht; toon ongelezen badge/inbox. Concept en tabvoorkeur horen bij de gebruiker, nooit in gedeelde roomstaat.
- Chatvolgorde in wedstrijd: **spelchat, kamerchat, privéchats**. Lobby: alleen privé-inbox. Desktop behoudt bestaande indeling; mobiel opent dezelfde 60%-drawer met zicht op het actieve bord.
- De kamerchat is alleen beschikbaar aan huidige kamerleden; bestaande kamergeschiedenis is geen publieke REST-feed. Matchchat aan deelnemers en toegelaten toeschouwers; na afloop read-only voor gerechtigde geschiedenisgebruikers. Privéchathistorie nooit aan andere kamerleden of standaard alle admins ontsluiten.
- Moderator mag een gemeld bericht en strikt noodzakelijke context bekijken via een geaudite case. Geen algemene “lees alle privéchats”-knop als impliciet adminrecht.
- Berichten eerst duurzaam opslaan, daarna event met message-ID en channelcursor. Clientdeduplicatie op ID; ontbrekende events via gepagineerde historie. Plain text renderen, geen HTML; maximale lengte, serverrate limits en redactionevents met tombstone.

## 11. Minimale integratieacceptatie

1. Twee echte accounts op desktop/Android/iOS spelen tegen elkaar; scores, pijlpuntaankomst en beurtstatus zijn gelijk.
2. Toeschouwer kan geen `dart.*`, ready of forfeit uitvoeren, ook niet met zelfgemaakte WebSocketpayloads.
3. Clientscore, coordinates, username/role spoofing en oude phase-tokens worden geweigerd.
4. T20/bull/dubbelgrenzen leveren hetzelfde label in renderer en engine, inclusief aangrenzende single20; behoud bestaande geometriechecks.
5. Duplicate/out-of-order/parallel commando's veranderen de wedstrijd hoogstens eenmaal. Refresh tijdens vlucht verandert niets aan de uitkomst.
6. Stop animatiecallback, throttle browser, schakel reduced motion in: officiële impact/score blijft correct.
7. Reconnect tijdens horizontaal, verticaal, vlucht, checkout en matchfinalisatie; sluit/heropen mobiel; slechts één spelerstoel.
8. Kill proces vóór dartcommit, na commit vóór impact, en na resultcommit vóór outboxsend. Iedere gecommitteerde dart/resultaat wordt exact eenmaal zichtbaar.
9. 301 dubbel-in, bust na openen, BULL finish, ongeldige singlefinish, sets/legs en wisselende starter zijn gedeeld getest.
10. Ranked finale retry/crash verwerkt Elo éénmaal; casual/bot/no-show/bye nooit. Twee spelers blijven samen dezelfde ratingtotale som houden.
11. Fifty-seat concurrent-join test: persoon 51 wordt geweigerd, spectator telt mee, tweede tab telt niet dubbel.
12. Ban/mute tijdens join, reconnect en send werkt direct; token met oude rol geeft geen beheerrecht.
13. Toernooideelnemer mag alleen eigen toegewezen match spelen; onbekende/uitgeschreven speler uitsluitend toeschouwen als toegang toegestaan is.
14. Twee schedulers tegelijk kunnen nooit hetzelfde bord of dezelfde speler reserveren. Beide paden van de resetfinale slagen.
15. Lobby toont geen kamerchat; privégesprek sluiten bewaart geschiedenis en gesloten tab; vriendenpagina blijft zonder inbox.
16. Een drain/deploy veroorzaakt geen fictieve no-show, verlies of dubbele Elo. Minimaal één hersteltest vanaf backup vóór productie.

## Bronnen en versiecontrole

De technische architectuur en alle als voorstel gemarkeerde policies hierboven zijn DartsPoint-ontwerpkeuzes. API-verificatie, uitsluitend primaire bronnen, geraadpleegd 12 oktober 2026:

- https://docs.colyseus.io/migrating/0.18 — packagefamilie 0.18 en schema 5.
- https://docs.colyseus.io/auth/room — statische auth, tokenoverdracht en `client.auth`.
- https://docs.colyseus.io/room — room- en timing-API.
- https://docs.colyseus.io/room/reconnection — lifecycle en reconnectvoorwaarden.
- https://docs.colyseus.io/server/graceful-shutdown — lifecycle bij stoppen.
- https://docs.colyseus.io/scalability — één process owner per room, gedeelde presence/driver bij schalen.
- https://docs.colyseus.io/server/presence — LocalPresence versus RedisPresence.
- https://docs.colyseus.io/getting-started/react — SDK-aansluiting in React.
- https://supabase.com/docs/guides/auth/jwts — tokenverificatie en JWKS.
- https://supabase.com/docs/guides/database/postgres/row-level-security — toegangsregels en secret-keygrenzen.
