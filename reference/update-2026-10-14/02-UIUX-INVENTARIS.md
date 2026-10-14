# DartsPoint — UI/UX-inventaris voor de implementatie

Bron: het Sites-prototype op commit `6d473a3de23835494e238b6428cd3d5c15f240dd`, gecontroleerd op 14 oktober 2026. Alle bestandspaden hieronder zijn relatief aan de hoofdmap van die broncode. De lokale bron stond tijdens deze inventarisatie in `/workspace/sites/dartspoint-afterhours-studio`.

Deze inventaris beschrijft de grafische uitwerking en interacties die in deze sessie zijn toegevoegd of aangepast. De broncode is de referentie voor componentopbouw, kleuren, afstanden, typografie, responsive gedrag en animatie. De productie-implementatie moet dezelfde schermen en toestanden tonen en de lokale demogegevens vervangen door de bestaande, bevoegde productiediensten.

`docs/DARTSPOINT-UI-SYNC-2026-10-14.md` beschrijft de eerdere UI-sync met productiecommit `01e24733057737158e6749aba591c10f891ac2c2`. Dat document dekt chat, compactere headers, spelmeldingen, gamenummers, toeschouwen en login. Deze inventaris bevat daarnaast het actuele lobbybeheer, de mobiele paneelhoogten en de hero-afbeeldingen op de hierboven genoemde prototypecommit. De genoemde oude productiecommit is geen verklaring over de huidige stand van de productierepo.

## 1. Schermen en routes

Prototypebasis: `https://dartspoint-afterhours-studio.dgwebserv.chatgpt.site`.

| Route | Wat hier te bekijken is | Bron |
| --- | --- | --- |
| `/demo` | Directe ingang naar het kameroverzicht met het voorbeeldprofiel; ga vervolgens een kamer binnen om de kamerfeed te bekijken. | `app/demo/page.tsx`, `components/darts-prototype-entry.tsx`, `components/darts-lobby.tsx` |
| `/lobby` | Kameroverzicht, toegang tot kamers en gepubliceerde events; melding na inactiviteit. | `app/lobby/page.tsx`, `components/darts-lobby.tsx` |
| `/spelen` | De daadwerkelijke kamer: links clubhuisfeed of spel, met de sociale indeling ernaast/op mobiel in panelen. De kamerkeuze wordt in de demo doorgegeven via de sessie. | `app/spelen/page.tsx`, `components/darts-app.tsx` |
| `/demo/beheer?tab=lobby` | Directe demonstratie van **Lobby & widgets** zonder de voorbeeldlogin eerst te doorlopen. | `app/demo/beheer/page.tsx` |
| `/beheer?tab=lobby` | Centrale widgetinrichting, artikelen en voorbeeld. | `app/beheer/page.tsx`, `components/admin/darts-admin.tsx`, `components/admin/darts-lobby-content.tsx` |
| `/beheer?tab=lobby&kamer=<kamer-id>` | Hetzelfde centrale beheer, geopend op de voorbeeldtab voor de opgegeven kamer. Het betreft een stabiele kamer-ID, geen kamernaam. | Dezelfde bestanden plus `lib/darts-admin-operations.ts` |
| `/beheer?tab=rooms` | Kamerbeheer met per kamer de link **Lobbywidgets**. | `components/admin/darts-operations.tsx` |
| `/beheer?tab=tournaments` | Bestaand toernooibeheer, uitgebreid met hero-inrichting. | `components/admin/darts-tournaments.tsx` |
| `/beheer?tab=tournaments&toernooi=<toernooi-id>` | Open één toernooi; kies **Uitstraling**. Ook bruikbaar onder `/demo/beheer` met dezelfde queryparameters. | `app/beheer/page.tsx`, `app/demo/beheer/page.tsx` |
| `/toernooi/<toernooi-id>` | Toernooikamer met gedeelde hero-afbeelding, deelnemers, borden, bracket en spelregels. | `app/toernooi/[id]/page.tsx`, `components/darts-tournament-room.tsx` |
| `/inloggen` en `/registreren` | E-mail → verificatie → democode → eventueel spelersnaam → gereed. | `components/darts-login.tsx`, `components/darts-registration.tsx` |
| `/oefenen?uitdaging=1` | Bestemming van de weekchallenge. | `app/oefenen/page.tsx`, `components/darts-practice.tsx` |
| `/divisies` | Bestemming van de divisiewidget en link vanuit de ladder. | `app/divisies/page.tsx` |

