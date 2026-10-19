# DartsPoint communityvoorbeeld en regisseur

Dit Sites-voorbeeld bevat 25 vaste fictieve clubkarakters: 13 mannen en 12 vrouwen van 18 tot 40 jaar. Profielen bevatten interesses, karakter, gesprekstijl, NL/EN-voorbeeldreacties, speelsterkte en aanwezigheidstijden. De kleine AI-vermelding staat onderaan het profiel; chatregels hebben geen extra label.

## Openen

- `/npc`: clubhuis met lokale aanwezigheid, gesprekken, uitnodigingen en wedstrijden.
- `/npc?tab=roster`: alle profielen en filters.
- `/npc?tab=director`: tijdstip, bezetting, gesprekstempo, uitnodigingen, DP, scenario's en logboek.
- `/beheer?tab=npcs`: toegang vanuit platformbeheer.

De nieuwe hoofdfuncties zijn ook bereikbaar via Communityvoorbeeld in de lobby. NPC's verschijnen in de bestaande spelerslijst; profielen, uitdagingen en meekijken sluiten aan op de bestaande speelinterface.

## Werkelijke uitvoering van deze demonstratie

Aanwezigheid, planning, chat, uitnodigingen en wedstrijden draaien lokaal in de browser. De regisseur bewaart zijn toestand in sessionStorage. De bestaande lokale DP-ledger bewaart puntenresultaten. Het herstarten van de planning wist geen reeds geboekte DP-resultaten.

Er is geen live taalmodelverbinding, geen productie-NPC-worker en geen multiplayerachtergrondproces aangezet. Gesprekken gebruiken de vastgelegde karaktervoorbeelden, een begrensde lokale gespreksregisseur en inhoudelijk gekoppelde NL/EN-dialoogplannen. Een API-sleutel of modelbudget is voor deze demonstratie niet nodig.

Onderlinge 301 double-out-partijen gebruiken `scoreDart`, `applyDart` en de bestaande checkoutroutes. De bestaande DP-ledger verwerkt rated resultaten eenmaal met dezelfde zero-sum-berekening. Oefenpartijen wijzigen geen DP. Wedstrijden tegen een gekozen karakter in de speelinterface zijn expliciet lokale demowedstrijden en gebruiken het karakterprofiel voor worpen.

De regisseur gebruikt alleen toegestane open kamers en respecteert de actuele toegang en capaciteit uit het lokale kamerbeheer. Een lopende partij wordt uitgespeeld bij het terugbrengen van de gewenste bezetting. Een expliciet geaccepteerde uitnodiging reserveert de tegenstander.

## Onderlinge gesprekken en schrijfstijlen

De NPC’s kunnen nu werkelijk op elkaar reageren in de lokale demonstratie. `forceNpcAction('conversation', profileId?)` start vanuit het clubhuis of de regisseur een gesprek met twee beschikbare karakters in de geselecteerde open kamer. Als nodig schuift een geschikt karakter aan, binnen de ingestelde bezetting en kamercapaciteit. De eerste nieuwe browsersessie start automatisch één zichtbaar gesprek zodra deelnemers beschikbaar zijn; daarvoor hoeft niemand minuten te wachten. Een vernieuwde pagina start die kennismaking niet steeds opnieuw.

Een gesprek heeft twee tot vijf beurten, maximaal één actieve draad per kamer en drie over het platform. De lokale plannen behandelen onder meer dubbels, oefenen, muziek, bordspellen, fotografie, koken, film, wandelen, ruimteverhalen en creatieve hobby’s. Interesses beïnvloeden de onderwerpkeuze. Vragen, antwoorden en vervolgvragen sluiten inhoudelijk op elkaar aan. Een gewone NPC-post kan soms een passend inhoudelijk vervolg krijgen; onbekende opmerkingen en losse begroetingen lokken geen willekeurige citaten of begroetingsketens uit.

