# DartsPoint V1 — functioneel canon en productiecontract

Versie: 12 oktober 2026. Dit document is gebaseerd op de meegeleverde Sites-broncode en de drie bestaande projectdocumenten in `source/docs/`. De gekozen Afterhours-UI is bindend. De productieomgeving vervangt de gesimuleerde gegevens en lokale stores door echte diensten; zij ontwerpt de gebruikersomgeving niet opnieuw.

## 1. Wat de overdracht wel en niet bewijst

Het prototype bevat veel echte, herbruikbare domeinlogica: bordgeometrie, dartscore, dubbel-in/dubbel-uit, legs/sets, Elo, uitgooimogelijkheden, brackets, divisies en bordplanning. Het bevat ook lokale simulaties van accounts, tegenstanders, aanwezigheid, vrienden, chats en beheer. Een werkende knop in het prototype betekent niet dat de achterliggende productiedienst al bestaat.

Gebruik in dit document de volgende onderscheidingen:

| Status | Betekenis | Opdracht voor de VPS |
| --- | --- | --- |
| Bestaande pure logica | Functies rekenen daadwerkelijk en zijn herbruikbaar. | Verplaatsen of importeren in een gedeeld TypeScript-domeinpakket; server wordt beslissend. |
| Bestaande interface | De component, interactie en vormgeving bestaan. | Exact behouden, koppelen aan getypeerde gegevens en echte fout-/laadstaten. |
| Lokale demo | Gegevens staan in geheugen, localStorage of sessionStorage; vaste voorbeeldspelers. | Vervangen door accountgebonden persistente records en realtime-events. |
| Sites-serverdemo | D1 controleert demoworpen zonder echte spelersauthenticatie. | Vervangen door geautoriseerde Colyseus-wedstrijden en PostgreSQL. |
| Nieuw productiecontract | Nodig voor de gevraagde echte V1, nog niet bewezen in Sites. | Bouwen en testen; niet als reeds af beschrijven. |

Productieteksten mogen geen demoacties, vaste Nick-identiteit of fictieve aanwezigheid bevatten. Staging mag expliciet benoemde fixtures gebruiken. Het eerste echte owneraccount behoort aan de gebruiker van deze overdracht en wordt veilig aan diens geverifieerde e-mailadres gekoppeld; de naam `Nick` geeft op zichzelf nooit rechten.

## 2. Routekaart en gebruikersreis

| Route / deel | Bestaande bron | Vast gedrag |
| --- | --- | --- |
| `/` | `app/page.tsx`, `components/darts-marketing.*`, `lib/darts-public-data.ts` | Publieke marketingpagina: hero, CTA, spelvoorbeeld, officiële events, Elo, divisieladders, kamers en FAQ. |
| `/inloggen` en `/registreren` | Authcomponenten en betreffende routebestanden | Eén wachtwoordloze e-mail → OTP → profielroute. Registratie is dezelfde geverifieerde identiteit, geen apart wachtwoordaccount. |
| `/lobby` | `components/darts-lobby.*` | Overzicht van alle kamers en promotie van actieve officiële toernooien. Navigatie naar vrienden, privéberichten en profiel. |
| `/spelen` | `components/darts-app.tsx`, `components/darts-game.tsx` | Losse wedstrijd en de kamercommunity; desktop en mobiel dezelfde actieve partij. |
| `/oefenen` | `components/darts-practice.*`, `lib/darts-practice.ts` | Vrij oefenen, dubbels, bull, finish, vijf-pijlenintroductie en weekuitdaging. Geen Elo. |
| `/clubhuis` | `components/darts-v1-hub.*` | Historie, records, badges, raakpunten, officiële toernooien en voorkeuren. |
| `/divisies` | `components/darts-divisions.*`, `lib/darts-divisions-*` | Zelfstandige seizoenscompetitie: ladder, rondes, eigen partijen en actieve divisiebadge. |
| `/toernooi/[id]` | `components/darts-tournament-room.*` | Speciale eventkamer: borden, bracket, deelnemers, kijken en toegewezen eigen wedstrijd. |
| `/beheer` | `components/admin/` | Afzonderlijke platformbackoffice met één titel per pagina. |
| Oude ontwerpvarianten | `app/[variant]/page.tsx`, `lib/designs.ts` | Historische concepten, geen ontwerpkeuze in het product. Bestaande redirects naar de vaste spelervaring behouden. |
| `/api/fair-play` | `app/api/fair-play/route.ts`, `lib/darts-fair-play-*` | Alleen referentie voor de oude serverdemo; geen tweede autoritatieve productie-engine naast Colyseus. |

Na normale login volgt de lobby. Een veilige interne `next`-bestemming mag de bedoelde partij/divisie/eventpagina herstellen. Het openen van een bestemming verleent nooit deelname- of beheertoegang. Uitloggen beëindigt de echte sessie en verbreekt de bijbehorende realtimeverbindingen. De spelpagina biedt via logo en profiel een weg terug naar de lobby.

## 3. E-maillogin, OTP en eerste profiel

Dit is de nieuwste gebruikerskeuze en vervangt oudere documentatie over een registratievoorbeeld vóór het openen van de vaste Nick-demo.

1. Bezoeker voert e-mailadres in. Geef een neutrale verzendbevestiging; maak niet openbaar of een adres al bestaat.
2. De server verstuurt een eenmalige code via de geconfigureerde authenticatiedienst en de DartsPoint-mailtemplate.
3. De bezoeker voert de code in, met plakken, numeriek toetsenbord, duidelijke fouten en een toegankelijke opnieuw-versturenactie.
4. Pas na serververificatie bestaat een ingelogde sessie. Een ingevuld of lokaal opgeslagen adres is geen verificatie.
5. Bestaat voor die geverifieerde identiteit nog geen gebruikersnaam, dan volgt verplichte naamkeuze. Pas na succesvolle, unieke registratie gaat de gebruiker verder.
6. Terugkerende spelers slaan naamkeuze over. E-mail blijft de loginidentiteit; spelers zien de gebruikersnaam.

