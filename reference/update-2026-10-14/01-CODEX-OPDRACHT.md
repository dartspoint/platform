# Opdracht voor Codex — DartsPoint UI/UX en platformbeheer

Voer deze opdracht uit in de **actuele** repository `dartspoint/platform`. Het bijgevoegde prototype is de grafische en interactieve referentie. Implementeer de beschreven wijzigingen volledig in het bestaande platform, met werkende beheer- en gebruikersflows en passende persistente data. Houd de bestaande Afterhours-stijl, componentopbouw, CSS-volgorde, fonts, assets en gedrag aan.

## 1. Eerst vaststellen

- Lees de toepasselijke `AGENTS.md`, actuele repo-documentatie en lokale frameworkdocumentatie. `apps/web/AGENTS.md` wijst expliciet naar de bij deze Next.js-versie meegeleverde documentatie.
- Controleer de werkboom, lopend werk en huidige branch. Behoud wijzigingen van anderen. Lees deze overdracht en valideer `manifest.json` met `VERIFY-PACKAGE.py`.
- Vergelijk de huidige repo met de in dit pakket gelezen commit `5817bd4ba4721195565b2cb87089ab6e1efcf545`. De repo kan inmiddels verder zijn. Werk niet terug naar die commit en behandel bestaande correcte implementaties niet als ontbrekend werk.
- Maak een korte implementatiematrix: al aanwezig, aanpassen, toevoegen, testen. Gebruik `05-REPO-INTEGRATIE.md` als startpunt.
- Bewaar het bronpakket desgewenst als herkenbare referentie in de bestaande `reference/`-structuur. Kopieer nooit de volledige Sites-app over `apps/web` heen.

## 2. Te realiseren resultaat

### Kamerlobby en mobiele panelen

- Maak links in de bestaande desktopwerkruimte het clubhouse-grid uit `darts-room-feed.*` met de vier filters en de acht widgetsoorten uit de inventaris. Gebruik de bestaande kamerleden, toernooien, oefenvoortgang en divisiegegevens.
- Behoud de vaste 50/50-desktopwerkruimte en de rechterhelft met spelers/vrienden boven en chat onder. Een actieve partij blijft gemount bij paneelwissels en resizing.
- Maak iedere zichtbare CTA en route echt bruikbaar. Kamer binnenkomen, toernooi bekijken, oefenen, spelers zoeken en nieuws openen moeten via de bestaande productnavigatie werken.
- Alleen op de mobiele paneelvariant: Kamer, Chat en Ladder gebruiken 90% van de zichtbare viewport in de kamerlobby, en maximaal 60% tijdens gameplay. Laat de gameplay zichtbaar en respecteer browserbalk, toetsenbord en safe area. De laatste eis vervangt oudere beschrijvingen van volledig scherm buiten een partij, uitsluitend voor deze kamerlobbycontext.

### Platformbeheer

- Voeg centraal **Lobby & widgets** toe. Bouw één geordende lay-out met concept en gepubliceerde versie. Ieder widget heeft zichtbaar/verborgen, half/breed en doelgroep alle kamers of selectie van stabiele kamer-ID's.
- Ondersteun widget toevoegen, wijzigen, verplaatsen, dupliceren en verwijderen; nieuwsberichten beheren; desktop-/mobielvoorbeeld voor een gekozen kamer; duidelijke concept-/publicatiestatus en fouten.
- Koppel de bestaande platformaankondiging, kamers, toernooien, divisies en oefenvoortgang. Maak geen tweede kopie van dezelfde domeindata.
- Maak concept opslaan en publiceren serverzijdig, met rechtencontrole, validatie, versieconflictafhandeling en audit. Een gedeeltelijk mislukte opslag mag de live-inrichting niet veranderen. Publieke lezers krijgen uitsluitend de gepubliceerde projectie.
- Implementeer gedeelde polls/applaus met servergegevens als deze widgets zichtbaar worden opgeleverd. Neem geen demostemmen, fictieve prestaties of lokale aantallen over als echte activiteit. Redactionele communitymomenten mogen door beheer worden ingericht en blijven herkenbaar redactionele inhoud.

