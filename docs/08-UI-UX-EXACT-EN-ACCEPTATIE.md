# Exacte UI/UX-overname en acceptatie — DartsPoint V1

Versie: 12 oktober 2026. Dit is een uitvoerbaar controlecontract voor Codex op de development-VPS. Doel is **de meegeleverde Sites-UI exact behouden en werkend verbinden aan de echte V1-diensten**. Een functioneel vergelijkbare herbouw met andere componenten, spacing, lettertypes, kleuren of bediening voldoet niet.

## 1. Welke versie is visueel beslissend?

De `source/`-snapshot in dit pakket is de bindende basis. Het pakketmanifest vermeldt de bronversie en checksums. De live Sites-URL is aanvullende referentie en kan na de overdracht veranderen. De screenshots uit het gesprek zijn tussenstappen, geen complete set voor de laatste versie. Gebruik ze niet om recente bronverbeteringen terug te draaien.

De vaste stijl is **Afterhours**. `club` komt als interne variantnaam voor; dat is geen verzoek om alle historische ontwerpvarianten te publiceren. Arena, Broadcast, Focus, League en de oorspronkelijke Club-showcases zijn geen productkeuzescherm. Geen nieuwe designronde, merkverandering of wissel naar een standaard dashboardtemplate.

De nieuwe e-mail/OTP/naamkeuzeflow in dit pakket gaat boven oudere ontwerpdocumenten die nog een directe demologin of losse naampreview beschrijven. De zichtbare flow wordt behouden; de echte verificatie komt uit de productiedienst.

## 2. Overnamevolgorde die afwijking voorkomt

1. Controleer pakketmanifest en bronchecksums. Lees bestaande `source/docs/` plus dit canon vóór herstructureren.
2. Leg de ongewijzigde referentie vast in de developmentomgeving en commit die als duidelijke uitgangsversie. Start een echte browser voor screenshots zodra dat op de VPS mogelijk is.
3. Bewaar assets, componentmarkup, importvolgorde van CSS, lettertypes, iconen, motion-instellingen, breakpoints en route-interacties. Migreer eerst alleen de Sites-runtime naar de gekozen Next.js-runtime.
4. Maak de eerste productiebuild met fixturedata. Vergelijk de visuele basis vóór een backendadapter wordt vervangen.
5. Koppel per domein getypeerde adapters: auth → profielen/rooms → sociale data/chat → Colyseus → resultaten/DP → events/divisies → beheer. Houd de gerenderde gegevensvorm gelijk.
6. Vervang demo-actor `Nick` door de werkelijke geauthenticeerde identiteit. Verwijder demoacties doelgericht en behoud de gewone bediening.
7. Voeg goede lege, laad-, fout-, offline- en ontbrekende-rechtenstaten toe in dezelfde stijl. Geen extra debuglabels in de productflow.
8. Vergelijk na iedere samenhangende integratiestap dezelfde referentiescènes op dezelfde viewport. Behandel onbedoelde layoutafwijking als regressie, niet als een verbetering.

Een nieuwe mapstructuur is toegestaan wanneer nodig voor gedeelde domeinlogica of diensten. De gebruiker heeft niet gevraagd om alle componenten opnieuw te schrijven. Bewaar herkenbare bronpaden of documenteer verplaatsingen in een migratietabel.

## 3. Visuele identiteit en assets

| Onderdeel | Bindende bron / waarden |
| --- | --- |
| Logo / woordmerk | `public/brand/icon.svg`, `wordmark.svg`, `logo.svg` en bestaande premium-PNG-varianten; niet opnieuw natekenen. |
| Basis spelomgeving | Diep groen `#0f1b16`; panelen rond `#192a20`, `#12251b`; subtiele groene lichtval/randen. |
| Primaire spelactie | Rood rond `#e8564c`; ronde tastbare knop met bestaande rand, lichtval en schaduw. |
| Marketing | Scoped `.mk-site`, basis `#0b1710`, crème `#f0eddd`, sage `#aec7b3`, rood `#ee534b`. |
| Interfacefont | Manrope Variable uit lokaal gebundelde fontsource-bestanden. |
| Score-/displayfont | Barlow Condensed; bestaande gewichten behouden; cijfers tabulair. |
| Rolkleuren | Owner blauw, admin oranje, VIP goud + kroon, speler wit. Exacte waarden in `player-identity.css`. |
| DP | Afzonderlijke `[rating]`, wit/rood/geel/groen en toegankelijke uitleg. Geen rol-/ratingverstrengeling. |
| Hero | `public/marketing/afterhours-hero.webp`, bestaande compositie 1672×941. Geen nieuw sfeerbeeld nodig. |
| Deelafbeelding | `public/marketing/dartspoint-share.png` en SVG. |
| PWA | `manifest.webmanifest`, `icons/icon-192.png`, `icons/icon-512.png`, favicon. |
| E-mail | Nieuwe mailtemplates en `public/assets/emails/dartspoint-logo.png`; gebruik de mailhandleiding van het pakket. |

