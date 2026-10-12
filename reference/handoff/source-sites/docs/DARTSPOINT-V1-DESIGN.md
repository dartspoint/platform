# DartsPoint V1 — vast ontwerp

Vastgelegd op 11 oktober 2026. De uitgewerkte Afterhours-spelpagina is de canonieke visuele basis voor DartsPoint. De interne stijl heet nog `club`; die technische naam is geen ontwerpkeuze voor spelers. Arena, Broadcast, Focus, League en de oorspronkelijke Club-presentatie zijn eerdere concepten. De productflow bevat geen ontwerpselector of favorieten voor ontwerpen.

## Visuele identiteit

- Gebruik het bestaande DartsPoint-beeldmerk en woordmerk uit `public/brand`. Behoud verhoudingen en kleuren.
- Diep groen als basis: `#0f1b16`; gelaagde panelen rond `#192a20` en `#12251b`; subtiele groene lichtval en transparante randen.
- Rood `#e8564c` voor de primaire spelactie en accenten; groen voor beschikbaarheid; gebroken wit voor hoofdtekst. Een 3D-achtige rode gooiknop en een tastbaar dartbord geven diepte zonder drukke decoratie.
- Manrope voor interface en tekst. Barlow Condensed voor grote scores. Gebruik tabulaire cijfers in tabellen en compacte, rustige labels.
- Zachte hoeken en dunne randen voor kaarten; beperkte schaduwen. Beweging geeft feedback op navigatie, inslag en status; respecteer verminderde-bewegingsvoorkeuren. De timingbalken blijven functioneel bewegen.
- Rolkleuren horen bij gebruikersnamen: eigenaar blauw, admin oranje, VIP goud met kroon, gewone speler wit. Ratings staan los hiervan achter de naam tussen vierkante haken. Elo gebruikt K=32. Nieuw is wit; na minimaal 10 ranked-demowedstrijden tegen 5 verschillende tegenstanders wordt de weergegeven rating rood onder 1450, geel van 1450 tot en met 1549, groen vanaf 1550. De afgeronde waarde bepaalt de getoonde kleur; de onderliggende rating behoudt decimalen. Klikken op een rating legt dit uit. Een compacte divisiebadge naast de naam toont uitsluitend het lidmaatschap van het actieve seizoen; deze badge staat los van rol en Elo.

## Productflow

| Route | Doel |
| --- | --- |
| `/` | Publieksgerichte marketinghomepage met hero, spelvoorbeeld, officiële demotoernooien, Elo- en divisieladders en registratie-CTA. |
| `/inloggen` | E-mail → 6-cijferige OTP-democode → eerste keer een unieke spelersnaam → profielbevestiging. Bestaand lokaal profiel slaat naamkeuze over. |
| `/registreren` | Dezelfde OTP-flow, met registratie-intro. De naam wordt pas na de code gekozen. Echte verzending en accounts volgen op de VPS. |
| `/mailvoorbeelden` | DartsPoint-mailontwerpen, inclusief OTP, welkom en notificaties, met gedeelde HTML/plaintext-basis en mobiel voorbeeld. |
| `/lobby` | Overzicht van alle kamers met toernooipromotie. Vrienden en privéberichten hebben eigen navigatiepagina's. |
| `/spelen` | De goedgekeurde spelpagina, met kamer- en chatpanelen. |
| `/oefenen` | Oefenruimte; `?les=1` start de vijf-pijlenintroductie en `?uitdaging=1` de weekuitdaging. |
| `/clubhuis` | Historie, raakpuntenkaart, records, badges, officiële toernooien en instellingen. |
| `/divisies` | Afzonderlijke divisiecompetitie met seizoenskeuze, ladder, speelrondes en eigen wedstrijden. |
| `/toernooi/[id]` | Speciale toernooikamer met borden, bracket, deelnemers, toeschouwen en eigen toegewezen partijen. |
| `/beheer` | Aparte backoffice voor de demoeigenaar: toernooien, bordplanning, seizoenen, divisies, spelers, kamers, moderatie en instellingen. |

Na inloggen volgt de lobby. Daar kan de speler een kamer kiezen, een vriend uitdagen, berichten beantwoorden en meekijken. Vanuit de spelpagina leiden zowel het logo als de terugknop en een profielmenu-actie naar de lobby. Uitloggen beëindigt de lokale demosessie en opent het inlogscherm. Oude conceptroutes verwijzen door naar de vaste spelpagina.

## Indeling en gedrag