De nieuwe Sites-flow is een visueel en interactief prototype, geen bewijs van echte mailbezorging. `lib/darts-demo-auth.ts` gebruikt zes cijfers, tien minuten geldigheid, zestig seconden resend-cooldown, maximaal vijf pogingen per challenge en vijf verzendacties per vijftien minuten. De preview toont een e-mailvoorbeeld; de verificatie en limieten zijn lokaal. Alleen een e-mailfingerprint plus gekozen profiel wordt lokaal bewaard, geen plaintext e-mailadres of OTP. Dit maakt de demo niet tot veilige authenticatie. De uiteindelijke spelomgeving blijft de expliciet benoemde Nick-demo. In productie mogen een zichtbare democode, demo-ownerlogin, client-side verificatie en een vaste Nick-game-identiteit nooit als fallback overblijven.

Productievereisten: eindige codegeldigheid, servergebonden poginglimieten en resend-cooldown, geen hergebruik van geverifieerde codes, geen plaintext-OTP in applicatielogs, geen e-mailadres in openbare roomstate, veilige sessieherstelroute, CSRF-/origincontroles waar relevant, en expliciete fouten bij een verlopen aanvraag. OTP-mails krijgen zowel HTML als platte tekst. De mail bevat doel, code, geldigheidsduur, afzenderidentiteit en uitleg voor een ongevraagde code. Links en logoassets gebruiken de ingestelde eigen origin.

Gebruikersnaam moet server-side worden gevalideerd en uniek zijn met een vastgelegde normalisatie. De nieuwe bron kiest 3–20 tekens uit A–Z, 0–9, streepje en underscore, zonder spaties, met case-insensitive uniekheid en gereserveerde systeemnamen. Neem deze zichtbare regels over tenzij de gebruiker later anders kiest. Bewaar een onveranderlijke account-ID als sleutel; een naamwijziging mag vrienden, Elo, historie, sancties of deelnemersrecords niet breken. Maak de eerste owner via een gecontroleerde bootstrapprocedure op geverifieerde account-ID, nooit via de eerste willekeurige registratie, e-mail uit een verzoekbody of een geraden nickname. De precieze authimplementatie en deploymentwaarden staan in de architectuur- en uitroldocumenten.

## 4. Spelersidentiteit, rollen en moderatie

### 4.1 Drie onafhankelijke visuele signalen

| Signaal | Weergave | Betekenis |
| --- | --- | --- |
| Nickname | Eigenaar blauw `#7cb8ff`; admin oranje `#ffad6b`; VIP goud `#e9c66f` met kroon; speler wit `#edf4f0` | Rol/status, niet spelsterkte. |
| Elo `[rating]` | Wit, rood, geel of groen volgens §7 | Speelsterkte en plaatsingsstatus. |
| Divisiebadge | Afzonderlijke compacte badge met divisie | Lidmaatschap van uitsluitend het actieve seizoen. |

`PlayerName`, `RatingValue` en `DivisionBadge` zijn de gedeelde componenten. Gebruik dezelfde componenten in scoretabel, lijsten, chat, profiel, vrienden en ladders. De grote resterende wedstrijdscore (bijvoorbeeld 321) blijft het herkenbare crèmekleurige scorevak; `[1500]` is de Elo-rating en moet daarmee niet worden verward.

### 4.2 Bronwaarheid en vereiste productieautorisatie

De bron gebruikt `PlayerRole = owner | admin | vip | player`. Kamermoderator is een aparte toewijzing op de kamer; het bestaande beheer laat daarvoor owner of admin kiezen. De bestaande lokale helper beschermt jezelf en de owner, maar is geen complete hiërarchische serverautorisatie en blokkeert bijvoorbeeld admin-tegen-admin niet volledig. Dit moet in de productievertaling worden aangescherpt.

| Actor | Productierechten | Beperkingen |
| --- | --- | --- |
| Owner | Platforminstellingen, rolbeheer, officiële events/seizoenen, kamers, globale en kamermaatregelen, audit. | Geen onbedoelde verwijdering/degradatie van de laatste owner; overdracht is afzonderlijke beveiligde actie. |
| Admin | Toegekende moderatie- en operationele bevoegdheden. | Geen ownerpromotie, secrets, bootstrap of ingreep tegen gelijk/hoger bevoegd personeel zonder expliciet ownerrecht. Beheer-API controleert elke handeling. |
| Kamermoderator | Waarschuwen, tijdelijke kamermute, verwijderen/opheffen binnen toegewezen kamer. | Geen globaal accountbeheer of maatregelen buiten die kamer; geen gelijke/hogere staff sanctioneren. Geen nieuwe nicknamekleur noodzakelijk. |
| VIP | Gouden naam/kroon; toegang tot VIP-events waar ingesteld. | Geen impliciete moderatiebevoegdheid. Een betaald/VIP-lidmaatschap is in productie bij voorkeur los van staffrechten opgeslagen. |
| Speler | Eigen profiel/voorkeuren, sociaal verkeer, spelen, toegestane deelname, melden. | Geen rollen, rating, scores, deelname of toegang van anderen muteren. |
| Toeschouwer | Geautoriseerde zichtbare wedstrijdstate ontvangen en toegestane chat gebruiken. | Geen worpen, scoremutaties, gereedmelding of resultaat voor spelers versturen. |

Het ownerpaneel in Sites is geen blauwdruk om alles client-side af te schermen. UI-verbergen helpt de bediening; serverrechten zijn beslissend. Bewaar actor-ID, doel-ID, scope, actie, reden, begin/eind en intrekking in auditbare records.

### 4.3 Persoonlijke acties versus sancties

- Vriendschapsverzoek sturen, accepteren, weigeren, intrekken en vriendschap verwijderen zijn aparte toestanden. Een verzonden verzoek wordt niet automatisch geaccepteerd.
- Persoonlijke mute verbergt iemands inhoud voor de gebruiker; het geeft die ander geen platformstraf.
- Blokkeren verhindert nieuw ongewenst contact volgens het ingestelde beleid. De prototypeactie verwijdert open vriendschapsverzoeken; productie moet ook de ontvangende serverpaden handhaven.
- Melden legt speler, kamer, Game ID, reden en bericht-/wedstrijdcontext vast. De melder kan bewijs niet als ongecontroleerde beheerinstructie injecteren.
- Kamerbeheer heeft `warn`, `mute`, `remove`; reden minimaal vijf tekens, tijdelijke mute/verwijdering in de bron 1–60 minuten. Opheffen wordt gelogd.
- Globaal beheer heeft waarschuwing, chatbeperking en accountschorsing; reden minimaal vijf tekens, tijdelijke maatregel 1 minuut–30 dagen in de bron. Intrekken vergt een reden.
- Een globale schorsing moet in productie login-/joins-/spel-/chatrechten en bestaande verbindingen daadwerkelijk beïnvloeden. Het huidige administratieve statustabelletje doet dat nog niet volledig.
- Meldingen: open → in behandeling → afgehandeld, met toelichting bij sluiten en koppeling naar een eventuele maatregel.