De sfeerafbeelding heeft doelbewust donkere ruimte voor tekst en een dartbord rechts. Correcte `object-position`, overlay en responsive crop zijn deel van het ontwerp. Niet vervangen door een generieke gradient of gameplay als plat screenshot. Het interactieve bord blijft echte SVG/code met gedeelde geometrie.

Controleer lettertypebelasting vóór screenshotvergelijking. Een fallbackfont kan scores, menu's en tabellen onterecht doen lijken op responsive fouten. Behoud de CSS-fontaliases uit `app/globals.css` en laad beide families zonder externe trackingverzoeken.

## 4. Exacte spelindeling

### 4.1 Desktop vanaf 1100 CSS-pixels

De zichtbare viewport heeft een compacte header over de volle breedte. Daaronder links en rechts ieder de helft. Links staat de actieve spelervaring: groot bord, horizontale richtingsbalk rechtsboven het bord, verticale hoogtebalk rechts ernaast, rode gooiknop laag bij de scoretabel, finishregel en scoretabel. Rechts boven staan kamerleden links en vrienden rechts; daaronder chat. De bovenste rechtse verdeling is ongeveer 1,55:1. De lijsten en chat hebben eigen scrollvlakken; de pagina zelf wordt geen eindeloos dashboard.

Het openen van een communitypaneel of resize mag het spel niet remounten. Een actieve pijl, score en roomverbinding blijven behouden. Lijsten mogen geen renderfrequentie of verbinding van het spel beïnvloeden.

Bronnen: `darts-app.tsx`, `darts-desktop.css`, `darts-play-shell.css`, `darts-playfield.css`, `darts-community.*`.

### 4.2 Mobiel en tablet

De spelpagina vult de **zichtbare** viewport, inclusief dynamische browserbalken en safe areas. Header blijft zichtbaar. Ondernavigatie tijdens een partij: **Spelen, Kamer, Chat, Ladder, Meer**; zonder partij wordt Spelen **Oefenen**. Profiel staat onder Meer. Er komen geen grote begroeting, extra spelkop, slogan of losse spelerslijst boven/onder het bord terug.

Tijdens een actieve partij schuiven Kamer en Chat vanaf onder tot 60% hoogte; buiten een partij vullen vrienden/berichten en kamerchat de bruikbare viewport. Het actieve bord blijft zichtbaar erboven. Het Kamer-paneel opent op de huidige spelerslijst; terugpijl brengt naar kamerkeuze met aantallen/maximaal. Chat heeft tabvolgorde Spelchat, Kamerchat en privégesprekken. De ondernavigatie blijft logisch bereikbaar; composer blijft boven het mobiele toetsenbord.

Landscape met geringe hoogte heeft eigen compacte regels; de bron zet vanaf 640 breed en maximaal 540 hoog de scorezone naast het bord. Niet forceren tot een onbruikbare verkleinde portraitindeling. Gebruik containerqueries/minmax/min-height:0 zoals in de bron. De gekozen indeling bij 1099 en 1100 px moet bewust omschakelen, zonder dubbele navigatie of verdwenen chat.

### 4.3 Bord, meters en knop

De rode knop is los van de verticale balk gepositioneerd. Daardoor kan hij laag richting tabel en het bord groot blijven. De hoogtebalk blijft naast het bord. De horizontale balk staat rechtsboven het bord. Indicators zijn dik en goed zichtbaar; de spelpagina gebruikt tracks rond 11 px en indicators van 8×25 / 25×8 px. Geen oude meetlijnen of decoratieve schaalverdeling terugbrengen.

