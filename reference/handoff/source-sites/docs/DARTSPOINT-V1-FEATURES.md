# DartsPoint V1 — implementatie

Alle functies horen bij het vaste Afterhours-ontwerp. De site blijft een interactief prototype met gesimuleerde spelers. Geen echte berichten, uitnodigingen of moderatiebeslissingen worden naar anderen gestuurd.

## Elo

Verwachting: `E_A = 1 / (1 + 10^((R_B - R_A) / 400))`.
Na de wedstrijd: `R_A' = R_A + 32 * (S_A - E_A)`, met `S_A` gelijk aan 1 bij winst en 0 bij verlies. De tegengestelde wijziging geldt voor B. Ratings behouden decimalen en worden alleen voor weergave afgerond.

Een nieuwe speler start op 1500 en blijft wit gedurende de plaatsing: minimaal 10 wedstrijden én 5 verschillende tegenstanders. Daarna geldt voor de getoonde rating: rood <1450; geel 1450–1549; groen ≥1550. De bredere gele band voorkomt dat één punt verschil iemand direct een andere classificatie geeft. Rollen behouden afzonderlijke kleuren voor de nickname.

De modus `ranked-demo` werkt in een lokale Elo-sandbox. Vrij spelen, botwedstrijden en oefenen wijzigen geen rating. Een bewaard wedstrijd-ID kan niet nogmaals rating toevoegen. De serverdemo heeft geen echte accountauthenticatie en levert geen officiële ranked-resultaten.

## Functies

| # | Functie | Uitwerking en plaats |
| --- | --- | --- |
| 1 | Vijf-pijlenintroductie | `/oefenen?les=1`: echte timing en inslagen, vijf worpen en afsluiting. |
| 2 | Gericht oefenen | Vrij, dubbels, BULL en gekozen finish; zonder rating. |
| 3 | Revanche | Eindkaart: nieuwe partij met de andere eerste starter. |
| 4 | Wedstrijdhistorie | Clubhuis en spelmenu: Game ID, iedere pijl, beurt en leg. Maximaal 100 afgeronde partijen lokaal. |
| 5 | Verbindingsherstel | Bevestigde toestand en exact retryverzoek bewaard; zichtbare 60-seconden hersteltest. |
| 6 | Wedstrijdkaart | Regels, spelvorm, tegenstander en starter vóór de eerste pijl. |
| 7 | Elo-voorvertoning | Verwachte ratingwinst of verlies vóór de ranked-demo. |
| 8 | Eindkaart | Uitslag, gemiddelde, hoogste beurt, hoogste finish en Elo-wijziging. |
| 9 | Bustuitleg | Te veel, één over of nul zonder dubbel: concrete reden en teruggezette score. |
| 10 | Persoonlijke records | Hoogste beurt/finish, snelste gewonnen leg, 180-teller, overwinningen en dubbels. |
| 11 | Raakpuntenkaart | Bij iedere afgeronde partij: eigen of beide spelers' echte raakpunten. |
| 12 | 180-moment | Animatie en optioneel geluid na de bevestigde derde inslag. |
| 13 | Winnende dubbel | Het geraakte finishvak licht op. |
| 14 | Verdiende badges | Eerste finish, 180, tien verschillende dubbels en eerste overwinning; oefenbadges apart. |
| 15 | Weekuitdaging | Vijf unieke dubbels, lokaal bijgehouden per ISO-week in Amsterdam. |
| 16 | Avondcup | Acht deelnemers, inschrijving, drie rondes; eigen gespeelde uitslag verwerkt, overige uitslagen expliciet gesimuleerd. |
| 17 | Wachtrij | Bij bekeken wedstrijd: ‘Ik speel hierna’, afmelden en demo van doorschuiven. |
| 18 | Favoriete kamers | Kamers bewaren en snel terugvinden in de lobby. |
| 19 | Beschikbaarheid | Wil spelen, speelt en kijkt; eigen voorkeur instelbaar. Aanwezigheid is demo. |
| 20 | Snelle chatzinnen | Directe lokale chatreacties en ‘Goed gespeeld!’ op de eindkaart. |
| 21 | Rustige eigen beurt | Nieuwe inkomende chatinhoud tijdelijk bufferen en na de beurt tonen. |
| 22 | Privéchatvoorkeur | Nieuwe gesprekken van iedereen, alleen vrienden of niemand; bestaande gesprekken blijven beschikbaar. |
| 23 | Blokkeren en melden | Vanuit spelers, profiel en privéchat; lokaal verslag met Game ID en context. |
| 24 | Kamerbeheer | Eigenaar kan waarschuwen, tijdelijk muten, verwijderen en opheffen; reden, duur en lokaal log. |
| 25 | Linkshandige bediening | Gooiknop links met behoud van dezelfde timing. |
| 26 | Toetsenbord | Spatie gebruikt dezelfde tweefasenbediening; tekstvelden en dialogen onderscheppen dit niet. |
| 27 | Haptiek | Optionele korte trilling bij vastzetten en inslag, waar ondersteund. |
| 28 | Ratinguitleg | Klikbare rating met tekst over kleur, plaatsing en drempels; kleur is niet de enige uitleg. |
| 29 | Offline PWA | Installeeractie, iconen en serviceworker met aparte offline timing-oefenpagina. |
| 30 | Servercontroles | D1 bewaart toestand en unieke receipts; controleert beurt, volgorde, timinggrenzen en berekent score. |