## 5. Lobby, kamers, vrienden en chat

### 5.1 Lobby

De lobby is een overzicht van alle kamers, zoeken/filteren, favoriete kamers en promotie van officiële actieve evenementen. Een bestaande eigen partij kan expliciet worden hervat. Vrienden en privéberichten hebben aparte navigatiepagina's. Geen kamerledenlijst of kamerchat in de lobby: de speler is nog niet aan een kamer verbonden. De vriendenpagina bevat geen inboxoverzicht.

Kamers tonen naam, categorie, bezetting/maximaal en relevante toegang. Gewone kamers hebben maximaal 50 aanwezigen. Voor productie moeten bezetting, vol/gesloten en toelating atomair aan de server worden gecontroleerd; een stale kaartje verleent geen plek. Favorieten mogen voorkeuren zijn, geen autorisatietoekenning.

Kamercategorieën: sociaal, ranked, beginners en toernooi. Status: open, gesloten voor instroom, privé/op uitnodiging. Kamerbeheer bewaart beschrijving, regels, ratingbereik, moderator en capaciteit. Sluiten stopt nieuwe instroom maar verbreekt bestaande wedstrijden niet. Alleen een lege gesloten kamer zonder wedstrijden mag worden verwijderd. Verkleinen onder de actuele bezetting wordt afgewezen.

De toernooicategorie opent een concreet event of een eventkiezer. Een toevallig gelijke kamernaam mag een sociale kamer niet overnemen; gebruik stabiele IDs en expliciete relaties.

### 5.2 Vrienden en spelersacties

Lijsten laten huidige aanwezigheid zien: offline, beschikbaar, speelt, kijkt en huidige kamer waar die informatie gedeeld mag worden. De bron simuleert dit; productie gebruikt presence met heartbeat/verlooptijd en meerdere apparaten. Geen onbekende naam als online presenteren.

Klik/tik op een naam opent één dropdown met toegestane acties: profiel, uitnodigen, vriend toevoegen/verwijderen of verzoekactie, privéchat, persoonlijke mute, blokkeren, melden en moderatie waar toegestaan. Behoud focus bij het openen van een vervolgmodal.

Een speluitnodiging opent eerst de instellingenmodal. De uitnodiging bewaart de exacte regels; acceptatie start die wedstrijd, afwijzen/ verlopen/intrekken doet dat niet. Productie moet dezelfde speler niet tegelijkertijd in twee actieve wedstrijden laten starten. De demotegenstander en expliciete demoacceptatie vervallen voor echte personen.

### 5.3 Chatkanalen en levenscyclus

In een wedstrijd is de volgorde **Spelchat → Kamerchat → privétabs**. Buiten een kamer zijn alleen privégesprekken beschikbaar. Elk privétab heeft een eigen sluitknop en kan met Delete worden gesloten. Sluiten bewaart berichten en concepttekst; een gesloten gesprek springt niet door een inkomend bericht spontaan weer open. Het blijft via Berichten of vrienden heropenbaar. Na het sluiten van de laatste privétab: lege staat in de lobby; Spelchat als terugval in de kamer.

De opslag `lib/darts-chat-state.ts` maakt onderscheid tussen histories, drafts en `openPrivateTabs`. Behoud dit onderscheid in productie. Bezorging, gelezen-status en ongelezen aantallen vereisen echte database-/realtimegegevens; voeg geen verzonnen vinkjes toe. Een nieuwe tab openen geeft geen toegang tot andermans thread.

Voorkeuren voor nieuwe privéchats: iedereen, alleen vrienden, niemand. Bestaande gesprekken blijven beschikbaar conform de bestaande interactie. Geblokkeerde personen en sancties gaan vóór gemak. Snelle zinnen blijven beschikbaar. Rustige eigen beurt buffert nieuwe inkomende inhoud visueel en toont deze na de beurt; de serverbezorging mag hierdoor niet verloren gaan.

Productie: tekstlimieten, server-side rate limits, kanaallidmaatschap, escaping, blokkeer-/muteregels en abonnementsbeëindiging bij vertrek. Chatberichten krijgen server-ID en tijd. De individuele client bepaalt geen afzender/rolkleur van anderen. Nooit mailadressen of authclaims meesturen in openbare communitystate.

## 6. Gameplay en wedstrijdregels

### 6.1 Spelvormen

| Instelling | Broncontract | Productiegedrag |
| --- | --- | --- |
| 301 | Dubbel-in en dubbel-uit in de gewone uitnodiging. | Iedere nieuwe leg opnieuw een openingsdubbel; BULL telt als dubbel. |
| 501 / 701 | Direct starten, dubbel-uit in de gewone uitnodiging. | Dezelfde gedeelde score-engine met gekozen startscore. |
| Legs | Best-of oneven 1–21. | Eerste speler met `(bestOf + 1) / 2` legs wint de wedstrijd. |
| Sets | Best-of sets oneven 1–7; legs per set oneven 1–21. | Legstand start opnieuw na gewonnen set; totale legs apart bewaren. |
| Ranked / vrij | Expliciete instelling in uitnodiging. | Alleen geautoriseerde volledige ranked-resultaten wijzigen Elo. |
| Toernooien | Eigen startscore, single-/double-out, ronde/finale-best-of en hints. | Regelsnapshot onveranderlijk zodra gestart. Zie §8. |
| Divisies | 501 double-out, best-of uit seizoen. | Losse competitieresultaten en seizoenspunten. |

Een single-out-optie bestaat in beheer/toernooilogica; voeg haar niet ongemerkt toe aan gewone 301/501/701-uitnodigingen. De huidige regelsnormalisatie ondersteunt expliciete `doubleIn`; controleer de 301-keuze in ieder servercreate-pad zodat hij niet afhankelijk blijft van toevallige clientdefaults.