De borddiameter volgt beschikbare breedte én hoogte; geen vaste beeldverhouding die onder de scoretabel verdwijnt. Huidige knopgroottes variëren responsive (o.a. 116 px basis en 108 px desktop); behoud de CSS in plaats van één nieuwe vaste knopmaat.

De scoretabel blijft breed leesbaar, met caption en Game ID. Lange nickname, VIP-kroon, divisiebadge en rating mogen de numerieke kolommen niet uit beeld drukken. Alleen de naam mag gecontroleerd afkorten; volledige identiteit blijft via titel/profiel beschikbaar. Bij kleine container kan de rating naar de volgende regel. Resterende score en beurt moeten direct afleesbaar blijven.

## 5. Beweging en feedback

| Interactie | Bestaand contract | Acceptatie |
| --- | --- | --- |
| Richting/hoogte | Automatisch lopende functionele indicators; twee acties. | Geen extra startknop per pijl; timing stopt precies op input. |
| Dartvlucht | Native SVG-transform om lokale tip `(0,0)`; bronduur 0,56 s. | Tip landt in exact berekend vak; geen bounding-box-offset. |
| Scorecommit | Alleen definitieve inslag. | Geen punten/turn/hints wijzigen tijdens vlucht; retry boekt niet dubbel. |
| Scorechip | Komt bij inslag, boven laatste pijl; 0,18 s zachte verschijning. | Correct label, blijft binnen bord, weg bij volgende vlucht. |
| Checkoutregel | Kleine y-beweging boven tabel, vier compacte opties maximaal. | Herberekenen na inslag; verbergt zonder mogelijkheid; knop overlapt niet. |
| 180 / finish | Kort moment, winnende dubbelmarkering. | Eén keer per resultaat; geen valse viering vóór serverbevestiging. |
| Panelen/modal | Zachte overgang, actieve achtergrondpartij blijft staan. | Focus logisch, sluitactie beschikbaar, geen reset van game. |
| Marketing spotlight | Bron wisselt ongeveer iedere 6,5 s, met vorige/volgende/pauze. | Pauzeert bij hover/focus, verborgen tab en minder-bewegenvoorkeur. |
| Reduced motion | Visuele overgangen/spectakel beperken. | Essentiële timing blijft bruikbaar; serverresultaat en scorevolgorde identiek. |

Respecteer zowel `prefers-reduced-motion` als de persoonlijke optie. Uitgeschakelde animatie mag geen ontbrekende `onLand`/vastgelopen partij veroorzaken. Sound/haptics zijn expliciet optioneel en falen geruisloos op niet-ondersteunde apparaten.

In echte multiplayer kan de server een landing-tijdstip/resultaat vooruit aankondigen en pas de bevestigde viewstate op het logische impactmoment tonen. Welke implementatie wordt gekozen staat in de Colyseus-specificatie; het zichtbare contract hierboven blijft gelijk.

## 6. Lobby, sociale bediening en backoffice

Lobby toont kamers en eventuele eventpromotie, plus hervatten waar nodig. Geen kamerchat voordat lidmaatschap bestaat. Vriendenpagina heeft verzoeken/lijst, geen inbox. Berichtenpagina beheert gesprekken. Een gesloten privétab blijft gesloten na refresh én een inkomend bericht; geschiedenis en concepttekst blijven bewaard.

Naamdropdown moet met muis, touch en toetsenbord werken. Wanneer een actie een uitnodigingsmodal of privéchat opent, mag automatische focusrestore van de dropdown de focus niet meteen terugtrekken. Alleen toegestane moderatieacties zichtbaar; alle andere gegevenspaden controleren rechten ook serverzijdig.

De uitnodigingsmodal behoudt 301/501/701, legs/sets, legs per set, best-of en ranking. Bij kleine schermen scrollt de modalinhoud intern en blijven titel/sluiten/actie bereikbaar. Een nickname lang genoeg voor de maximale gevalideerde invoer is deel van iedere modaltest.

Beheer heeft desktopzijbalk en mobiel menu. Precies één paginahoofdtitel; geen terugkeer van dubbele subheaders/beschrijvingen. Functionele sectiekoppen en veldhulp blijven. Brede brackets en tabellen mogen lokaal horizontaal scrollen; de hele pagina niet. Correctie/reset/afsluiten vraagt om de juiste reden en toont gevolgen vóór uitvoeren.