### Toernooiheader en widgetafbeelding

- Neem de bestaande hero-editor en afbeeldingspresentatie over. Ondersteun standaardbeeld, upload, veilige HTTPS-bron en geen afbeelding; instelbaar horizontaal/verticaal focuspunt en donkere overlay.
- Voeg **Uitstraling** toe aan het toernooiformulier en als afzonderlijke beheeractie voor bestaande toernooien. Een visuele wijziging aan een lopend toernooi mag bracket, uitslagen, planning, inschrijvingen of status niet wijzigen.
- Laat de toernooipagina zijn eigen hero gebruiken. Laat het lobbywidget kiezen tussen overnemen, eigen afbeelding of geen afbeelding. Een eigen override verandert de toernooihero niet.
- Geef uploads duurzame gedeelde opslag en mediagegevens volgens de bestaande architectuur. Gebruik geen base64 in platformsettings of browseropslag als productie-opslag. Beperk en valideer uploads serverzijdig, beheer referenties en behoud bestaande beelden bij fouten. Houd tekst leesbaar bij iedere ondersteunde uitsnede.
- Als externe HTTPS-beelden worden ondersteund: maak de URL-policy expliciet. Voer geen onbeperkte serverfetch naar door gebruikers gekozen adressen uit. Een mislukte afbeelding krijgt de ontworpen grafische fallback.

### Recente UI/UX behouden of afronden

Controleer eerst de huidige implementatie, want een groot deel hiervan is al aanwezig:

- Snelle zinnen in een popover achter het tekstwolkicoon direct rechts van de smiley, met ruim tekstveld en goede focus-/toetsafhandeling.
- Compacte kamer- en vriendenheaders, met ruimte tussen header en zoeken.
- Chat volgt nieuwe berichten wanneer de gebruiker onderaan staat; teruglezen blijft rustig, met een duidelijke terug-naar-nieuwste-actie.
- Binnenkomstmelding alleen kort boven de composer: vervangen bij volgende binnenkomst, na ongeveer twee seconden weg, niet permanent in chatgeschiedenis.
- Indicator stopt in de beurt van de tegenstander, ook na de derde pijl. Behoud de bestaande serverafgestemde timing; kopieer geen demotiming over actuele timingfixes.
- Eerste en tweede beurttijdoverschrijding geven een waarschuwing; de derde beëindigt het spel volgens de bestaande autoritatieve regel. Kamerinactiviteit pas na vijf minuten echte gebruikersinactiviteit.
- Numeriek zichtbaar gamenummer; interne IDs, referenties en chatidentiteiten blijven intact.
- Toeschouwer kan de echte wedstrijd volgen en in de toegestane spelchat praten, zonder speelacties of ongeautoriseerde toegang.
- Codeaanvraag en opnieuw aanvragen blijven geblokkeerd zolang de echte Turnstile-verificatie niet klaar is. Enter mag dit niet omzeilen; verlopen/foute tokens vergrendelen opnieuw. Afwijzing wegens ontbrekende captcha mag geen onnodige resendcooldown reserveren.

## 3. Integratiegrenzen

- Behoud echte Auth, bestaande rollen en eigenaarstoegang, serverautoriteit, realtimeverbindingen, wedstrijdherstel, moderatie en productieopslag. De browser is geen autoriteit voor uitslagen, timers, aanwezigheid of rechten.
- Behoud de productiemonorepo, CI, deploymentinfrastructuur en bestaande dependencykeuzes. Voeg alleen afhankelijkheden toe die aantoonbaar nodig zijn voor de gevraagde wijzigingen.
- Neem geen demo-gates, fakecaptcha, voorbeeldaccount, browserbeheerrechten, fictieve pollstanden of lokale store als gedeelde waarheid over.
- Scope widgets op onveranderlijke kamer-ID, nooit op kamernaam. Behoud bestaande IDs bij een naamwijziging en maak de migratie compatibel met bestaande data.
- Geef versieconflicten een zichtbare herstelbare toestand; overschrijf werk van een andere beheerder niet stilzwijgend. Publicatie is één atomaire, gevalideerde actie met audit door de echte actor.
- Laat lobby-/mediaverzoeken en adminupdates buiten het kritieke gooi- en renderpad. Behoud actuele timingcorrecties, scoregeometrie, anti-cheat en CI-grenzen. Verlaag geen testdrempels om een groen resultaat te krijgen.
- De voorbeelden voor endpoints/tabellen in `03-PLATFORMBEHEER.md` zijn ontwerphulp. Sluit aan op bestaande contracts en servicegrenzen in plaats van ze letterlijk als al bestaande API te behandelen.