### 6.2 Timing en inslag

Bij de eigen beurt loopt de horizontale indicator automatisch. Eerste STOP zet richting vast; vervolgens loopt de verticale indicator. De volgende actie legt de hoogte vast en gooit. De dart vliegt visueel vanaf de gebruiker naar het bord. De grote knop bevindt zich laag bij de scoretabel; hij bepaalt niet de diameter van het bord.

Dezelfde beurtlogica geldt voor aanraken, muis en Spatie. Typen in chatvelden of actieve dialogen mag geen worp veroorzaken. De speler kan tijdens vlucht, onbevestigde serveractie, beurt van de ander of verbroken verbinding niet nog een worp indienen.

**Inslagcontract:** serveruitkomst en visuele vlucht worden gecoördineerd. De getoonde punten, resterende darts, beurt, uitgooihulp, bustmelding en eindkaart veranderen pas bij de bevestigde inslag. Een netwerkantwoord tijdens de vlucht mag de score niet vooruit laten springen. Een animatiecallback mag een serverworp niet nogmaals boeken. Bij gereduceerde beweging mag de vlucht worden overgeslagen, maar de definitieve serverinslag blijft het beslispunt.

De scorechip verschijnt boven de laatst geraakte dart met `T20`, `D20`, `20`, `25`, `BULL` of `MIS`. Hij verdwijnt zodra de volgende dart wordt gegooid. Hij blijft binnen de SVG-viewport leesbaar. De darttip, scoretest en geschilderde ringen gebruiken exact dezelfde geometrie.

### 6.3 Bord en score

`lib/darts-rules.ts`: sectorvolgorde vanaf boven met de klok mee is `20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5`. SVG-viewBox 440×440, midden 220/220. Buitenrand double is straal 170; double begint 162; treble is 99–107; outer bull straal 15,9; inner bull 6,35. Raakcoördinaten zijn genormaliseerd op buitenrand double = 1.

Een pijl buiten de double-radius is mis. Inner bull = 50 en een dubbel; outer bull = 25 en geen dubbel. De treble/doublegrenzen in render en rekenfunctie mogen nooit apart worden benaderd; het eerdere probleem van een zichtbare treble met score 20 mag niet terugkomen.

Drie darts per beurt. Bij dubbel-uit is het bust als de score negatief wordt, één overblijft, of nul zonder dubbel wordt geraakt. Bust zet de gehele beurtscore terug naar de stand vóór de beurt, beëindigt de beurt en geeft de concrete reden. Bij single-out is alleen overschrijden bust. Bij dubbel-in leveren treffers vóór de openingsdubbel nul op maar kosten wel een pijl; een bust herstelt ook de openingstoestand aan het begin van de beurt.

Leg-/setwissels en afwisselende starter volgen de gedeelde `advanceMatchScoring`. Hervatten verandert bestaande regels niet. Revanche behoudt de instellingen en wisselt de eerste starter. Een toernooi-/divisiewedstrijd heeft een eigen ID en overschrijft de losse partij niet.

### 6.4 Scoretabel en uitgooien

Kolommen: Speler, Sets, Legs, D, Ptn, Beurt. Nickname met eigen rolkleur; Elo tussen vierkante haken; actievebeurtstip; bij 301 nog niet geopend het IN-signaal. Caption toont de actuele spelregels/format en **Game ID: #...**. Het oude vaste voorbeeld-ID 83626 wordt in productie vervangen door een uniek daadwerkelijk ID.

`getCheckoutRoutes(score, dartsLeft, limit=4)` berekent exacte double-out-routes binnen maximaal de resterende één tot drie darts. Voorbeelden moeten optellen tot de betreffende score; `T20 T20 BULL` hoort bij 170. Routebalk schuift klein vanaf links boven de scoretabel omhoog, wordt na iedere inslag herberekend en verdwijnt wanneer geen route resteert. Geen hints voor een gewonnen partij, single-out of nog ongeopende double-in-speler. De voorkeursrangschikking beperkt overbodige permutaties en geeft prettigere finishes; het is geen garantie dat maar één route bestaat.

### 6.5 Resultaat, historie en voortgang

Na afloop: winnaar, gemiddelde, hoogste beurt, hoogste finish, Elo-wijziging indien geldig, revanche en snelle sportieve reactie. Een 180 wordt pas na de derde bevestigde inslag gevierd; de winnende dubbel licht op. Geluid staat standaard uit; haptiek waar ondersteund is optioneel.

Historie bewaart Game ID, spelers, modussnapshot, legs/sets, iedere dart, beurt, resterende punten, opening/bust/checkout, tijden en resultaat. De bron bewaart maximaal 100 afgeronde partijen lokaal. Productie bewaart duurzame event-/resultaatgegevens, pagineert historie en toont een raakpuntenkaart per eigen speler of beide spelers. Individuele records: hoogste beurt/finish, snelste gewonnen leg, 180's, overwinningen en geraakte dubbels. Geen automatisch terugdraaien in ranked of serverwedstrijden; een beheerresultaatcorrectie is auditbaar.

## 7. Elo en ratingkleur

De besliste V1-formule staat in `lib/darts-elo.ts`:

```text
Start = 1500
K = 32
E_A = 1 / (1 + 10 ^ ((R_B - R_A) / 400))
delta_A = 32 * (S_A - E_A)       S_A = 1 bij winst, 0 bij verlies
delta_B = -delta_A
R_A_nieuw = R_A + delta_A
R_B_nieuw = R_B + delta_B
```

Gebruik voor beide veranderingen de oorspronkelijke ratings. Bewaar decimalen; rond alleen de weergave af. Bij 1500 tegen 1500 gaat winnaar naar 1516 en verliezer naar 1484. Eén volledige wedstrijd geeft één mutatie, niet iedere dart/leg/set. De mutatie is zero-sum en atomair; unieke wedstrijd-ID voorkomt dubbele verwerking bij retry, reconnect of dubbele afsluiting.

| Kleur | Exact criterium |
| --- | --- |
| Wit | Minder dan 10 ranked-wedstrijden **of** minder dan 5 unieke tegenstanders. De rating verandert al, alleen de kleur blijft voorlopig. |
| Rood | Plaatsing voltooid en afgeronde weergegeven rating <1450. |
| Geel | Plaatsing voltooid en afgeronde weergegeven rating 1450–1549. |
| Groen | Plaatsing voltooid en afgeronde weergegeven rating ≥1550. |