## 7. Auth en e-mails als onderdeel van hetzelfde product

Authschermen delen logo, sfeer, lettertypes, panelen en rode primaire actie met de vaste stijl. Ondersteun e-mail invoeren → code invoeren → eerste gebruikersnaam → bestemming. Terugkerende login heeft geen onnodige profielstap. De schermen moeten op telefoon met open toetsenbord volledig bedienbaar zijn.

Test iedere toestand: leeg, e-mail ongeldig, verzenden, code verstuurd, fout, verlopen, poginglimiet, resend cooldown, andere e-mail, succesvolle terugkerende login, succesvolle nieuwe login, bezette naam, ongeldige naam, profielopslaan en tijdelijk mislukte serveractie. Geef fouten bij het betreffende veld en een statusmelding; behoud bruikbare invoer waar veilig. Geen wachtwoordveld.

OTP is plakkenbaar; gebruik `autocomplete="one-time-code"` waar passend. De zichtbare zesvakjesvorm kan één toegankelijke invoer hebben; een screenreader hoeft niet zes zinloze labels te doorlopen. Automatische verzending bij laatste cijfer is alleen toegestaan wanneer foutcorrectie, dubbel-submit en focus goed afgevangen zijn. De serverlimieten blijven beslissend.

E-mailacceptatie: HTML en text hebben dezelfde code/bedoeling; donkere DartsPoint-stijl blijft leesbaar als afbeeldingen zijn geblokkeerd; code is selecteerbare tekst, geen raster; logo schaalt; hoofdinhoud binnen e-mailbreedte; links hebben zichtbare tekst; Outlook/Gmail/Apple Mail krijgen geen noodzakelijk CSS-motioneffect. E-mail is functionele communicatie, geen kopie van een webpagina met interactieve animatie. Test lichte en donkere clientmodus, mobiele weergave en text-only. Verstuur tests alleen naar geautoriseerde stagingontvangers.

## 8. Marketing en SEO-acceptatie

- Hero vult op desktop ten minste de eerste viewport; tekst en CTA liggen boven een leesbaar deel van de foto. Op kleine of korte schermen mag noodzakelijke inhoud logisch naar beneden doorlopen in plaats van worden afgesneden.
- Desktopmenu en mobiel menu navigeren naar juiste secties; de mobiele dialoog houdt focus vast, sluit met X/Escape en na een keuze, en geeft focus terug aan de menuknop.
- De drie spotlightkaarten hebben dezelfde rustige containerhoogte; wisselen veroorzaakt geen contentverschuiving. Pauze en handmatige knoppen werken ook zonder hover.
- Gameplaypreview gebruikt het echte bord. 301 demonstreert een openingsdubbel; 501/701 passende puntentelling. Niet alleen het label wisselen terwijl de score fout blijft.
- Upcoming-events tonen werkelijke planning of een duidelijke lege/datum-volgtstaat. Klik leidt via login terug naar dat event; geen onbeperkte externe `next`-redirect.
- Laddertabs ondersteunen pijltjes, Home/End, focus en `aria-selected`; tabellen hebben semantische headers. DP en divisiepunten worden niet verwisseld.
- CTA's naar registratie/login werken overal: header, hero, gameplay, event, footer. Geen `href="#"`-dummy of alleen optische knop.
- Publieke tekst is servergerenderd en bruikbaar zonder de carrousel; één H1, logische H2/H3, alternatieve tekst alleen voor betekenisvolle beelden.
- Canonical, sitemap, Open Graph, robots en structured data verwijzen naar de geconfigureerde productionorigin, uiteindelijk `https://dartspoint.nl`.
- Persoonlijke/auth-/beheerdata staan niet in metadata, sourceHTML, publieke JSON, sitemap of cache. Noindex is geen toegangsscherm.
- `.app` later expliciet routeren/canonicaliseren; geen twee concurrerende kopieën met uiteenlopende sessies zonder gekozen domeinbeleid.

## 9. Viewport- en apparaatmatrix

Alle maten zijn CSS-pixels, geen bestandsresoluties. Controleer op 100% zoom én afzonderlijk vergrote tekst. Gebruik echte apparaten voor toetsenbord, safe area, installatie, vibratie en netwerkgedrag. Emulatie is aanvullend.