De geplande antwoorden hebben willekeurige, karakterafhankelijke wachttijden. Een echte wachttijd van minimaal twee seconden voorkomt een berichtenstroom bij 60× simulatiesnelheid. Daarnaast moet de simulatietijd vooruitgaan. Elke antwoordstap controleert opnieuw dezelfde twee deelnemers, de oorspronkelijke kamer, hun beschikbaarheid en het nog bestaande bronbericht. Een reset, pauze, vertrek, uitschakeling, uitnodigingsreservering of gestarte wedstrijd annuleert de oude draad. Een menselijk kamerbericht beëindigt het onderlinge NPC-gesprek en geeft de bezoeker het woord. Geannuleerde reacties worden na hervatten niet alsnog verstuurd.

De schrijfstijl volgt de nieuwe profielinstellingen: sommige karakters schrijven in kleine letters en korte fragmenten, andere gebruiken verzorgde zinnen en interpunctie. Informele afkortingen als `ff` worden alleen gebruikt door karakters die dat expliciet in hun schrijfstijl hebben. Er worden geen willekeurige typefouten toegevoegd. De karakters doen geen claims dat zij echte menselijke bezoekers zijn.

Alle tekst gaat na de stijlbewerking nog steeds door dezelfde verplichte `publishNpcText`-controle. Pas nadat een openingsbericht daadwerkelijk is goedgekeurd en geplaatst, kan een ander karakter een antwoord plannen. Een geblokkeerd antwoord beëindigt de draad; uitputting van alle nieuwe onderwerpen betekent stilte. Per onderwerp en beurt delen NL/EN-vertalingen dezelfde templatefamilie. Opnieuw een scenario starten probeert ongebruikte onderwerpen, zonder nummers, namen of losse suffixen als truc om de 12-uursbewaking te omzeilen. `replyToId`, `threadId` en `topic` in de lokale geschiedenis zijn uitsluitend verband- en diagnosegegevens; zij voegen geen label aan chatberichten toe.

`lib/darts-npc-conversation.ts` bevat de eindige dialoogplannen en stijlbewerking. `lib/darts-npc.ts` beheert de geldigheidscontroles en wachtrijen. Dit blijft een beperkte, geschreven simulatie en is geen vrij converserend taalmodel.

## Gedeelde tekstbewaking: 12 echte uren

Alle nieuwe NPC-chatuitingen gaan door `publishNpcText` in `lib/darts-npc-text.ts`, voordat ze naar een gesprekskanaal of de demonstratiegeschiedenis gaan. De bewaking geldt voor alle 25 karakters samen, over open kamers, wedstrijdchat en bestaande privéchatreacties. Menselijke berichten en statische profielvoorbeelden zijn geen nieuwe NPC-uitingen.

De afzonderlijke localStorage-ledger bewaart alle gepubliceerde teksten binnen een rollend venster van 12 uur. Deze gebruikt `Date.now()`, onafhankelijk van de versnelde simulatietijd. Verversen, navigeren en ‘nieuwe clubavond’ wissen deze ledger niet. Het terugzetten van de systeemklok laat berichten niet eerder verlopen. De zichtbare chat mag wel worden ingekort zonder dat de tekstbewaking geschiedenis verliest.

Bij de eerste upgrade worden nog opgeslagen NPC-berichten uit de zichtbare demonstratie- en chatgeschiedenis conservatief voor 12 uur gereserveerd. Hun oude simulatietijd wordt niet gebruikt als echte publicatietijd. Een bestaande tekstledger wordt eenmalig aangevuld, zonder beschermde records te vervangen of hun tijdstempels te verversen.

De laatste controle gebruikt de daadwerkelijk te versturen tekst, na trimmen en afkappen op 500 tekens. Hoofdletters, diakritische tekens, emoji, leestekens, extra spaties en verwisselde spelersnamen of losse getallen maken een herhaling niet uniek. Woordoverlap, tekstinsluiting en tekenreeksoverlap weren ook sterk gelijkende formuleringen. Gedeelde templatefamilies voorkomen het herhalen van bekende NL/EN-varianten. Deze lexicale controle garandeert geen herkenning van iedere denkbare semantische parafrase.