Dit is bewust een middenband rond 1500, niet onmiddellijk rood op 1499/groen op 1501. De gebruiker vroeg om dit goed uit te denken; de bestaande goedgekeurde uitwerking en ratingpopover gebruiken deze drempels. Kleur is nooit de enige statusinformatie: tekst en plaatsingsvoortgang blijven beschikbaar.

Huidig prototype: alleen expliciete `ranked-demo` verwerkt lokale Elo. Vrij, bot, practice en de Sites-fair-play-API leveren geen officiële rating. De lokale ledger houdt maximaal 5.000 IDs vast en weigert daarna verdere veranderingen in plaats van oude IDs te vergeten. Toernooi- en divisiepartijen wijzigen nu geen Elo, ook een als ranked gemarkeerd event niet.

Productie: dezelfde formule onder servercontrole, geen lokale ratings importeren als waarheid, gebonden aan twee echte account-IDs. Rated-eventresultaten moeten aan dezelfde transactionele afsluitservice worden gekoppeld zodra dat beleid actief is. Scheid ranglijst en divisiepunten. Leg vast hoe opgave, no-show, ongeldigverklaring en beheerresultaatcorrectie tellen; een puur administratieve walkover zonder gespeelde partij telt standaard niet voor Elo/plaatsing/statistiek. Een correctie krijgt compenserende transacties en mag nooit stilzwijgend oude ledgerregels overschrijven. Anti-farming en verdachte patronen gaan naar review, niet naar verzonnen automatische bewijzen.

Beheer toont actief K32-beleid en een berekenbaar concept. Opslaan van het beleidsconcept verandert geen bestaande rating of actief beleid. Productiebeleid is versieerbaar; geen stilzwijgende retroactieve herberekening.

## 8. Officiële toernooien

Organisator is DartsPoint. In V1 geen vrije door spelers aangemaakte events. Een gepubliceerd event heeft een speciale toernooikamer. Iedereen met toegestane algemene kijktoegang mag toeschouwen; alleen ingeschreven, toegelaten, ingedeelde spelers mogen hun eigen partij spelen. Toeschouwen schrijft iemand niet in en telt niet als deelnemer.

### 8.1 Levenscyclus en instellingen

Status: concept → inschrijving → check-in → live → afgerond; annuleren is een afzonderlijke status. Concepten en geannuleerde events zijn niet openbaar. Gepubliceerde afgeronde events blijven als archief bereikbaar. Lobby-promotie toont alleen inschrijving/check-in/live. De homepage gebruikt nu een expliciete publieke demoprojectie en mag geen private beheerdata lekken.

Instellingen: naam/omschrijving/publicatie; knock-out of double elimination; 4/8/16/32/64 deelnemers; startscore 301/501/701; single-/double-out; rondebest-of en finalebest-of 1–21 oneven; rankingveld; Elo/random/handmatige plaatsing; ratingmin/max, minimumwedstrijden, VIP/teamtoegang, regelsacceptatie, goedkeuring; registratie- en check-invensters; geplande start; kamer; 1–16 borden; automatische/handmatige planning; rusttijd 0–900 seconden; beurttijd 10–120 seconden; hersteltijd 15–600 seconden; hints. Officiële events houden toeschouwen aan.

Nieuwe events nemen opgeslagen platformdefaults over als eigen snapshot. Latere defaultwijzigingen muteren geen bestaande events. Na start zijn deelnemers en spelregels vergrendeld; aanpassen vereist een expliciet beheerd herstelproces.

### 8.2 Inschrijving en check-in

Deelnemersstatussen: wachtlijst, bevestigd, ingecheckt, uitgeschreven. Deelname controleert rating, aantal gespeelde wedstrijden, toegangsrol, regelsacceptatie en eventuele goedkeuring. Volle events leiden naar een wachtstatus. Dubbele inschrijving wordt afgewezen. Herinschrijving van een eerder uitgeschreven speler kan vóór start.

Registratie en check-in zijn verschillende vensters. Zonder expliciete check-in-tijden worden die afgeleid van starttijd minus check-inminuten tot starttijd. Zonder starttijd bestaat geen afgeleid venster. Productie gebruikt de serverklok en geconfigureerde tijdzone, bewaart UTC-instanten en toont Nederlandse tijden duidelijk. Goedkeuring en handmatige seeding mogen niet door de deelnemer zelf worden aangepast.

### 8.3 Brackets en resultaatcorrecties

- Bracketgrootte is een macht van twee die alle toegelaten deelnemers past, minimaal vier. Echte vrije plaatsen geven byes; een nog onbesliste voorafgaande partij is nooit een bye.
- Knock-out: verlies schakelt uit, winnaar naar volgende ronde.
- Double elimination: eerste nederlaag naar losers bracket, tweede nederlaag schakelt uit. Winners- en losers-winnaar treffen elkaar in de grote finale.
- Wint de ongeslagen finalist, dan staat de kampioen vast. Wint de speler uit losers, dan volgt een tweede grote finale omdat beiden één verlies hebben. Dit is een echte extra wedstrijd, geen cosmetische resetknop.
- Uitslag valideert precies de benodigde winnende legs en minder legs voor de verliezer. Walkover vereist een gekozen winnaar en reden; resultaatsoort blijft apart van gespeeld.
- Een correctie vergt reden en wist alle afhankelijke vervolguitslagen in beide routes, inclusief mogelijke finalereset. Onafhankelijke resultaten blijven intact. Productie moet correcties bij reeds gestarte/voltooide vervolgpartijen als begeleide organisatorische actie behandelen en alle betrokken partijen consistent informeren.
- Een volledige beheerreset met reden wist wedstrijden/kampioen en zet terug naar check-in. Dat is iets anders dan de tweede finale.

### 8.4 Meerdere virtuele borden

Bordplanning is een toernooioptie, geen extra toernooivorm. De planner controleert voorgangers, toelating, check-in, gereedmelding, vrije borden, conflict met een andere ingedeelde partij en rusttijd sinds vorige gespeelde partij. Wachtende partijen tonen een concrete reden. Gereed/pauze is een eigen deelnamehandeling; aanwezigheid alleen is niet hetzelfde als klaar om te gooien.