| Klasse | Minimale set | Te controleren |
| --- | --- | --- |
| Smalle telefoon | 320×568, 360×640 | Geen horizontale paginascroll; authvelden/knoppen zichtbaar; tabelscores leesbaar; naam afgekort. |
| Gangbare Android | 390×844, 412×915 | Browserbalk in-/uit, header/nav/safearea, 60%-paneel, toetsenbordcomposer, terugknop. |
| iPhone | 393×852 of 430×932 | Safari dynamische viewport, notch/homeindicator, OTP-paste, PWAstandalone. |
| Telefoon landscape | 844×390, 915×412 | Compact bord+tabel naast elkaar, geen buttonoverlap, modal/composer bruikbaar. |
| Tablet portrait | 768×1024, 820×1180 | Ruimteverdeling, ondernav, panels en auth/marketingcopy. |
| Tablet landscape | 1024×768 | Net onder desktopbreakpoint: geen halve desktoplayout. |
| Breakpointgrens | 1099×768 en 1100×768 | Precies één gamecomponent, juiste nav, geen verdwijnende state. |
| Kleine desktop | 1280×720, 1366×768 | Rechterlijsten/chat intern scrollbaar; game+score zonder bodyoverflow. |
| Grote desktop | 1440×900, 1920×1080 | Links/rechts halve viewport, max-widths behouden, geen uitgerekte logo/kaarten. |
| Korte desktop | 1100×600, 1440×620 | Compacte headers, composer en score bereikbaar, geen lege overlays. |
| Vergrote interface | 200% browserzoom / grotere systeemtekst | Reflow, focuszichtbaarheid, labels en fouten niet afgesneden. |

Browserminimum voor acceptatie: recente Chrome/Edge desktop, Firefox desktop en Safari/iOS; Android Chrome en geinstalleerde PWA. Leg exacte testversies vast in het acceptatierapport in plaats van te claimen dat iedere browser getest is.

## 10. Referentiescènes voor screenshotvergelijking

Maak op de development-VPS screenshots van de **ongewijzigde bron** en van de geïntegreerde versie met dezelfde deterministische testdata. Gebruik vaste datum/tijd, fonts klaar, dezelfde viewport, dezelfde naam/rollen/rating en een gestopte animatiefase. Leg de bron-SHA, doel-SHA en fixture-ID vast. Geautomatiseerde visuele verschillen kunnen ruis van antialiasing tolereren; layout/tekst/assets mogen niet verdwijnen achter een ruime tolerantie.

| Scène | Verplichte inhoud / toestand |
| --- | --- |
| M01 | Marketing bovenkant: volledige hero, header, CTA en spotlight 1. |
| M02 | Mobiel menu open; focus op eerste menuoptie. |
| M03 | Gameplaypreview 301; score klopt met openingsdubbel. |
| M04 | Toernooikaarten, DP-tab en ieder divisietab. |
| A01 | E-mailformulier; fout en verzenden. |
| A02 | OTP-invoer, fout/expired/resend en open mobiel toetsenbord. |
| A03 | Eerste gebruikersnaam; beschikbare en bezette naam. |
| L01 | Lobby met alle kamers, volle/gesloten/favoriete kamer en eventpromotie. |
| L02 | Vriendenverzoeken + lijst, zonder inbox. |
| L03 | Berichten met meerdere privétabs en sluitknoppen; laatste tab leeg. |
| G01 | Eigen beurt, horizontale meter, volle scoreboard, desktopcommunity. |
| G02 | Verticale timing, dezelfde score als vóór de worp. |
| G03 | Halverwege vlucht: geen vroege score-update. |
| G04 | Inslag T20 met chip; volgende vlucht chip weg. |
| G05 | Finishbaar 170/3 en daarna gewijzigde route; onfinishbare score. |
| G06 | Bust, volgende speler, dubbel-in nog niet geopend en setsformat. |
| G07 | 180, winnende dubbel, eindkaart/revanche. |
| G08 | Tijdens actieve wedstrijd: Kamer-paneel 60%; zonder partij: volledige kamerchat en terug naar kamerlijst. |
| G09 | Tijdens actieve wedstrijd: Chat-paneel 60%; daarbuiten: volledige conversatie. Kamerchat/privé, spelchat alleen met match; toetsenbord open. |
| G10 | Linkshandige spelindeling, reduced-motion, reconnectscherm. |
| T01 | Toernooikamer met borden, bracket, wachtre­denen, kijker. |
| T02 | Double-elimination finales vóór en na vereiste tweede finale. |
| D01 | Divisieladder/rondes/eigen wedstrijd + badge. |
| B01 | Beheer desktopoverzicht en mobiel menu. |
| B02 | Spelersmodal, kamerformulier, moderatiecase en audit. |
| B03 | Toernooiformulier/indeling/correctie en seizoensbeheer. |
| P01 | Practice, clubhuisrecords/historie/raakpunten en instellingen. |
| E01 | OTP-e-mail HTML desktop/mobiel, dark-mode, afbeeldingen uit. |