## 4. Uitvoering en samenwerking

Werk met parallelle subagents waar taken onafhankelijk zijn: (1) lobby/mobile UI, (2) beheer/editor, (3) persistente contracten/media, (4) review/QA. Geef ieder een begrensd bestandsgebied en één integratieverantwoordelijke. Deel eerst de types en opslagcontracten om conflicterende implementaties te voorkomen.

Aanbevolen volgorde:

1. Actuele repo en nieuwe bron vergelijken; bestaande werkende gedragscode markeren.
2. Getypeerde contracten, permissies en compatibele migraties voorbereiden.
3. Centrale concept-/publicatiedata en mediakoppeling implementeren.
4. Beheer, preview en toernooi-uitstraling aansluiten.
5. Lobbygrid en mobiele 90%/60%-interacties integreren.
6. Recente chat/auth/spelgedragwijzigingen alleen aanpassen waar vergelijking of tests een concreet gat tonen.
7. Acceptatie en visuele vergelijking uitvoeren met dezelfde fixtures en viewports; fouten oplossen.

## 5. Bewijs en oplevering

- Gebruik `04-ACCEPTATIE-EN-QA.md` en de actuele verplichte repogates. Draai betekenisvolle unit-/integratietests en browserflows; voeg regressietests toe voor de nieuwe publicatie-, scope-, afbeelding- en mobilecontextregels.
- Leg doelcommit, migraties, exact uitgevoerde commando's, uitslagen, fixtures en browser-/viewportbewijs vast. Pakketbronchecks bewijzen geen productie-integratie of stagingacceptatie.
- Controleer met twee browsers/gebruikers dat publicatie en mediabeelden gedeeld zijn, en met twee beheerders dat conflicten niet stil worden overschreven.
- Controleer dat een hero-update tijdens een lopend toernooi uitsluitend de presentatie verandert. Controleer dat het openen van chat/lobbybeheer geen actieve partij reset.
- Houd de bestaande timing-/renderacceptatie in stand. Een gewone screenshot of DOM-meting is geen vervanging voor het voorgeschreven timingbewijs.
- Commit de afgeronde, gecontroleerde wijzigingen en push via de afgesproken repoflow. Gebruik de bestaande staging-deploymentflow wanneer die voor deze uitvoering geautoriseerd is. Een push naar `main` deployt volgens de gelezen workflow niet vanzelf: de bestaande deployworkflow triggert op `staging` en `production`. Respecteer branch- en environmentgates en meld een concreet blokkerend resultaat.
- Deze overdracht is op zichzelf geen nieuwe opdracht om productie te deployen. Volg voor een productierelease de geldende expliciete autorisatie in de uitvoerende sessie.
- Lever een korte changelog, mapping van bron naar productiebestanden, testbewijs, migratie-/terugvalinstructies, commit/PR en eventuele staging-URL op. Beschrijf ontbrekende verificatie eerlijk; presenteer een niet-uitgevoerde flow niet als getest.

Ga door tot de gevraagde UI én de noodzakelijke beheer/data-integratie af zijn. Vraag alleen om ontbrekende informatie wanneer die niet uit de actuele repo, dit pakket of de sessie kan worden vastgesteld en de implementatie werkelijk blokkeert.