Automatisch vult een geschikt wachtend duel een vrij bord; handmatig kiest beheer een startklare wedstrijd en vrij bord. Start is een afzonderlijke bevestigde overgang. De huidige demo controleert ook of dezelfde deelnemer elders in een lokaal toernooi al speelt. Productie moet dit globaal en atomair doen voor losse partijen, andere toernooien en divisies, niet alleen binnen één in-memorylijst.

De huidige planner loopt alleen vanuit geopende schermen en lokale acties. Productie vereist een doorlopende, herstartbare worker met duurzame taken/deadlines, locks/idempotentie en betrouwbare aanwezigheid; browseropenhouden is geen bedrijfsproces.

### 8.5 No-shows, vertrek en verbindingsproblemen

| Situatie | Huidige bron | Vereiste productieafhandeling |
| --- | --- | --- |
| Geen check-in | Speler komt niet in de toegelaten indeling bij verplichte check-in. | Deadline serverzijdig; lijst en wachtlijst veilig verwerken; audit. |
| Niet gereed | Planner wacht met reden. | Gereeddeadline en notificatie; daarna organisatorische opvolging of expliciet ingestelde walkoverregel. |
| Vertrek vóór start | Uitschrijven mogelijk, previewbracket wordt ongeldig. | Plek/wachtlijst atomair bijwerken; geen actieve wedstrijd verliezen door een verouderd verzoek. |
| Uitval na toernooistart | Deelnemerslijst vergrendeld; handmatige walkover per partij. | Uitvalstatus en aanpak voor rest van bracket implementeren; bij double elimination niet onbeperkt blijven doorschuiven alsof speler beschikbaar is. |
| Korte disconnect tijdens spel | Losse demo heeft 60-seconden hersteltest. | Colyseus herverbinden met dezelfde speler/stoel, bevestigde state, duurzame grace-deadline. |
| Deadline verloopt | Losse demo kan partij als opgegeven markeren; competitietimer is nog niet gehandhaafd. | Verlies/opgave volgens regelsnapshot; precies eenmaal resultaat en bordvrijgave. |
| Beide spelers ontbreken | Geen complete automatische beleidsafhandeling. | Geen willekeurige winnaar; organizer review/no-contest/reschedule volgens expliciet beleid. |
| Serverstoring | Geen complete multiplayerfailover. | Geen speler automatisch bestraffen voor gedeelde storing; herstel of review met audit. |

De bestaande configuratie heeft standaard 30 seconden beurttijd en 90 seconden hersteltijd; de losse 60-seconden demotest is geen strijdig productiebeleid. Productie gebruikt één expliciete regelsnapshot per wedstrijd. Stel nieuwe gereed-/opgavedetails vast in de serverimplementatie en publiceer ze vóór inschrijving. Geen timer uitsluitend op de klok van een speler.

## 9. Seizoenen, divisies en divisieladder

Dit is een zelfstandige spelvorm, geen toernooiformat. Eén seizoen tegelijk actief. Concept: naam, startdatum, best-of, divisies (naam/niveau/kleur), deelnemersindeling en aantallen promotie/degradatie. De bron ondersteunt gold/silver/bronze/green/blue als badgekleuren.

Schema: ieder lid speelt eenmaal tegen ieder ander lid binnen de divisie. Speeldagen liggen wekelijks uiteen; oneven groepsgrootte geeft rustweken. Na start staan indeling en regels vast. Speler ziet actuele divisie, ladder, alle rondes en eigen volgende wedstrijd. Alleen beide ingedeelde spelers mogen die partij spelen. Eerdere open speelronden van die spelers moeten eerst worden afgerond.

Stand: 3 punten voor winst, 0 voor verlies; rangschikking op punten, legsaldo, gewonnen legs. Bij precies twee verder gelijkstaande spelers beslist een gespeeld onderling resultaat. Onopgeloste gelijke standen blijven gedeelde plaatsen; geen Elo als verborgen tiebreaker. De ladder toont gespeeld, gewonnen, legsaldo en punten.

Seizoensafsluiting bewaart de eindstand. Afsluiten met open partijen vraagt een reden; ongespeelde partijen krijgen geen verzonnen punten. Vervolgseizoen kopieert spelers/divisies met geldige promotie/degradatie naar een nieuw concept en begint zonder oud schema/resultaten. Per grens geldt het kleinste aantal ingestelde promotie- en degradatieplaatsen, begrensd door groepsgrootte. Bij een gedeelde plaats op een grens blijven betrokken divisies onveranderd en krijgt beheer een waarschuwing voor handmatige indeling. Na aanmaken van een vervolgseizoen is de oorspronkelijke eindstand vergrendeld.

Bronhiaten voor productie: duurzame planning/afspraken, no-show/uitval over meerdere rondes, eventueel inhaalduel, serverklok en bevestigde resultaten ontbreken. Behandel gespeelde, walkover, opgave, no-contest en geannuleerde resultaten expliciet in het datamodel; de huidige divisiefunctie bevat vooral leguitslagen. Bestaande 3-puntenstand niet automatisch uitbreiden met zelfbedachte strafpunten. De exacte beleidskeuze moet configureerbaar en zichtbaar zijn.

## 10. De dertig V1-functies — traceerbaar behouden