De `/demo`-routes starten uitsluitend de lokale prototypesessie. `DemoGate` en `DartsPrototypeEntry` zijn geen productie-authenticatie of autorisatie. Neem de schermen over, maar gebruik in productie de bestaande sessie- en rechtencontrole.

## 2. Ruimtelijke indeling en visuele basis

De kamer heeft op desktop vanaf **1100 px** twee even brede hoofdhelften. De linkerhelft toont het clubhuis wanneer `!game.ready && !game.preparing`; bij voorbereiding of een gestarte wedstrijd staat hier het spel. Dit wisselt de inhoud van dezelfde helft en verandert de sociale indeling rechts niet.

Rechts staan bovenaan spelers en vrienden naast elkaar; daaronder blijft de chat aanwezig. De prototypebron gebruikt voor de bovenste twee kolommen een verhouding `1.55fr : 1fr` en voor boven/onder `1.08fr : 1fr`. Maak er geen volledige chatpagina van wanneer iemand alleen een kamer binnenkomt.

**Bestaand productiecontract behouden:** de actuele productiecanon gebruikt een breakpoint van **1024 px** en een **50/50-verdeling** voor spelers/vrienden rechtsboven. Dit verschilt van de prototypebron met **1100 px** en **1.55fr : 1fr**. Deze bronwaarden zijn geen opdracht om de bestaande productielayout terug te zetten. Pas de nieuwe mobiele 90%/60%-regel toe op de bestaande mobiele variant van productie en laat de huidige desktopindeling intact. Een eventuele harmonisatie van het breakpoint moet een bewuste, afzonderlijk beoordeelde keuze zijn. Kopieer dus niet ongericht het volledige stylesheet over de actuele productielayout.

De kamer- en vriendenheaders zijn compact: in de desktop-CSS minimaal 46 px, met de labels hoger in de container. De zoekvelden krijgen afzonderlijke ruimte onder de header. Deze aanpassing staat in `components/darts-desktop.css`, waaronder de selectors `.dp-desktop-room-toolbar`, `.community-heading`, `.players-toolbar` en `.friends-search`.

De bestaande vormgeving gebruikt diepe groentinten, subtiele lijnen en schaduwen, licht saliegroene tekst, crème actieknoppen en warme koraalaccenten. Algemene tekst is Manrope; scoretypografie gebruikt Barlow Condensed. De imports staan in `app/layout.tsx`. Gebruik de bestaande iconen en merkbestanden, waaronder `public/brand/icon.svg`, en behoud focusstijlen, afgeronde containers en verminderde-bewegingstoestanden.

Kernbestanden: `components/darts-app.tsx`, `components/darts-app.css`, `components/darts-desktop.css`, `components/darts-play-shell.css`, `components/darts-room-feed.tsx`, `components/darts-room-feed.css`.

## 3. Clubhuisfeed in de kamer

De feed heeft een instelbare bovenregel en begroeting, gevolgd door de actuele kamernaam en het aantal spelers. Voor de voorbeeldeigenaar staat rechts de compacte link **Inrichten**, naar lobbybeheer met de huidige kamer-ID. De bron bepaalt dit via de lokale rol van voorbeeldspeler Nick; productie moet hiervoor de echte beheerdersrechten gebruiken.

De content staat in één gridcontainer met de filters **Ontdekken**, **Toernooien**, **Community** en **Nieuws**. Standaard zijn er twee kolommen; brede widgets beslaan beide. Op smalle schermen en in de smalle beheervoorvertoning wordt dit één kolom. De bron gebruikt hiervoor zowel responsive CSS als een containerquery. Widgets volgen hun opgeslagen volgorde, zichtbaarheid en kamerselectie; er worden geen extra ongeconfigureerde voorbeeldkaarten aan toegevoegd.