- De lobby is een responsief, scrollbaar overzicht van alle kamers en toernooipromotie. Vriendenbeheer en privéberichten zijn afzonderlijke pagina's binnen de navigatie. Op de vriendenpagina staan geen berichtoverzichten. Buiten een kamer toont de chat uitsluitend privégesprekken.
- De spelpagina vult de zichtbare viewport. Vanaf 1100 px staat links het spel met timingbalken, rode gooiknop en scoretabel. De rechterhelft bevat bovenaan kamerleden links en vrienden rechts; daaronder staat de chat. De lijsten en chat scrollen binnen hun eigen paneel. De compacte header loopt over de volle breedte.
- Mobiel behoudt de bestaande spelindeling en onderste navigatie: Spelen, Kamer, Chat, Ladder en Profiel. Kamer en Chat openen als panelen van 60% viewporthoogte. De wedstrijd blijft boven het paneel zichtbaar. Desktop heeft deze navigatie in de header; kamerleden, vrienden en chat zijn daar gelijktijdig zichtbaar.
- De chatvolgorde is Spelchat, Kamerchat, gevolgd door privégesprekken. Persoonlijk dempen verbergt de berichten van die speler; een moderatiemute is een afzonderlijke kamermaatregel.
- Iedere privétab heeft een sluitknop. Sluiten bewaart berichten en concepttekst; de gesloten tab blijft ook na herladen gesloten. Heropenen gebeurt expliciet via vrienden of berichten. Bij de laatste gesloten tab toont de lobby een lege staat; in een kamer valt de chat terug op Spelchat.
- Een naam in de sociale lijsten opent een actiemenu voor uitnodigen, vriendschap, privéchat, dempen, blokkeren, melden en toegestane moderatie. Vriendschapsverzoeken blijven in behandeling tot acceptatie; verwijderen, weigeren en intrekken werken door in lobby, spelpagina en chatvoorkeuren.
- Een speluitnodiging opent eerst de wedstrijdinstellingen: 301 dubbel-in/dubbel-uit, 501 of 701 dubbel-uit; best-of legs of sets met legs per set; en ranking aan of uit. Na bevestiging start de demopartij met precies die regels. Hervatten en revanche behouden de spelregels. Elo wordt eenmaal per volledige ranked-demowedstrijd verwerkt.
- Kamer toont de spelerslijst en een terugpijl naar alle kamers met bezetting op maximaal 50 spelers. Volle gewone kamers zijn niet selecteerbaar. Toernooikamers leiden naar een specifiek event of de evenementenkiezer; toeschouwers blijven welkom zonder speelrecht te krijgen.
- Aanraakdoelen zijn ten minste 44 px. Houd rekening met veilige schermranden, schermtoetsenbord, duidelijke focusmarkering en horizontale ruimte voor scores.
- De tip van de pijl, geraakte sector en scoreberekening delen dezelfde geometrie. Alleen de inslag verwerkt de score. Behoud scorechip, uitgooimogelijkheden en bestaande dartanimatie.

## Competities en platformbeheer

DartsPoint heeft drie gescheiden speelroutes. `/spelen` blijft de vertrouwde losse partij met zijn bestaande hervatbestand en expliciete lokale Elo-demo. Officiële DartsPoint-events staan op de toernooikalender en openen hun eigen kamer. Divisies vormen een aparte seizoenscompetitie met een eigen ladder op basis van wedstrijdpunten.

De toernooikamer toont knock-out of dubbele eliminatie, beschikbare borden, gereedmeldingen en wachtrijen. Dubbele eliminatie bevat een winnaarsroute, verliezersroute en zo nodig een tweede grote finale. Het schema schuift na vastgelegde uitslagen door. Automatische bordplanning respecteert vrije borden, toelating, gereedmelding en rusttijd zolang de betrokken schermen open zijn. Er draait geen planner als de website gesloten is.

Toeschouwen is altijd beschikbaar bij gepubliceerde DartsPoint-events. Alleen een ingedeelde en toegelaten speler kan zijn eigen toegewezen wedstrijd starten. Een toernooi met dezelfde naam als een bestaande sociale kamer neemt die kamer niet over. Toeschouwers zien de opgeslagen lokale bordstand of uitslag; dit is geen gedeelde realtimeverbinding.

Divisies tonen het actieve seizoen, de huidige groep, speelrondes en de volgende eigen partij. De ladder gebruikt drie punten voor winst, daarna legsaldo, gewonnen legs en bij twee gelijkstaande spelers het onderlinge resultaat. Seizoensafsluiting bewaart de stand; een vervolgseizoen neemt de indeling inclusief geldige promotie/degradatie over als nieuw concept. Bij een onbesliste gedeelde plaats op een divisiegrens moet beheer de nieuwe indeling beoordelen. Divisiebadges zijn alleen zichtbaar zolang het betreffende seizoen actief is.