| # | Functie | Bron / bediening | Productiestap |
| --- | --- | --- | --- |
| 1 | Vijf-pijlenintroductie | Practice `?les=1` met echte timing/inslagen. | Accountgebonden voltooiing, opnieuw starten mogelijk. |
| 2 | Gericht oefenen | Vrij, dubbels, BULL, gekozen finish. | Behoud lokale soepele input; nooit ranked. |
| 3 | Revanche | Eindkaart; andere eerste starter. | Nieuwe match-ID, geaccepteerde uitnodiging, zelfde regels. |
| 4 | Historie | Clubhuis/spelmenu, alle darts en legs. | Duurzame serverhistorie en paginatie. |
| 5 | Verbindingsherstel | Bevestigde state/exact retry, hersteltest. | Colyseus reconnect, idempotentie, deadline. |
| 6 | Wedstrijdkaart | Regels, opponent, starter vooraf. | Beide spelers dezelfde serverregelsnapshot. |
| 7 | Elo-preview | Verwachte winst/verlies. | Berekenen met actuele serverratings; indicatie. |
| 8 | Eindkaart | Winnaar, gemiddelde, maxima, Elo. | Definitieve resultaattransactie. |
| 9 | Bustuitleg | Concrete reden en beurtscoreherstel. | Zelfde engine voor alle clients. |
| 10 | Records | Beste beurt/finish, snelste leg, 180's, wins, doubles. | Afleiden uit geldige resultaten, geen clientclaims. |
| 11 | Raakpuntenkaart | Eigen/beide echte raakcoördinaten. | Geautoriseerde eventread met filtering. |
| 12 | 180-moment | Na derde inslag, optioneel geluid. | Alleen bevestigde event, reduced-motion. |
| 13 | Winnende dubbel | Geraakt vak licht op. | Exact gedeelde geometrie/laatste hit. |
| 14 | Badges | Eerste finish, 180, 10 dubbels, eerste winst; practice apart. | Idempotente verdienregels en permanente toekenning. |
| 15 | Weekuitdaging | Vijf unieke dubbels, ISO-week Amsterdam. | Serverweek/accountprogressie; nieuwe week reset alleen scope. |
| 16 | Avondcup | Acht personen, drie rondes; overige uitslagen in demo gesimuleerd. | Echte officiële eventdeelnemers; geen simulatieknop voor live. |
| 17 | Wachtrij | Bij kijken: ik speel hierna/afmelden/doorschuiven. | Servervolgorde, timeout, acceptatie en bezettingslock. |
| 18 | Kamerfavorieten | Lobby. | Accountvoorkeur, geen toegangsomzeiling. |
| 19 | Beschikbaarheid | Wil spelen/speelt/kijkt. | Presence en actieve-matchrechten serverzijdig. |
| 20 | Snelle chatzinnen | Chat/eindkaart. | Normaal berichtpad met policy/rate limit. |
| 21 | Rustige eigen beurt | Inkomende inhoud tijdelijk uit beeld. | Alleen presentatiebuffer; ongelezen consistent. |
| 22 | Privéchatbeleid | Iedereen/vrienden/niemand. | Serverside afdwingen op nieuwe thread/bericht. |
| 23 | Blokkeren/melden | Naam/profiel/privéchat, context + Game ID. | Duurzame cases, scoped bewijs en terugkoppeling. |
| 24 | Kamerbeheer | Waarschuwing/mute/verwijder/opheffen. | RBAC, hiërarchie, expiry en audit. |
| 25 | Linkshandig | Gooiknop gespiegeld; timing gelijk. | Accountvoorkeur, per apparaat soepel. |
| 26 | Toetsenbord | Spatie, veilige focus/tabs/dialogen. | Regressietests tegen onbedoelde worpen. |
| 27 | Haptiek | Korte tik bij vastzetten/inslag waar ondersteund. | Feature detection, nooit vereist. |
| 28 | Ratinguitleg | Klikbare `[rating]`, plaatsing/kleur. | Zelfde actieve beleid als backend. |
| 29 | Offline PWA | Manifest, installeren, aparte offlinepractice. | HTTPS/SW-updatepad; geen auth/chat/APIcache. |
| 30 | Servercontroles | Sites-D1-sequence/turn/timing/score/receipt. | Colyseus authoritative room + duurzame ontvangst/resultaten. |

## 11. Platformbeheer — volledige inventaris

Beheernavigatie heeft tien pagina's; iedere pagina één hoofdtitel, daarna functionele inhoud. De source-of-truth UI blijft `components/admin/`.

| Pagina | Functies |
| --- | --- |
| Overzicht | Speler-/kamer-/eventaantallen, bezetting, open meldingen, recente acties, snelle organisatoracties. Productie telt echte data. |
| Toernooien | Concept maken/klonen/wijzigen/verwijderen; publiceren/verbergen; inschrijving/check-in; deelname/seeding; bracket; start; borden/gereed; uitslag/walkover/correctie/reset; annuleren/archief. |
| Seizoenen & divisies | Concept, groepen, spelerindeling, speeldagen, starten, resultaten/ladder, afsluiten, vervolgseizoen en promotie/degradatie. |
| Spelers & rollen | Zoeken/filters/profiel; player/VIP/admin; waarschuwing, tijdelijke chatbeperking, schorsing, opheffen en geschiedenis. Owner beschermd. |
| Kamers | Maken/wijzigen, 2–50 capaciteit, categorie/toegang/rating/regels/moderator; instroom sluiten; lege gesloten kamer verwijderen. |
| Moderatie | Nieuwe echte en duidelijk gelabelde demomeldingen; status, bewijs/context, Game ID, maatregel en gemotiveerd afsluiten. |
| Spel & deelname | Defaults voor score/finish/best-of/finale/timers/hints; capacity/rating/min-wedstrijden/check-in/approval/VIP. |
| Elo & competitie | Actief beleid en rekenbare conceptpolicy; geen onbedoelde ratingreset. |
| Platforminstellingen | Naam, slogan, registratiebeleid, onderhoud, aankondiging, contactadres, chatslowmode en standaard privébeleid. |
| Actielogboek | Gecombineerde beheer-, event- en seizoenacties; zoeken, datum/periode en CSV van huidige selectie. |

Bewaar het verschil tussen de verschillende brongrenzen: kamermaximum rating 4000 in roomvalidatie, eventinstellingen tot 5000, defaultdeelnameformulieren met eigen maxima. Normaliseer dit in één productionvalidatielaag met expliciete keuze, niet door onzichtbaar formuliervelden te laten falen. Registratie/onderhoud/slowmode zijn nu deels beleidsvelden; productie moet ze werkelijk serverzijdig afdwingen met een veilige uitzonderingsroute voor ownerbeheer.

Er is in deze bron geen volwaardige betaal-/facturatie-/boekhoudmodule en geen echte VIP-verkoop. Voeg dat niet aan het canon toe alsof het geleverd is. Evenmin aanwezig: zelfstandige native storeapps, cameradarts, automatische scoreherkenning, openbare externe tournamentfeeds of een bewezen anti-cheatoplossing. Dit zijn geen vereisten om de bestaande UI exact over te nemen.

## 12. Marketing, SEO, PWA en mails