| Widget | Weergave, gegevens en interactie |
| --- | --- |
| Aankondiging | Keuze tussen de actieve platformaankondiging en eigen widgettekst. **Platformbron uit betekent dat de widget verborgen blijft**; er verschijnt geen vervangende welkomsttekst. Een eigen tekst is geschikt voor een permanente of kamerspecifieke boodschap. Een bezoeker kan de huidige aankondiging wegklikken. Een onderhoudsbericht blijft een zelfstandig blok buiten het configureerbare grid. |
| Uitgelicht toernooi | Automatische keuze uit gepubliceerde toernooien met status inschrijving/check-in/live, of één gekozen toernooi-ID. Automatisch kiest de huidige bron eerst een toernooi met open inschrijving, anders het eerste beschikbare item uit die selectie. Titel en omschrijving mogen de toernooigegevens overschrijven. Toon deelname, starttijd, inschrijfstatus en spelvorm; de primaire CTA opent rechtstreeks `/toernooi/<id>`. |
| Spelers in de kamer | Uitnodigende kaart met instelbare tekst. De actie **Zoek een speler** opent de spelerslijst van de huidige kamer; op desktop krijgt het zoekveld focus. |
| Weekchallenge | De actuele challenge en persoonlijke geraakte dubbels komen uit `usePracticeProgress`. Toon doelen, vinkjes, voortgang en teller. Titel, uitleg en knoptekst zijn configureerbaar; de standaard-CTA opent de oefenchallenge. |
| Communitymoment | Instelbare speler, score/prestatie, label, titel, tekst en startaantal applaus. Spelersnaam opent het profiel; applaus is omschakelbaar en lokaal per widget-ID opgeslagen. |
| Nieuws & updates | Centrale artikelen, eventueel beperkt tot geselecteerde artikel-ID’s. Alleen zichtbare/gepubliceerde artikelen worden getoond. De rij opent een dialoog met titel, intro, alinea’s en optionele interne CTA. Geen HTML-injectie of rich-textuitvoering: tekst wordt als React-tekst weergegeven. |
| Communitypoll | Instelbare vraag en twee tot vijf antwoorden. Na kiezen verschijnen percentagebalken; de stem kan worden ingetrokken. De lokale stem is gekoppeld aan widget-ID én de volledige antwoordenset, zodat gewijzigde opties een nieuwe poll vormen. |
| Divisies | Instelbare kop, uitleg en knoptekst, met de bestaande divisiepresentatie en CTA naar het divisieoverzicht. |

Voor de filterindeling vallen toernooiwidgets onder **Toernooien**, aankondigingen en nieuws onder **Nieuws**, en de overige widgets onder **Community**. **Ontdekken** toont alle beschikbare widgets.

Lege en fouttoestanden horen bij het ontwerp:

- Als een kamer of filter geen zichtbare widgets heeft, verschijnt een rustige lege toestand met uitleg; vanuit een leeg filter kan de bezoeker **Bekijk alles** kiezen.
- Een gekozen toernooi dat niet meer beschikbaar/gepubliceerd is, wordt niet stilzwijgend vervangen door een ander toernooi. De kaart geeft aan dat er nog geen beschikbaar toernooi is en biedt het kalenderoverzicht.
- Een nieuwsblok zonder zichtbare artikelen toont een eigen lege toestand.
- De body van een artikel wordt op nieuwe regels verdeeld in alinea’s. Interne CTA’s worden gevalideerd; externe of onveilige bestemmingen worden niet als contentlink overgenomen.
- Nieuwe of aangepaste inhoud in een concept verschijnt pas in de live feed na publicatie. De uitzondering is brondata die zelfstandig wordt beheerd, zoals een actieve platformaankondiging of de opgeslagen uitstraling van een gekoppeld toernooi.

Bronnen: `components/darts-room-feed.tsx/.css`, `lib/darts-lobby-content.ts`, `lib/darts-admin-settings.ts`, `lib/darts-tournament-store.ts`, `lib/darts-tournament-model.ts`, `components/darts-practice.tsx`.

## 4. Platformbeheer: één inrichting, kamerspecifieke widgets

Er is **één centrale lobbylayout**, geen afzonderlijke kopie van de hele lobby per kamer. Elke widget heeft een stabiele ID, type, ingeschakeld/uitgeschakeld, halve/volle breedte en doelgroep `all` of `rooms` met stabiele kamer-ID’s. Dezelfde widget kan dus overal of in een selectie kamers verschijnen. De kamercontext levert automatisch kamernaam, spelersaantal en spelerslijst.