Als in dit pakket geen gerenderde browserscreenshots zijn meegeleverd, zijn deze scènes een **te maken acceptatieset**, geen uitgevoerd bewijs. Beeldbestanden van logo, hero en e-mail kunnen wel afzonderlijk visueel gecontroleerd zijn. Broncodechecks of een geslaagde build bewijzen geen foutloze responsiviteit op alle apparaten.

## 11. Functionele acceptatiepaden

### AUTH — identiteit

- AUTH-01: nieuwe geautoriseerde testmail ontvangt OTP; ongeldige/verlopen code faalt; geldige code werkt precies eenmaal.
- AUTH-02: geverifieerde nieuwe gebruiker moet naam kiezen; gelijktijdige identieke naamkeuze kan slechts eenmaal winnen.
- AUTH-03: tweede login met dezelfde identiteit hergebruikt profiel en slaat onboarding over.
- AUTH-04: refresh tussen stappen en terugknop geven veilige begrijpelijke flow; geen toegang door localStorage te manipuleren.
- AUTH-05: `next` accepteert alleen eigen toegestane paden, geen `https://...`, `//...`, encoded bypass of beheertoegang.
- AUTH-06: bootstrapowner na e-mailverificatie; andere gebruiker met naam Nick krijgt geen owner; laatste owner kan niet per ongeluk verdwijnen.
- AUTH-07: uitloggen beëindigt sessie en socket; nieuwe tabs/apparaten tonen de juiste accountstaat.

### SOCIAL — kamers, vrienden en chat

- SOC-01: lobby heeft geen roomchat; join opent juiste lidmaatschap; leave beëindigt roomabonnement.
- SOC-02: twee clients proberen de laatste kamerplek; capaciteit wordt nooit overschreden.
- SOC-03: verzoek versturen → pending bij afzender → incoming bij ontvanger → acceptatie zichtbaar aan beide kanten; weigeren/intrekken/verwijderen werken.
- SOC-04: privébeleid iedereen/vrienden/niemand werkt serverzijdig; mute, block en sanctie zijn apart.
- SOC-05: sluit middelste/laatste privétab; draft/historie behouden, niet spontaan heropenen; heropenen via Berichten.
- SOC-06: chat is gescheiden per match-ID, room-ID en thread-ID; een vervalste join/read/send lekt geen andere thread.
- SOC-07: stille eigen beurt buffert alleen weergave; berichten worden later precies eenmaal getoond.
- SOC-08: uitnodiging met 301/sets/ranked behoudt exacte snapshot; afwijzen/timeout/gelijktijdig andere partij start geen dubbele game.

### GAME — gedeelde wedstrijd

- GAME-01: twee verschillende accounts + kijker zien dezelfde volgorde en score; kijker kan geen dart indienen.
- GAME-02: 301 telt eerst nul, opent op D/BULL, herhaalt per leg; 501/701 direct-in.
- GAME-03: single, double, treble, 25, bull, miss en grenswaarden corresponderen met zichtbare tip.
- GAME-04: score/darts/turn/hints ongewijzigd tijdens vlucht; impact verwerkt eenmalig, ook bij dubbele callback/netwerkretry.
- GAME-05: overgooien, één over, fout uitgooien herstellen volledige beurt en geven juiste reden.
- GAME-06: setsformat wint juiste leg/set/match, telt totale legs apart, wisselt starter; hervatten/revanche bewaart regels.
- GAME-07: route 170 met drie darts geldig, 169 niet; direct D20 bij 40; BULL bij 50; geen route met onvoldoende darts.
- GAME-08: forged player-ID, score, turn, sequence, timing en repeated command worden geweigerd of idempotent beantwoord.
- GAME-09: reconnect vóór deadline herstelt dezelfde stoel/bevestigde dart; deadlineoverschrijding verwerkt maximaal één geldig eindresultaat.
- GAME-10: serverrestart/netwerkbreuk op ieder moment (voor input, vlucht, impact, derde dart, finish) leidt niet tot dubbele score/DP of verloren definitieve uitslag.
- GAME-11: focus in composer/modal + Spatie veroorzaakt geen worp; touch/muis/spatie gebruiken dezelfde opdracht.