De regisseur probeert alternatieve karaktervoorbeelden. Zijn alle kandidaten herhalingen, dan publiceert hij niets; hij plakt geen nummer of willekeurig achtervoegsel aan oude teksten. Een corrupte, volle of onbeschikbare ledger betekent eveneens stilte. Nog geldige records worden nooit weggegooid om ruimte te maken. In het regisseurstabblad toont ‘Unieke gesprekken’ de bewaarde berichten en tegengehouden kandidaten.

Publicaties worden op één pagina in een wachtrij verwerkt. Waar beschikbaar maakt de Web Locks API de lees-controle-schrijfcyclus ook exclusief tussen tabbladen op dezelfde browser-origin. Bij ontbreken van Web Locks is de vergrendeling beperkt tot de huidige pagina. De geschiedenis hoort bij deze browser en dit domein; dit lokale voorbeeld coördineert geen afzonderlijke apparaten of de toekomstige .nl- en .app-domeinen.

Voor productie is één server-side ledger voor beide domeinen nodig. Controleer en reserveer exacte fingerprints en templatefamilies transactioneel, voer vergelijkingscontroles binnen dezelfde exclusieve publicatiestap uit en lever alleen goedgekeurde berichten via een transactionele outbox. Alle NPC-workers en alle uitgaande kanalen moeten diezelfde stap gebruiken. Bewaar records minimaal 12 uur en werk bij opslagfouten zonder publicatie. Verbind een toekomstige generator pas vóór deze verplichte eindcontrole.

## UI-afstemming op de applicatierepository

Bron voor de vergelijking: `dartspoint/platform`, main op commit `70528c02696710070bd2ab9c44bf0b9a6dabc9bc` van 18 oktober 2026.

Bijgewerkt: gedeelde 50:50 desktopindeling met spelers/vrienden boven en chat onder, kamerfeed, desktop- en mobiele viewportstyling, kamervlaggen, voertaalfilters, metadata-editor, taalkeuze in lobby/voorkeuren en voorbeeldcontactinformatie voor beheerders.

De nieuwe lobby- en metadatacomponenten bieden Nederlands/Engels. Dit werk pretendeert geen volledige port van alle vertaalcatalogi, backendauthenticatie of alle schermen van de applicatierepository te zijn. Bestaande social-sharefuncties uit het prototype zijn behouden.

## Controle

Voer `node scripts/check-npc-director.cjs` uit voor de headless regisseurcontroles. De harness laadt de echte TypeScriptmodules met alleen browseropslag en timers vervangen door in-memory varianten. Zij voert geen API-, mail- of databasehandelingen uit.

Gecontroleerd: rooster en leeftijdsverdeling, bezettingsgrenzen inclusief nul, corrupte opslag, geldige worpen en finishes, reservering en verloop van uitnodigingen, puntenbehoud, eenmalige resultaatverwerking en 1.000 simulatietikken.

Voer `node scripts/check-npc-text.cjs` uit voor de tekstbewaking: gedeelde herhalingscontrole, normalisatie en gelijkende formuleringen, grens van 12 echte uren, gelijktijdige kandidaten, opslag en herladen, behoud na reset/simulatiesnelheid, stille uitputting en de bestaande chatpaden.

Voer `node scripts/check-npc-conversation.cjs` uit voor de onderlinge gesprekken. De harness gebruikt een vervangbare echte klok, simulatietikken en geplande timers. Hij controleert de snelle eerste demonstratie, twee verschillende auteurs, inhoudelijke antwoordverbanden, twee tot vijf beurten, rustige timing bij 60×, annulering bij pauze/reset/vertrek/uitschakeling/wedstrijd/kamersluiting en menselijke tussenkomst, stilte bij geblokkeerde bron of reactie, nieuwe onderwerpen bij herhaalde scenario’s, gedeelde NL/EN-families en verschillende schrijfstijlen.

Verder gecontroleerd: TypeScript en de volledige Sites-build. Visuele browsercontrole is in deze uitvoeromgeving niet beschikbaar.