Toegangspunten: **Lobby & widgets** in de beheernavigatie, **Lobby inrichten** bij de snelle acties, **Lobbywidgets** op een kamerkaart, en **Inrichten** in de kamerfeed voor de voorbeeldeigenaar.

De tabbladen zijn visueel onderdeel van hun container:

1. **Widgets**: begroeting en bovenregel wijzigen; widgetkiezer; lijst met type, breedte, doelgroep en status; in/uitschakelen; verplaatsen met omhoog/omlaag; dupliceren; verwijderen met bevestiging; inhoudsformulier per type. Het huidige prototype gebruikt volgordeknoppen, geen drag-and-drop.
2. **Nieuws & updates**: artikelen aanmaken, selecteren, bewerken en verwijderen. Velden: titel, soort Nieuws/Productupdate/Uitleg & tips, zichtbaarheid, korte intro, volledige tekst, optionele knoptekst en interne bestemming.
3. **Voorbeeld**: kamer kiezen; huidig concept of gepubliceerde versie; desktop- of mobiele breedte. Dezelfde `RoomLobbyFeed` rendert het voorbeeld, geen aparte namaakweergave.

De beheervoorvertoning mag de live pollstem of het live applaus niet veranderen. Klikken op een navigerende CTA geeft in het voorbeeld uitleg zonder de beheerder weg te navigeren. Artikelen kunnen wel in hun echte dialoog worden geopend. Het aantal ingestelde widgets kan hoger zijn dan het aantal feitelijk zichtbare blokken, bijvoorbeeld doordat een platformaankondiging uitstaat.

Onderin staat een vaste actiebalk met **Concept opslaan**, **Publiceren**, bewaarstatus en tijdstip. Concept bewaren verandert alleen het concept. Publiceren valideert de inhoud, schrijft concept én gepubliceerde versie en verhoogt de revisie. De gepubliceerde feed blijft intact wanneer bewaren mislukt. Concept/publicatie worden aan het beheerderslogboek toegevoegd.

Bij interne navigatie weg van lobbybeheer probeert de bron eerst het gewijzigde concept op te slaan; een bewaarprobleem houdt de gebruiker op de pagina met een foutmelding. Bij verversen/verlaten met onbewaarde wijzigingen is er een browserwaarschuwing. Bewaren/publiceren is tijdelijk geblokkeerd tijdens het verwerken van een hero-upload.

Aanvullende toestanden:

- Kamerselectie zonder geselecteerde kamer wordt bij publicatie afgekeurd voor een actieve widget.
- Niet meer bestaande kamer-ID’s worden zichtbaar als verwijderde kamer; **Selectie opschonen** verwijdert die verwijzingen.
- Verwijderen van een artikel werkt de nieuwsselecties bij. Een nieuws-widget die uitsluitend dat artikel gebruikte, wordt uitgeschakeld; hij mag niet plotseling alle artikelen tonen.
- Een lege widget- of artikellijst krijgt een gerichte aanmaakactie.
- Publicatie vereist geldige titels/inhoud voor actieve zichtbare onderdelen, geldige interne links en twee tot vijf verschillende pollopties.
- Lokale opslag die uitstaat of volloopt levert een expliciete fout op; er wordt geen valse succesmelding gegeven.

Bronnen: `components/admin/darts-lobby-content.tsx/.css`, `components/admin/darts-admin.tsx`, `components/admin/darts-operations.tsx`, `lib/darts-lobby-content.ts`.

## 5. Hero-afbeeldingen bij toernooien en lobbywidgets

Het beeldmodel is `HeroImage = { src, positionX, positionY, overlay }`. De standaardfoto is `public/marketing/afterhours-hero.webp`, met positie 70% horizontaal/50% verticaal en 45% verduistering. Een oude toernooi-instelling zonder hero krijgt die standaardfoto; een expliciete lege bron behoudt de grafische stijl zonder foto.

De volledige hero-achtergrond wordt zowel op de toernooipagina als in de uitgelichte lobbykaart gebruikt. De foto gebruikt `object-fit: cover` en instelbare `object-position`. Een vaste donkere tekstgradient blijft gecombineerd met de instelbare verduistering, zodat de tekst ook op een lichte foto leesbaar blijft. De decoratieve trofee verdwijnt pas nadat de foto succesvol is geladen. Bij een lege of onbruikbare bron of een laadfout blijft de oorspronkelijke grafische presentatie zichtbaar; geen kapot afbeeldingsicoon.