## Desktop, vrienden en wedstrijdinstellingen

- Desktop vanaf 1100 px: linkerhelft bord, bediening en scoretabel; rechtsboven kamerleden en vrienden, rechtsonder chat. Mobiel houdt de bestaande schuifpanelen.
- Vriendschappen en inkomende/uitgaande verzoeken delen één opgeslagen status. Toevoegen, accepteren, weigeren, intrekken en verwijderen worden direct zichtbaar in alle betrokken onderdelen. Een uitgaand verzoek wordt niet stilzwijgend geaccepteerd; de prototype-interface biedt een expliciete demoactie voor de reactie van de ander.
- Namen openen een menu met speluitnodiging, vriendactie, privéchat, persoonlijke mute en bestaande meld-, blokkeer- en moderatieacties. Persoonlijk dempen is gescheiden van een mute door kamerbeheer. De instelling ‘alleen vrienden’ gebruikt de actuele vriendenlijst.
- De uitnodigingsmodal kiest 301, 501 of 701, legs of sets, best-of-aantallen en ranking. 301 speelt dubbel-in/dubbel-uit; 501 en 701 beginnen direct en eindigen op een dubbel. Best-of legs loopt van 1 tot 21 (oneven), best-of sets van 1 tot 7 (oneven), met afzonderlijke legs per set.
- Bij dubbel-in tellen treffers vóór de openingsdubbel nul punten, maar kosten ze wel een pijl. BULL opent ook. Elke nieuwe leg vereist opnieuw een dubbel. Een bust herstelt zowel de score als de openingstoestand aan het begin van de beurt. De score verandert pas bij de zichtbare inslag.
- Sets tellen afzonderlijk van legs; de legstand begint na een gewonnen set opnieuw. Historie bewaart de totale legs en de setuitslag. Server en browser delen de score- en wedstrijdlogica. Bestaande opgeslagen partijen behouden hun regels.
- De lokale Elo-demo verwerkt alleen de winnaar van de volledige wedstrijd, niet iedere leg of set. Vrije partijen wijzigen geen Elo. Uitnodigen start een automatisch spelende demotegenstander; er wordt geen echte speler benaderd.

## Grenzen voor een echte lancering

- Echte login, meerdere gelijktijdige spelers, aanwezigheid en berichtenbezorging zijn nog geen productiediensten.
- Elo, historie, badges, cup, voorkeuren en sociale administratie zijn apparaatgebonden prototypedata.
- De server accepteert raakcoördinaten en clienttijd met plausibiliteitscontroles. Hij bewijst geen menselijke bediening en voorkomt niet alle vormen van automatisch richten. Officiële ranked-rating wordt daarom niet door deze API toegekend.
- Offline practice is beschikbaar nadat de serviceworker tijdens een online bezoek is geïnstalleerd. Geen offline synchronisatie van accounts, Elo of chat.

## Laatste interfacepolijsting en marketing

- De lobby toont alle kamers met zoeken, filters, favorieten en officiële eventpromotie. Vrienden en berichten hebben ieder hun eigen pagina. De vriendenpagina bevat geen inbox. Een actieve partij blijft hervatbaar.
- Privégesprekken sluiten via de X op de tab, ook met Delete op de geselecteerde tab. Sluiten verwijdert geen berichten of concepttekst. Tabstatus blijft in dezelfde browsersessie bewaard; gesloten gesprekken zijn via Berichten opnieuw te openen. Lobbychat heeft geen kamer- of spelkanaal.
- De publieke homepage bevat een beeldvullende hero met registratie-CTA, wisselbare competitiekaarten, echte bordweergave, demotoernooien, Elo-ladder, drie divisieladders, kamers en veelgestelde vragen. Gegevens komen uit een expliciete demoprojectie; concepten en privédata blijven buiten de pagina.
- Login en registratie delen e-mail → OTP-democode → eerste spelersnaam → profielbevestiging. Een terugkerend lokaal profiel slaat naamkeuze over. Code: 6 cijfers, 10 minuten, 60 seconden herzendpauze, fout- en vervalstates. Geen echte mail of auth; alleen een fingerprint/voorbeeldprofiel wordt lokaal bewaard en de vervolgactie opent expliciet de Nick-speeldemo.
- Mailvoorbeelden op `/mailvoorbeelden` delen een DartsPoint-basis voor HTML en plain text. De overdracht bevat de Supabase OTP-template met `.Token` en vereisten voor echte verzending.
- Metadata, canonical, Open Graph, robots en sitemap vormen de technische SEO-basis. Publieke vindbaarheid vereist later een openbaar bereikbare productieomgeving.

## Validatie

TypeScript-productiecontrole; gerichte tests voor Elo/plaatsing/idempotentie, game-reducer/impact/bust/restore, server-client toestand en bordgeometrie. Oefenprogressie, weekgrenzen en sociale storeacties zijn gericht gecontroleerd. Productiebuild via de Sites-workflow. In deze omgeving is geen browsercontrole beschikbaar.