### ELO — uitslag en plaatsing

- ELO-01: gelijk 1500/1500 resulteert +16/−16; ongelijke ratings gebruiken beide oorspronkelijke getallen.
- ELO-02: één wedstrijd-ID telt eenmaal; retry geeft hetzelfde resultaat, conflicterende winner faalt.
- ELO-03: 9 wedstrijden/5 tegenstanders nog wit; 10/4 nog wit; 10/5 gekleurd. Roundinggrens 1449,6 wordt getoond als geel 1450.
- ELO-04: 1450–1549 geel; 1550 groen; practice/casual/bot en administratieve niet-gespeelde walkover geen DP.
- ELO-05: volledige match telt eenmaal, niet ieder set/leg; correctie heeft audit/compensatie, behoudt historische integriteit.

### COMPETITION — organisatie

- COMP-01: verborgen concept niet openbaar; gepubliceerde eventkamer wel; kijker heeft geen speelrecht.
- COMP-02: deadline, rating, approval, check-in, VIP/team, rules en capaciteit werken onafhankelijk; wachtlijst krijgt geen extra speelplek.
- COMP-03: knock-out met byes én onbesliste voorgangers; geen phantom winnaar.
- COMP-04: double elimination met 4/8/16 spelers, twee verliesmomenten, en beide grandfinalscenario's.
- COMP-05: scorecorrectie wist precies afhankelijke uitslagen in alle takken; volle reset vergt reden en is geen finalereset.
- COMP-06: parallelle planners delen niet hetzelfde bord/speler dubbel in; rusttijd gerespecteerd; uitgevallen worker hervat duurzaam.
- COMP-07: no-show, beide afwezig, korte disconnect, opgave, organisatorische annulering en serverstoring volgen gekozen beleid en audit.
- COMP-08: schema even/oneven divisie, ieder paar eenmaal, rustweek; drie punten/rangschikking en gedeelde stand correct.
- COMP-09: promotie/degradatie bij gelijke grens waarschuwt en promoveert niet willekeurig; vervolgschema bevat geen oude resultaten.
- COMP-10: competitieafsluiting verandert alleen de betreffende match/event/season; geen overschrijven van losse hervatpartij.

### ADMIN — rechten

- ADM-01: gewone speler/VIP kan beheerAPI niet aanroepen door UI te omzeilen.
- ADM-02: kamermoderator kan alleen zijn kamer en lagere toegestane doelgroep modereren; geen globale schorsing.
- ADM-03: admin kan owner/gelijkbevoegde staff niet zonder expliciet recht sanctioneren; ownerbootstrap geen clientkeuze.
- ADM-04: mute/expiry/revoke en globale schorsing werken in bestaande sockets én nieuwe requests.
- ADM-05: gesloten kamer laat bestaande games intact, weigert nieuwe instroom; verwijderen alleen leeg+gesloten.
- ADM-06: instellingwijziging is geversioneerd/geauditeerd; DP-concept activeert niet; oude events houden eigen regels.
- ADM-07: CSV-export bevat precies geselecteerde auditrecords en veilig escaped velden; geen secrets/OTP/mailcredentials.

## 12. PWA-, offline- en multi-deviceacceptatie

Installatie wordt aangeboden in instellingen, niet ongevraagd over gameplay. Manifestnaam, iconen en start_url zijn goed. Een verse offline bezoeker krijgt geen valse claim dat practice al beschikbaar is; offlinefunctie werkt na succesvolle online installatie/cache.

Controleer in DevTools en echte apparaten dat serviceworker geen authpagina, ingelogde HTML, RSC-payload, privébericht of API-antwoord bewaart. Na uitloggen en accountwissel mag de oude identiteit niet uit cache verschijnen. SW-updates mogen een actieve ranked-partij niet onverwacht herladen. De offlinepagina is oefenen, geen multiplayer of ratingbron.