**Toernooibeheer:** stap vier **Uitstraling** in aanmaken/bewerken, en een aparte tab **Uitstraling** op een bestaand toernooi. Ook tijdens een lopend toernooi kan de afbeelding worden aangepast. De afzonderlijke actie **Uitstraling opslaan** wijzigt de hero zonder deelnemers, bracket, borden of uitslagen opnieuw in te delen. Een knop zet onbewaarde beeldwijzigingen terug. Een toernooi aanmaken/bewaren publiceert het niet automatisch.

**Lobbywidget:** drie beeldmodi: hero van het toernooi overnemen, eigen afbeelding voor deze widget, of zonder afbeelding/grafische stijl. Overnemen volgt foto, uitsnede en verduistering van het gekoppelde toernooi. Een eigen widgetfoto wijzigt de toernooihero niet. De beeldkeuze geldt voor alle kamers die deze widget zien.

De gedeelde beeldeditor bevat:

- **DartsPoint-foto**, **Eigen foto**, **Afbeeldingslink**, en waar toegestaan **Zonder foto**.
- Upload van PNG/JPG/WebP, maximaal 8 MB; controle op bruikbaar formaat en maximaal 50 megapixels. De browser verkleint/comprimeert voor de lokale demo. Het huidige beeldmodel accepteert een bron tot 300.000 tekens.
- Een volledige HTTPS-afbeeldingslink met **Gebruik foto**. De link wordt gecontroleerd en geladen voordat hij wordt geselecteerd. Geen URL met ingebouwde gebruikersnaam/wachtwoord.
- Voorbeeld van de foto onder echte tekst/overlay, sliders voor horizontale en verticale positie 0–100%, en verduistering 25–85%.
- **Herstellen** voor standaard uitsnede/verduistering; voortgang tijdens upload/linkcontrole; feedback voor verwerkt, geselecteerd, te groot, ongeldig formaat, onbereikbaar of niet te tonen.
- Tijdens verwerking blijven bewaren/publiceren geblokkeerd. Een bestand selecteren is nog geen publicatie.

Bronnen: `lib/darts-hero-image.ts`, `components/admin/darts-hero-editor.tsx/.css`, `components/darts-hero-background.tsx/.css`, `components/admin/darts-tournaments.tsx`, `components/admin/darts-tournaments.css`, `lib/darts-tournament-model.ts`, `lib/darts-tournament-store.ts`, `components/darts-tournament-room.tsx/.css` en de lobbyfeed/-editor.

## 6. Chat, binnenkomst en toeschouwen

De chat behoudt de volgorde **Spelchat**, **Kamerchat**, daarna privégesprekken. Zonder actieve wedstrijd is Spelchat uitgeschakeld en wordt Kamerchat gebruikt. De composer heeft direct naast de smiley een **tekstwolk-icoon** voor snelle zinnen, gevolgd door de ruime tekstinvoer en verzendactie. De vooraf ingestelde zinnen staan niet meer permanent als rij onder het invoerveld.

De tekstwolk opent een popover boven de composer. Keuze van een zin verstuurt direct, sluit de overlay en herstelt invoerfocus. De emoji- en snelle-zinnenpopovers worden niet tegelijk opengehouden. Enter/spatie in de chat mogen geen spelactie laten doorsijpelen.

Autoscroll volgt de onderkant bij nieuwe berichten, eigen verzending, kanaalwissel en relevante formaatwijzigingen. Zodra iemand terugleest, wordt die leespositie gerespecteerd. Een knop met het aantal nieuwe berichten brengt de gebruiker terug naar onderaan. De bestaande rustige-beurtoptie bewaart inkomende berichten en toont ze na de eigen beurt met feedback.

Binnenkomst is een tijdelijke melding **“USERNAME komt de kamer binnen”**, vlak boven het tekstveld. Zij fade-in/fade-out en verdwijnt na twee seconden. Een nieuwe binnenkomst vervangt de vorige melding. Deze gebeurtenis wordt niet als blijvende chatregel opgeslagen en wordt niet in privé- of toeschouwerschat getoond.