Toernooi- en divisiewedstrijden gebruiken dezelfde bordstijl via een aparte `CompetitionGame`. De speler gooit met de timingbalken tegen een automatische demotegenstander. Toernooien passen de ingestelde startscore, finishregel, best-of en uitgooihulp toe; divisies spelen 501 double-out met de best-of van het seizoen. De uitslag wordt na afloop expliciet vastgelegd en verwerkt in het bracket of de divisieladder. Deze partijen wijzigen geen Elo en overschrijven geen losse partij.

Platformbeheer gebruikt één hoofdtitel per pagina. Daarna beginnen de toolbar, tabel of instellingskaarten direct; herhaalde paginatitels en decoratieve ondertitels worden niet opnieuw toegevoegd. Functionele sectiekoppen en noodzakelijke veldhulp blijven behouden. Desktop gebruikt de zijbalk; mobiel een uitklapbaar beheermenu. Beheeracties voor resetten, uitslagcorrecties en vroege seizoensafsluiting vragen waar nodig om een reden.

Zie `DARTSPOINT-OWNER-BACKOFFICE.md` voor de exacte bracket-, plannings-, deelname- en seizoenscontracten.

## Grenzen van dit prototype

De marketingpagina gebruikt een expliciete openbare demoprojectie (`lib/darts-public-data.ts`), zonder privégesprekken, concepttoernooien of beheerlogboeken. De competitiedata zijn voorbeeldstanden en geen live publieksfeed. Het gegenereerde fotografische hero-beeld is sfeerbeeld; het spelvoorbeeld gebruikt de daadwerkelijke bordweergave. De stijl, verhoudingen, beweging en registratieflow horen bij de vaste ontwerpafspraken voor de latere VPS-implementatie.

De marketingroute heeft metadata, canonical, deelafbeelding en een sitemap. Spel-, account-, mailvoorbeeld- en beheerroutes worden buiten de zoekindex gehouden. De Sites-publicatie behoudt haar bestaande toegangsbeleid; indexering op het openbare web volgt pas bij daadwerkelijke publieke hosting. De OTP-preview verstuurt geen echte mail en toont de code in een gestylede demomail. Alleen een e-mailfingerprint en gekozen normaal spelersprofiel worden lokaal bewaard, geen ruwe e-mail of OTP. Het vervolg opent expliciet de bestaande Nick-speeldemo; dit verleent geen echte account- of ownerrechten.

De sessie, kamerkeuze, tegenstander, aanwezigheid en sociale acties zijn demogegevens. Chats, rapporten en beheeracties worden lokaal uitgevoerd en bereiken geen echte spelers. De actieve partij kan binnen dezelfde browsersessie worden hervat, inclusief een nog te bevestigen worp; afgeronde wedstrijden, Elo, records, badges en voorkeuren blijven op dit apparaat bewaard.

De lokale toernooi- en divisiepartijen hebben geen serverautorisatie of gedeelde aanwezigheid. De beurttijd en hersteltijd uit toernooi-instellingen zijn opgeslagen configuratie; de competitie-engine handhaaft daarvoor geen servertimer. De actieve rusttijdcontrole zit in de lokale bordplanning.

De fair-play-API gebruikt D1 voor serverberekende scores, volgorde, beurt en unieke worpbevestigingen. Dit is een werkende servercontrole voor demowedstrijden, geen volledige anti-cheat of accountgebonden ranked-server. Door de client aangeleverde raakcoördinaten en tijd bewijzen geen menselijke invoer. Daarom meldt de API `eligibleForRating: false`; de expliciet benoemde Elo-demo gebruikt uitsluitend lokale ratings. Serveruitval bij aanvang wordt zichtbaar als lokale demowedstrijd; een onbevestigde worp tijdens een serverpartij wordt niet stilzwijgend lokaal gescoord.

De PWA biedt na het eerste online bezoek offline oefenen via een eigen openbare oefenpagina. Accounts, gesprekken en API-antwoorden worden niet gecachet. De installatiemogelijkheid is bereikbaar in instellingen; ondersteuning hangt af van de browser.

Zie `DARTSPOINT-V1-FEATURES.md` voor de geïmplementeerde functies en hun grenzen.

Visuele browsercontrole was in deze werkomgeving niet beschikbaar. Technische controles op broncode en logica vervangen geen acceptatietest op echte apparaten.