Cross-play betekent hier dezelfde serverwedstrijd vanuit desktop, tablet en telefoon via web/PWA. Een eigen Android-/iOS-storewrapper is niet meegeleverd. Test wel overgang app/background/foreground, netwerk Wi-Fi → mobiel, slaapstand en twee apparaten met dezelfde account. De server bepaalt beleid voor maximaal één actieve speelstoel; dubbele sessies mogen geen dubbele worp veroorzaken.

## 13. Technische verificatie en rapportage

De bron bevat gerichte scripts voor geometrie, checkouts, DP, game-state, matchformats, fair-play, vrienden, privétabs, admin, toernooien, divisies, competitieregels, public catalog en demo-auth. Hergebruik de purelogica-tests. Pas alleen de transport-/storageafhankelijke fixtures aan voor de nieuwe server; verwijder niet eerst falende businesscases.

Voer op de bevroren implementatie uit:

1. Lockfileinstallatie, typecontrole, relevante unit-/integratietests en productiebuild.
2. Realtime-tests met minstens twee echte testaccounts plus een kijker, inclusief reconnect en idempotentie.
3. Browser-E2E voor auth, lobby/social, één volledige match, event/divisie en beheerrechten.
4. Visuele vergelijking van de referentiescènes op de afgesproken matrix.
5. Echte mail-, Android-/iOS-, toetsenbord- en PWAproeven waar emulatie tekortschiet.
6. Een stagingdeploy via de echte GitHub Environment/runnerroute; checks tegen de gepubliceerde SHA.

Rapport per testset: datum, bron-SHA, doel-SHA, omgeving, browser/apparaat, scenario's, geslaagd/gefaald/niet uitgevoerd, bewijsbestand en bekende beperking. Geen algemene claim ‘volledig getest’ als mailprovider, apparaat of externe dienst nog niet aangesloten was. Een placeholder, zichtbare demoactie of non-authoritative clientscore is een resterend implementatiepunt, geen geslaagde productiecheck.

Minimale releaseblokkades: niet-geverifieerde login, verkeerde owner, clientrechten manipuleerbaar, private datalek, bord/scoregeometrieverschil, dubbele score/DP, verloren definitieve uitslag, dubbel geboekt bord/speler, onbruikbare mobiele composer/OTP, ontbrekende viewportknop, niet werkende deployment of ontbrekend herstel van persistente gegevens.

## 14. Review aan de gebruiker

Lever na implementatie een werkende staging-URL met e-maillogin en eerste owneraccount, plus een bondig overzicht van bewezen functies en resterende externe configuratie. Toon screenshots op telefoon en desktop naast de oorspronkelijke referentie voor UI-goedkeuring. Vraag niet om de algemene ontwerpkeuze opnieuw: de keuze is Afterhours en de bron is bindend.

Een afwijking die technisch noodzakelijk is, wordt concreet uitgelegd met voor/na en effect. De gebruiker mag geen visueel ander product krijgen doordat bijvoorbeeld een runtime, authprovider of componentbibliotheek werd gewisseld. De backend past zich aan de bestaande productervaring aan.

## Responsieve aanvulling 13 oktober 2026

Vrienden en berichten buiten een wedstrijd vullen de bruikbare viewport. Een geopend gesprek heeft een terugknop, eigen scrollvlak en bereikbare composer; visualViewport en safe-area houden rekening met toetsenbord en korte landschapschermen. Een chatpaneel tijdens een actieve partij behoudt de gamecomponent en verbinding. Ongelezen badges tellen berichten per kanaal, geen gesprekken.

Het gedeelde profiel gebruikt 16 px binnenruimte op mobiel en 24 px op desktop. De hero loopt over de volle breedte; onderhoeken zijn recht en bovenhoeken blijven behouden. Langere namen mogen omlopen. Alle profielingangen gebruiken deze component.

Landing en gewijzigde schermen worden gecontroleerd op 320×568, 360×800, 390×844, 768×1024, 844×390, 1366×768 en 1920×1080, plus zoom en toetsenbord/safe-area-emulatie. Screenshots en traces komen in `artifacts/update-2026-10-13`; fysieke apparaten blijven een afzonderlijk te benoemen beperking.