Toeschouwen opent de dialoog **Langs de oche** met dartbord, actuele voorbeeldscores, beurtindicator, laatste worp, numeriek gamenummer, eigen spelchat en wachtrij. De toeschouwer kan chatten maar heeft geen werpbediening. De eigen wedstrijd en chat blijven bewaard; de terugknop noemt de eigen wedstrijd of kamer. Een extern voorbeeldspel heeft een afzonderlijke lokale simulatie. Bij meekijken naar de eigen lopende partij wordt de gekoppelde spelstand gebruikt.

Behoud lege privéchat, geblokkeerd/gedempt gesprek, moderatiemeldingen, disabled composer waar toepasselijk en lege worpgeschiedenis. De chat bevat lokale voorbeeldantwoorden; dit is geen bewijs van een externe multiplayerverbinding.

Bronnen: `components/darts-community.tsx/.css`, `lib/darts-chat-state.ts`, `components/darts-spectator.tsx/.css`, `components/darts-social-tools.tsx`, `components/darts-app.tsx`.

## 7. Mobiel: exact 90% in de kamerlobby, 60% in-game

Onder 1100 px staan in de **prototypebron** **Clubhuis/Spelen**, **Kamer**, **Chat**, **Ladder** en **Profiel** in de bottomnav. De eerste knop volgt de huidige hoofdinhoud. Voor productie blijft de bestaande 1024-px-grens leidend, tenzij die expliciet wordt geharmoniseerd; de gevraagde verandering betreft de paneelhoogte per toestand, geen nieuwe desktopgrens.

| Context | Panelen | Hoogte en positie |
| --- | --- | --- |
| In een kamer, met de clubhuisfeed zichtbaar | Kamer, Chat, Ladder | **90% van de actuele visuele viewport**, beginnend op 10% vanaf boven. |
| Tijdens spel/voorbereiding | Kamer, Chat, Ladder | **60% van de actuele visuele viewport**, beginnend op 40% vanaf boven, zodat de gameplay erboven zichtbaar blijft. |
| Overige sociale panelen | Onder meer profiel/vrienden/events | Bestaande basishoogte; de specifieke 90%-uitzondering geldt alleen voor Kamer, Chat en Ladder in de kamerlobby. |
| Desktop vanaf 1100 px in de prototypebron; vanaf 1024 px volgens het huidige productiecontract | Vast sociaal werkvlak | De mobiele 90%-regel is hier niet van toepassing; bestaande productie-indeling behouden. |

De bron gebruikt `window.visualViewport` en CSS-variabelen voor hoogte/topoffset. Daardoor verschuift de berekening mee wanneer een mobiel toetsenbord opent. Safe-area-insets en de bottomnavhoogte blijven in de paneelpadding verwerkt. Bij een korte viewport worden secundaire teksten compacter of verborgen; de composer en sluitknop blijven bereikbaar. Openen focust de sluitknop; sluiten herstelt focus naar de hoofdknop/het spelvlak. Er wordt geen nieuwe aparte fullscreen-chatroute gebruikt.

Bronnen: `components/darts-app.tsx` (`showClubhouse`, `expandedLobbyPanel`, viewport-effect), `components/darts-play-shell.css` (`.dp-social-sheet`, `.dp-social-sheet-room-lobby`, `.dp-short-viewport`), `components/ui/sheet.tsx`.

## 8. Spelindicator, waarschuwingen, inactiviteit en gamenummers

De richtindicator beweegt alleen tijdens de eigen horizontale of verticale timingfase. Tijdens de tegenstandersbeurt, na de derde pijl en tijdens een worp/verbindingstoestand mag hij niet doorlopen. De bron gebruikt heen-en-weerperioden van **2037 ms horizontaal** en **2315 ms verticaal**.

De zichtbare beurtteller start in de lokale demo op **30 seconden** tijdens de eigen timing. De eerste verlopen tijd toont **Eerste time-outwaarschuwing** en een nieuwe beurttijd; de tweede toont **Tweede time-outwaarschuwing** en expliciet dat de volgende time-out verlies betekent. Pas de derde maakt de tegenstander winnaar en opent het passende eindscherm. Een geldige stop/werpactie wist de lokale waarschuwingenteller. Waarschuwingen zijn sluitbaar; het sluiten is geen gebruikersactie die de wedstrijd automatisch gewonnen/verloren maakt. In het wedstrijdmenu staat **Voorbeeld beurttijdmelding** om deze UX te bekijken.