De marketingpagina is visueel publieke content, los van de besloten spelomgeving. Fullviewport hero met sfeerfotografie, registratie-CTA en wisselende spotlight voor event/divisie/Elo. Echte SVG-bordrenderer in de gameplaypreview, 301/501/701-keuze. Events met echte status en datum of expliciet datum volgt; ladders met gekozen sortering; divisies met echte seizoenspunten; kamers en FAQ. Geen fictieve betalende klanten, testimonials, aftellers of aantallen als bewijs van echte activiteit.

De huidige `lib/darts-public-data.ts` is een allowlist-demoprojectie; production vervangt alleen de data-adapter door gepubliceerde PostgreSQL-queries. Concepten, privéchats, contactgegevens, authclaims en auditrecords blijven erbuiten. Definieer consent/zichtbaarheid van openbare nicknames/ranglijsten.

De technische SEO-basis bevat Nederlandstalige metadata, canonical, Open Graph/Twitterafbeelding, sitemap en Website/VideoGame-structured data. De huidige origin is Sites; productie zet `https://dartspoint.nl` als primaire canonical. `dartspoint.app` krijgt later een expliciete rol/redirect en geen concurrerende dubbel geïndexeerde site. Auth, beheer, persoonlijke lobby en speldata blijven noindex en buiten sitemap. Robots/noindex vervangen geen toegangscontrole.

PWA: bestaande iconen, manifest en serviceworker. Offlinefallback is een afzonderlijke openbare oefenpagina; alleen publieke statische assets worden gecachet. Geen ingelogde HTML, RSC, accounts, chats of API-antwoorden cachen. Een PWA is cross-device websoftware; dit is nog geen gepubliceerde native Android-/iOS-app. Offline practice geeft geen ranked-uitslag en synchroniseert geen offline multiplayer.

De nieuwe mailset moet de Afterhours-identiteit delen: bestaand logo, diep groen, crème tekst/kaart, rood accent, rustige typografie en heldere functie. Gebruik één herbruikbare HTML/text-template met gecontroleerde variabelen voor OTP en eventuele account-/event-/moderatiemeldingen. Veranderlijke tekst escapen en alleen toegestane URL-origins. Transactionele berichten en eventuele marketingtoestemming blijven gescheiden; geen mailingcampagne op basis van loginadressen.

## 13. Bron → productie-migratiematrix

| Bron | Nu | Productievervanging / behoud |
| --- | --- | --- |
| `darts-rules`, `darts-match-rules`, `darts-checkouts` | Pure berekeningen. | Behoud als gedeeld domeinpakket; serveruitkomst autoritatief. |
| `darts-game-state`, `darts-game`, `CompetitionGame` | Browserreducer, animaties, demobot. | Presentatielaag behouden; Colyseus-state/events adapter; geen dubbele lokale scoreautoriteit. |
| `darts-fair-play-*`, API/D1 | Demo serverstate/receipts, clientcoördinaten. | Authenticated match commands, deterministic server timing/hit, receipt/idempotentie in productie. |
| `darts-session`, `DemoGate` | Lokale vaste demosessie. | Geverifieerde authsessie, profiel-onboarding en serverroutechecks. |
| `darts-data` | Vaste spelers/kamers. | Seed alleen staging/demo; echte IDs/queries/presence. |
| `darts-social`, `darts-chat-state` | Lokale vrienden, mutes, reports, histories/tabs. | Persistente relaties/threads/messages/sancties; realtime + voorkeuren. |
| `darts-ratings`, `darts-match-records` | Browserledger en historie. | Atomische afsluitservice, Eloledger, eventhistorie en records. |
| `darts-practice`, `darts-preferences` | Apparaatvoortgang/-voorkeuren. | Accountvoorkeuren/voortgang waar nodig; offline practice blijft lokaal. |
| `darts-tournament-*` | Pure graph/planning plus lokale store. | Model behouden, repository/transactions, achtergrondscheduler, echte rooms. |
| `darts-divisions-*` | Pure standings/schema plus lokale store. | Serverseasonbeheer, duurzame fixtureplanning/results. |
| `darts-admin-*` | Lokale configuratie/cases/log. | Geautoriseerde APIs, versiebeleid, auditappend en persistente defaults. |
| `darts-public-data` | Openbare fixtures. | Expliciete gepubliceerde readmodels; ISR/cache-invalidation zonder privatelek. |
| `public/brand`, `public/marketing`, alle CSS | Bindende visuele assets. | Ongewijzigd meenemen; alleen domeinafhankelijke metadata/URL aanpassen. |

Verwijder geen voorbeeldcomponent om de integratie eenvoudiger te maken. Bouw adapters die dezelfde vormdata leveren; haal de hardcoded `Nick` vervolgens gericht weg uit actoridentiteit, rechten, scoretabel, records, reports, chat en deelname. Geen brede zoek/vervang op namen in historische fixtures.

## 14. V1 is pas echt klaar als

- Twee verschillende geverifieerde accounts op verschillende apparaten dezelfde actieve partij spelen en exact dezelfde score zien.
- Een derde account kan kijken zonder deelname-/werprechten.
- OTP, eerste naamkeuze, hervatten, uitloggen en sessieverval werkelijk werken met stagingmail; de owner is serverzijdig aantoonbaar owner.
- Dezelfde productiegame-engine losse partijen, toernooi- en divisiewedstrijden afhandelt en scores alleen op inslag toont.
- Chat, vrienden, blokkeren, mute, rolechecks, roomcapacity en privétoegang serverzijdig worden afgedwongen.
- Afsluiting, Elo, bracket/ladder en planner idempotent en herstartbestendig werken; no-show/disconnectbeleid is zichtbaar en getest.
- Exacte UI-vergelijking en echte apparaatacceptatie volgens `08-UI-UX-EXACT-EN-ACCEPTATIE.md` zijn uitgevoerd; eerdere bronchecks zijn geen vervanging daarvoor.
- Een merge naar staging en later production de beschreven gescheiden deployment uitvoert, zonder secrets in git en zonder productie afhankelijk te maken van een draaiende development-VPS.

Dit canon beschrijft de productomvang. Technische stackkeuze, secrets, CI/CD, datamodel, mailintegratie en uitvoerprompt staan in de overige overdrachtsdocumenten.