Het wedstrijdmenu toont ook numerieke **Game #…**, worpgeschiedenis en de bestaande verbindingsherstel-demo. De einddialoog onderscheidt timeout, gewone uitslag en opgave; behoud score, statistieken, revanche en terugkeer. De bestaande verbindingsherstelperiode is een andere UX dan de beurttijd; deze inventaris verandert die niet.

Na **vijf minuten zonder gebruikersactiviteit in de kamer** navigeert de demo naar `/lobby?melding=inactief` en toont daar uitleg. Pointerdown, toetsen, wielscrollen en touchmove tellen als activiteit. Binnenkomende berichten en animatie niet. Terugkeer naar een achtergrondtab controleert de verstreken tijd. De huidige hook verwijdert de lokale kamerselectie; productie moet het serverzijdige kamervertrek en eventuele spelgevolgen via de bestaande regels afhandelen.

Nieuwe demowedstrijden krijgen een oplopend numeriek ID. Bestaande opgeslagen hashes kunnen een numeriek zichtbaar label krijgen zonder hun interne chat/opslagidentiteit te wijzigen. Maak productie-identiteit, autorisatie en het zichtbare gamenummer daarom niet afhankelijk van een korte weergavehash.

Bronnen: `components/darts-game.tsx`, `lib/darts-game-state.ts`, `components/darts-match-experience.tsx/.css`, `lib/darts-game-number.ts`, `hooks/use-room-idle.ts`, `components/darts-lobby.tsx`.

## 9. Login en verificatie

De aanvraagknop **Ontvang je inlogcode** blijft uitgeschakeld tot de zichtbare verificatie is voltooid. De lokale widget toont achtereenvolgens **Ik ben een mens**, **Even controleren…** en **Verificatie voltooid**. De demo controleert dit zowel in de knopstatus als in de verzendfunctie; een voortijdige klik verbruikt geen codeaanvraag en start geen nieuwe wachttijd.

Een geslaagde aanvraag verbruikt de lokale verificatie. Een nieuwe code aanvragen vereist opnieuw verificatie; na twee minuten vervalt een nog ongebruikte lokale verificatiestatus. De voorbeeldcontrole duurt 750 ms. Dit zijn demonstratiestaten, geen Turnstile-token of servercontrole.

Behouden toestanden: ongeldig e-mailadres, wachten op opnieuw aanvragen, zes cijfers, onjuiste/verlopen code, maximaal aantal pogingen, spelersnaamkeuze voor een nieuw profiel, terugkerend lokaal profiel en gereed. De democode is tien minuten geldig; opnieuw aanvragen heeft een wachttijd van zestig seconden; vijf onjuiste pogingen blokkeren die challenge. De voorbeeldmail kan in een gestylede dialoog worden geopend en de code kan worden gekopieerd. Er wordt geen echte mail verzonden.

De link **Alleen het prototype bekijken?** geeft toegang tot `/demo`. Behoud werkende navigatie en de bestaande veilige bestemming na login. De huidige `demoLoginDestination` accepteert bekende interne spelroutes/toernooipaden en valt anders terug op `/lobby`.

Bronnen: `components/darts-login.tsx`, `components/darts-login.css`, `components/darts-registration.tsx`, `components/darts-registration.css`, `lib/darts-demo-auth.ts`, `lib/darts-login-destination.ts`, `lib/darts-session.ts`, `components/darts-demo-gate.tsx` en de bestaande mailrenderer.

## 10. Wat in productie echt gekoppeld moet worden

| Prototypeonderdeel | Vereiste productieaansluiting met behoud van deze UX |
| --- | --- |
| Eén lokaal lobbyconcept en publicatie | Persistente centrale layout, artikelen, revisie, publicatie en autorisatie; servervalidatie, gelijktijdig bewerken en audit. Gepubliceerde inhoud moet voor alle bevoegde bezoekers consistent zijn. |
| Kamer-ID’s en voorbeeldtellingen | Bestaand kamerbeheer en actuele presence. Verwijderde/gesloten kamers en toegangsrechten blijven gecontroleerd. |
| Toernooi- en divisiewidgets | Bestaande publicatiestatus, planning, deelname, beschikbare plekken en routes. Geen tweede parallel toernooi- of divisiesysteem. |
| Lokale hero-upload/data-URL | Bestaande of aan te leggen mediaopslag, veilige uploadverwerking en duurzame assetreferentie. Behoud preview, uitsnede, verduistering, bewaarfeedback en foutfallback. |
| Lokale pollstem/applaus | Geauthenticeerde serveracties, consistente tellingen en een expliciete pollversie bij gewijzigde opties. Beheervoorbeeld blijft zonder live bijwerkingen. |
| Lokale chat en binnenkomst | Echte room/match/private-kanalen, leespositie en realtime gebeurtenissen. Binnenkomst blijft een tijdelijke gebeurtenis boven de composer. |
| Gesimuleerd toeschouwen | Bevoegde read-only wedstrijdstream plus deelname aan de matchchat; geen werprechten door toeschouwen. |
| Lokale timer en idle-hook | Autoritatieve serverregels voor beurtverloop, waarschuwingen, resultaat en kameractiviteit. Client toont dezelfde waarschuwingen en eindtoestanden. |
| Numeriek demogamenummer | Uniek, normaal leesbaar productienummer met behoud van interne veilige matchidentiteit. |
| Demo-verificatie en OTP | Werkelijke Turnstile-success/expiry/error, serververificatie vóór codeaanvraag, echte OTP-verzending en rate limiting. De knop blijft gesloten tot geldige verificatie. |
| Voorbeeldprofiel/owner Nick | Echte ingelogde gebruiker en bestaande rollen/rechten voor beheerlinks, pagina’s en mutaties. |

Lokale storage en voorbeelddata demonstreren interacties. Zij zijn geen te kopiëren productiebeveiliging, gedeelde database, mediaserver of multiplayertransport. Ook de aanwezige fair-play-demo moet niet zonder verdere controle als het productiesysteem worden beschouwd.

## 11. Controlepunten bij overname

1. Open `/demo`, ga een kamer binnen en controleer het desktopwerkvlak en de acht mogelijke widgettypen. Controleer de wissel tussen clubhuis en spel zonder de rechterindeling te verplaatsen.
2. Open **Inrichten**; voeg een widget toe voor één kamer, bewaar als concept en controleer dat de gepubliceerde feed nog gelijk is. Publiceer en controleer twee verschillende kamers.
3. Schakel alle widgets uit, verwijder een gekoppeld artikel, verberg een toernooi en zet de platformaankondiging uit. Controleer gerichte lege toestanden en dat geen onverwachte standaardinhoud terugkomt.
4. Bewerk een toernooihero, controleer overnemen in de widget, kies een eigen widgetfoto en daarna zonder foto. Controleer upload-/linkfouten, uitsnede, contrast en behoud van bracket/deelnemers bij uitsluitend een beeldwijziging.
5. Open nieuws en CTA’s in de beheerpreview; geef daar applaus/stem. Controleer dat het live bezoekgedrag en de opgeslagen live reactie niet wijzigen.
6. Controleer Kamer/Chat/Ladder op mobiel in de kamerlobby op 90%, in-game op 60%, met gesloten én geopend toetsenbord. Controleer de ongewijzigde desktopvariant.
7. Controleer chatpopovers, snel versturen, focus, autoscroll, teruglezen en nieuwe-berichtenknop. Laat twee spelers kort na elkaar binnenkomen en controleer vervanging/verdwijnen zonder blijvende chatregel.
8. Bekijk een spel als toeschouwer, chat en ga terug naar de eigen kamer/wedstrijd. Controleer dat de toeschouwer niet kan gooien.
9. Laat de eerste, tweede en derde beurttijd verlopen; controleer de verschillende meldingen en het eindscherm. Controleer de stilstaande indicator tijdens de tegenstandersbeurt en de vijfminuten-inactiviteitsmelding.
10. Controleer de codeaanvraag vóór, tijdens en na verificatie, opnieuw aanvragen en de verlopen verificatie. Vervang de demo-veiligheid door echte backendcontrole vóór productieacceptatie.

Deze inventaris is op de broncode gebaseerd. Er is hiervoor geen afzonderlijke visuele browsertest uitgevoerd. De overname moet op echte mobiele en desktopviewports visueel én met de productiegegevensstromen worden gecontroleerd.
