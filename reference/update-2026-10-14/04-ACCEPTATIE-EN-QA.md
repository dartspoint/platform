# Acceptatie en QA — DartsPoint

Bronreferentie: Sites-prototypecommit `6d473a3de23835494e238b6428cd3d5c15f240dd`.

Dit document beschrijft wat de ontvangende Codex moet aantonen bij de productie-implementatie. Het prototype is de grafische en interactieve referentie. Lokale demo-opslag, demo-identiteit, voorbeeldwedstrijden en gesimuleerde verificatie zijn geen bewijs van een werkende backend.

## 1. Prioriteiten en bewijs

| Prioriteit | Betekenis | Voorwaarde voor acceptatie |
|---|---|---|
| P0 | Toegang, privacy, gegevensverlies, wedstrijdintegriteit en gebroken hoofdflows | Alle gevallen slagen vóór staging voor gebruikers wordt vrijgegeven. |
| P1 | De gevraagde UI/UX en correcte koppeling met beheer | Alle gevallen slagen vóór deze sprint wordt geaccepteerd. |
| P2 | Randgevallen, toegankelijkheid en verdere verfijning | Afwijkingen alleen met concrete beschrijving, eigenaar en herstelafspraak. |

Leg per testcase vast: commit, omgeving, browser/apparaat, rol, uitgangssituatie, stappen, verwacht resultaat, feitelijk resultaat en bewijs. Gebruik schermafbeeldingen voor statische lay-out, korte opnamen voor beweging/scroll/focus en testuitvoer of relevante geredigeerde serverlogs voor backendgedrag. Een geslaagde build bewijst geen visuele overeenkomst. Een afbeelding bewijst geen autorisatie of realtime levering.

Gebruik minimaal drie gescheiden accounts/sessies: speler A, speler B en toeschouwer C. Voeg een platformbeheerder en een gewone speler zonder beheerrechten toe. Gebruik gescheiden browserprofielen of apparaten; meerdere tabs van dezelfde localStorage-demo gelden niet als multiplayerbewijs.

## 2. Schermen en referentiematen

| Weergave | Te controleren |
|---|---|
| Desktop 1440 × 900 en 1920 × 1080 | Kamer vóór/tijdens/na een partij; vaste linker- en rechterhelft; beheer en preview. |
| Laptop 1280 × 720 | Weinig verticale ruimte: spelerlijst, vriendenlijst, composer, knoppen en scrollgebieden bruikbaar. |
| Grenzen 1023/1024 én 1099/1100 px breed | Productie gebruikt 1024 px als bestaande grens, prototype 1100 px. Behoud de productiegrens tenzij de integratie bewust anders beslist; controleer op beide grenzen sprongen en open panelen. |
| Mobiel circa 360 × 800 en 390 × 844 | Kamerlobby, actief spel, alle drie bottomnav-sheets, profiel, toeschouwer en beheer. |
| Mobiel met toetsenbord, landscape en browserbalk zichtbaar/verborgen | Composer, closeknop en actieve invoer blijven bereikbaar; hoogte volgt de bruikbare viewport. |
| Android Chrome/Samsung Internet en iOS Safari | Echte touch-, toetsenbord- en safe-area-controle. Desktopemulatie alleen is onvoldoende. |

Deze maten zijn testvensters, geen opdracht om vaste pixelafmetingen in de layout te programmeren. Gebruik dezelfde assets, fonts, kleuren, componenten en CSS uit de referentie. Vergelijk per toestand; een lobby-screenshot naast een game-screenshot is geen bruikbare vergelijking.

## 3. P0 — werkende toegang en gegevensintegriteit

| ID | Teststappen | Verwacht resultaat |
|---|---|---|
| P0-01 Hoofdroute | Open homepage, gebruik menu/CTA naar lobby, kies een kamer en herlaad daar. Herhaal met directe toegestane links en browser terug/vooruit. | Geen dode links of redirectlus; gekozen kamer en sessiestatus worden correct hersteld. Behoud `/demo` in productie alleen als die daar al bewust en afgeschermd is ingericht; anders hoort deze route uitsluitend bij de bronpreview en wordt hij niet toegevoegd. |
| P0-02 Beheerautorisatie | Probeer als gewone speler `/beheer`, de beheer-API en een publicatieverzoek rechtstreeks. Wijzig ook lokale rolvelden/naam naar `Nick`. | Geen lees- of schrijfrechten door clientmanipulatie. Server controleert de geauthenticeerde actor en zijn bevoegdheid. |
| P0-03 Conceptisolatie | Wijzig titel, widgetvolgorde, artikel en afbeelding; sla concept op. Lees de lobby én bootstrap/API-response met een ander spelersaccount. | Spelers zien uitsluitend de laatst gepubliceerde versie; conceptdata ontbreekt ook in de response. Concepten zijn alleen voor bevoegde beheerders zichtbaar. |
| P0-04 Publicatie | Publiceer een geldig concept en lees meerdere kamers met andere accounts. Herhaal een identiek verzoek en simuleer een verbroken verbinding tijdens opslaan. | Eén consistente publicatie, herleidbare revisie/audit en duidelijke succes- of foutstatus. Geen halve combinatie van oude tekst, nieuwe widgets en ontbrekende media. |
| P0-05 Gelijktijdig beheer | Open dezelfde revisie met twee beheerders. Beheerder A publiceert; B probeert daarna zijn oudere concept te publiceren. | Geen stille overschrijving van A. Toon een versieconflict of laat expliciet herladen/vergelijken. Het prototype lost dit productieconflict niet op. |
| P0-06 Fout bij opslag | Forceer een fout bij media-upload, database-save en publicatie. | De bestaande gepubliceerde lobby en toernooigegevens blijven bruikbaar. Geen succesmelding voor een niet opgeslagen wijziging; invoer blijft herstelbaar. |
| P0-07 Media tijdens live partij | Wijzig uitsluitend de hero van een live toernooi met reeds gespeelde wedstrijden en toegewezen borden. | Alleen presentatie/audit verandert. Scores, deelnemers, winnaar, bracketstructuur, turnstatus en bordtoewijzingen blijven gelijk. |
| P0-08 Herladen en reconnect | Herlaad speler A en C tijdens dezelfde wedstrijd; onderbreek hun verbinding kort en herstel. | Beide ontvangen dezelfde gezaghebbende wedstrijdstatus. Geen dubbele worp, gemiste uitslag, nieuwe fictieve wedstrijd of dubbel verstuurd chatbericht. |
| P0-09 Kamer- en chatgrenzen | Vraag als C berichten/status op van een niet toegestane kamer, privégesprek en besloten wedstrijd door ids te veranderen. | Server weigert lezen, abonneren en schrijven zonder toestemming. Zichtbaarheid van een widget is geen toegangsrecht tot de achterliggende wedstrijd. |
| P0-10 Migratie | Migreer bestaande toernooien zonder `hero`, bestaande lobbyconfiguratie zonder afbeeldingsmodus en eerder opgeslagen wedstrijdrecords. | Bestaande ids, relaties, scores en inhoud blijven behouden. Ontbrekende hero krijgt de afgesproken standaard; expliciet geen afbeelding blijft geen afbeelding. |

## 4. P1 — desktopkamer en mobiele panelen

| ID | Teststappen | Verwacht resultaat |
|---|---|---|
| UI-01 Vaste desktopindeling | Open een kamer zonder actief spel en start vervolgens een partij. | Links clubhuis/lobbycontent, daarna gameplay. Rechterhelft blijft bestaan: boven spelers links en vrienden rechts; onder chat. Geen chat die de hele linkerhelft overneemt. |
| UI-02 Compacte headers | Controleer lange/korte kamernamen, lege/gevulde vriendenlijst en zoekvelden. | Kamernaam en `Vrienden` staan hoog genoeg; compacte headers; zichtbare ruimte vóór de zoekbalk; geen overlapping of afgesneden label. |
| UI-03 Grid | Plaats brede en halve widgets in verschillende volgordes; gebruik lange titels en lege inhoudscategorieën. | Het grid blijft uitgelijnd en leesbaar. Brede widgets gebruiken de beschikbare contentbreedte; op smalle schermen stapelen kaarten netjes. |
| UI-04 Kamerlobby 90% | Open mobiel zonder actieve partij achtereenvolgens Kamer, Chat en Ladder. | Elk panel neemt 90% van de actuele bruikbare viewport in. De hoogte is gebaseerd op dezelfde viewportmeting als de referentie. |
| UI-05 In-game 60% | Start mobiel een partij; open dezelfde drie panelen. | Panelhoogte is 60%; gameplay blijft erboven zichtbaar. Een invoeractie in het panel mag geen dart werpen. |
| UI-06 Toestandswisseling | Sluit een panel, start/beëindig/verlaat een partij en open opnieuw. Wissel 1023 ↔ 1024 en 1099 ↔ 1100 px. | De hoogte en indeling passen bij de vastgelegde productiegrens en actieve toestand; geen verouderde 90%-klasse in-game of losgeraakt desktopcomponent. |
| UI-07 Toetsenbord | Open chat, focus invoer, open snelle zinnen, sluit de popover, stuur een bericht en sluit het toetsenbord. | Invoer, zendknop en sluiten blijven zichtbaar; geen body-scrollsprong of bedekte laatste chatregel; focus keert logisch terug. |
| UI-08 Overige overlays | Open profiel, instellingen, uitnodiging en toeschouwer. | Hun eigen ontwerp blijft intact; de specifieke 90%/60%-regel geldt voor Kamer, Chat en Ladder, niet automatisch voor iedere modal. |
| UI-09 Navigeren vanuit beheer | Open `Inrichten` vanuit de kamer en de preview vanuit kamerbeheer. | Het centrale lobbybeheer opent met de juiste kamer geselecteerd. Er wordt geen aparte kopie van de volledige lobby per kamer aangemaakt. |

## 5. P1 — centraal lobbybeheer en kamergerichte widgets

Het referentiemodel is één centrale layout met een geordende widgetlijst. Iedere widget heeft doelgroep `all` of `rooms` met stabiele kamer-id’s. Het is dus mogelijk om dezelfde layout breed te gebruiken en enkele onderdelen alleen in geselecteerde kamers te tonen.

| ID | Teststappen | Verwacht resultaat |
|---|---|---|
| ADM-01 Widgetsoorten | Voeg Aankondiging, Uitgelicht toernooi, Spelers, Weekchallenge, Communitymoment, Nieuws, Poll en Divisies toe. | Elk type heeft passende velden, voorbeeldweergave en werkende actie. Geen universele instelling die een widget stilzwijgend negeert. |
| ADM-02 Volgorde en formaat | Verplaats widgets omhoog/omlaag, dupliceer een widget, kies half/breed en schakel hem uit. | Volgorde/formaat worden gepubliceerd; duplicaat krijgt een eigen id; uitgeschakeld is afwezig in de spelerslobby. |
| ADM-03 Kamerselectie | Maak één poll alleen voor Beginners en één nieuwsblok voor twee kamers. Controleer alle drie als speler. | Alleen geselecteerde kamers tonen het gerichte onderdeel. Algemene widgets blijven overal zichtbaar. |
| ADM-04 Kamer hernoemen | Hernoem een geselecteerde kamer zonder idwijziging. Verwijder daarna een andere geselecteerde kamer. | Hernoemen behoudt targeting; een verdwenen id lekt niet naar een andere kamer. Beheer toont een begrijpelijke situatie en laat de selectie herstellen. |
| ADM-05 Ongeldige doelgroep | Publiceer een ingeschakelde kamergerichte widget zonder kamerselectie. | Publicatie wordt met gerichte fout geweigerd. Het bestaande publieke resultaat blijft intact. |
| ADM-06 Platformaankondiging | Selecteer platformbron en schakel het platformbericht uit/aan; test daarnaast eigen tekst in een andere widget. | Uitgeschakelde platformbron toont niets. Een eigen aankondiging heeft eigen tekst en doelgroep. Geen verborgen fallback die het platformbericht alsnog zichtbaar maakt. |
| ADM-07 Nieuws | Maak drie artikelen: nieuws, update en uitleg. Koppel een selectie in vaste volgorde; laat één artikel verborgen. | Alleen zichtbare/gepubliceerde artikelen verschijnen na lobbypublicatie, met juiste titel, intro, alinea’s en optionele interne CTA. |
| ADM-08 Artikel verwijderen | Verwijder een artikel dat in meerdere nieuws-widgets voorkomt; annuleer eerst, bevestig daarna. | Annuleren wijzigt niets. Bevestigen verwijdert verwijzingen; een widget die uitsluitend dat artikel bevat wordt niet onverwacht een blok met alle andere berichten. |
| ADM-09 Poll | Probeer één optie, dubbele opties met afwijkende hoofdletters/spaties, lege opties en zes opties. Publiceer daarna een geldige poll met twee tot vijf opties. | Ongeldige publicatie wordt geweigerd. Geldige opties, stemstatus en percentages werken. Wijzigen van de opties hergebruikt geen stem voor een andere antwoordtekst. |
| ADM-10 Toernooiselectie | Kies automatisch en vervolgens een specifiek gepubliceerd toernooi. Verberg/sluit het gekozen event. | Automatisch kiest passend beschikbaar event. Een onbeschikbaar specifiek event wordt niet stilzwijgend vervangen door een willekeurig ander event; toon passende lege toestand/kalenderactie. |
| ADM-11 Concept versus gepubliceerd | Vergelijk beide previewstanden, twee kamers en desktop-/mobielbreedte. Klik op een CTA en een reactie in de preview. | Preview gebruikt dezelfde feedcomponent. Navigatie blijft binnen de beheerpreview; voorbeeldreacties veranderen geen echte stemmen/applaus. |
| ADM-12 Beheer verlaten | Wijzig inhoud en navigeer intern; test ook sluiten/herladen van het tabblad en een mislukte concept-save. | Interne beheernavigatie bewaart concept volgens referentie of blokkeert bij fout. Browservertrek met niet opgeslagen werk heeft een waarschuwing. Lopende mediaverwerking kan geen halve publicatie veroorzaken. |
| ADM-13 Audit | Sla een gewijzigd concept op, sla identiek opnieuw op en publiceer. | Eerste wijziging en publicatie zijn herleidbaar; identiek opslaan veroorzaakt geen auditspam. Actor en tijd komen in productie van de server. |

## 6. P1 — hero-afbeeldingen

| ID | Teststappen | Verwacht resultaat |
|---|---|---|
| IMG-01 Toernooibron | Kies standaardfoto, eigen upload, HTTPS-link en zonder foto. Sla steeds op en herlaad. | Keuze blijft behouden en is zichtbaar in toernooiheader en overervende lobbykaart. Zonder foto gebruikt de oorspronkelijke grafische achtergrond. |
| IMG-02 Uitsnede | Test horizontale/verticale positie 0, 50 en 100; overlay 25 en 85. Controleer brede header, halve kaart en mobiel. | Instellingen worden consistent toegepast; de foto vult het vlak zonder uitrekken; tekst en CTA blijven leesbaar. De uitsnede kan per beeldverhouding verschillen, het focuspunt niet. |
| IMG-03 Widgetoverride | Laat widget A overnemen, B eigen foto gebruiken en C zonder foto. Wijzig daarna de toernooifoto. | Alleen A volgt het toernooi. B en C behouden hun eigen keuze. Conceptwijzigingen worden pas zichtbaar na publicatie. |
| IMG-04 Ontbrekende custom foto | Kies eigen afbeelding voor een ingeschakelde widget, verwijder de foto en probeer te publiceren. | Concept mag incompleet blijven; publicatie vraagt een foto of een andere afbeeldingsmodus. |
| IMG-05 Uploadgevallen | Test geldig JPG/PNG/WebP, leeg/corrupt bestand, verkeerd formaat, >8 MB en zeer grote pixelafmetingen. | Goede bestanden worden verwerkt; onbruikbare uploads geven een begrijpelijke fout en vervangen de bestaande foto niet. Verwerking toont busy-status en voorkomt voortijdig opslaan/publiceren. |
| IMG-06 Snelle bronwissel | Start upload of URLcontrole en kies vóór afronding een andere foto/geen foto; sluit de editor. | Het oude async resultaat overschrijft de nieuwe keuze niet. Geen achterblijvende busy-status of schrijfactie na unmount. |
| IMG-07 Slechte externe bron | Gebruik onbereikbare URL, geen afbeeldingsresponse en een bron die later verdwijnt. | Editor meldt de fout. Spelersweergave valt terug op grafische achtergrond met leesbare tekst; geen gebroken-img icoon of blanco belangrijke CTA. |
| IMG-08 Onveilige bron | Test `http:`, `javascript:`, `//host`, backslashes, controltekens, URL met credentials en SVG-data-URL. | De invoer wordt geweigerd; geen publicatie of onveilige rendering. Productionele media-API valideert onafhankelijk van de client. |
| IMG-09 Capaciteit en opslagfout | Vul de demo-opslag richting haar grens en simuleer opslagweigering. Doe dezelfde foutinjectie bij productie object storage/database. | Duidelijke fout; vorige afbeelding/publicatie intact; geen stille successtatus. Productie slaat mediabestanden buiten de layout-JSON op. |

Referentiegrenzen voor lokale demo: upload maximaal 8 MiB, maximaal 50 megapixels, automatische verkleining binnen 1600 × 900, geëncodeerde afbeelding maximaal 300.000 tekens. Lobbytoestand is maximaal 2.000.000 JSON-tekens en toernooitoestand kleiner dan 3.000.000. Dit zijn demobudgetten, geen productieopslagarchitectuur. De URLeditor begrenst invoer op 2.000 tekens; het gedeelde model staat maximaal 4.096 tekens toe voor URL/pad.

## 7. P1 — chat en toeschouwers

| ID | Teststappen | Verwacht resultaat |
|---|---|---|
| CHAT-01 Composer | Controleer de rij met smiley, tekstwolk, tekstvak en verzendknop op mobiel en desktop. | Tekstwolk direct rechts van smiley; vaste zinnen in een overlay; geen blijvende rij die invoerruimte wegneemt. |
| CHAT-02 Popovers | Open emoji, open daarna snelle zinnen; kies een vaste zin. Sluit met Escape en buitenklik. | Hoogstens één popover tegelijk. Vaste zin wordt eenmaal naar het actieve kanaal gestuurd; focus keert terug naar de composer. |
| CHAT-03 Autoscroll | Blijf onderaan terwijl B berichten stuurt. Scroll daarna omhoog en laat B opnieuw berichten sturen. | Onderaan volgt de lijst nieuwe berichten. Bij teruglezen blijft de positie behouden en verschijnt een duidelijke actie naar nieuwe berichten; die actie brengt je onderaan. |
| CHAT-04 Kanaalwissel | Open spelchat, kamerchat en meerdere privéchats; typ concepten, wissel tabs, sluit en heropen een privétab. | Kanaal, concepttekst, historie en focus zijn correct gescheiden. Binnenkomend privébericht heropent niet onverwacht een bewust gesloten tab. |
| CHAT-05 Binnenkomst | Laat B binnenkomen; laat C binnen twee seconden volgen. Bekijk daarna de historie. | Er staat één vervangbare, infadende melding vlak boven het tekstveld; na circa twee seconden uit beeld. Binnenkomst blijft niet als gewone chatregel staan. |
| CHAT-06 Moderatie | Mute/verwijder/blokkeer een gebruiker en probeer normale tekst én snelle zin te sturen. | Beide verzendroutes volgen dezelfde serverrechten, snelheidslimieten en kanaalregels. Clientknoppen alleen zijn niet voldoende. |
| SPEC-01 Meekijken | C opent een partij van A/B. A gooit drie pijlen, B neemt over. | C ziet dezelfde scores, pijlen, beurt, wedstrijdnummer en resultaat. Geen eigen werpcontrols en geen invloed op A/B. |
| SPEC-02 Toeschouwerschat | C stuurt in de spelkamer; A en B antwoorden. Open daarnaast kamerchat. | Alle drie zien dezelfde spelchat; kamer- en privékanaal blijven gescheiden. Spectatorstatus is zichtbaar. |
| SPEC-03 Rechten en vertrek | Laat C vertrekken, opnieuw verbinden, een beëindigde partij openen en rechtstreeks een worp/resultaatverzoek doen. | Vertrek/reconnect geeft geen dubbele subscriptions; einde is duidelijk; C kan nooit scores of uitslagen muteren. |

De huidige `SpectatorView` simuleert een eigen lokale wedstrijd wanneer geen gekoppelde game beschikbaar is. `LIVE DEMO`, vaste voorbeeldnamen en lokale chat kunnen dus visueel goed werken zonder enige echte realtime synchronisatie. Voor productie zijn SPEC-01 t/m SPEC-03 verplicht met gescheiden accounts.

## 8. P0/P1 — werpen, time-outs, inactiviteit en inloggen

| ID | Prio | Teststappen | Verwacht resultaat |
|---|---|---|---|
| GAME-01 | P1 | Gooi de derde pijl en bekijk de indicator gedurende de volledige tegenstanderbeurt. | Richtindicator stopt met bewegen zodra de eigen werpfase eindigt; hervat pas in de eigen richtfase. Geen vierde worp mogelijk. |
| GAME-02 | P1 | Vergelijk normale indicatorbeweging met de referentie en test met minder beweging aan. | Kleine snelheidsverhoging behouden; geen grote sprong of afhankelijkheid van framerate. Voor nieuwe `faster-v2`-sessies zijn de referentieperioden horizontaal 2037 ms en verticaal 2315 ms. Bestaande sessies behouden hun opgeslagen timingversie, inclusief 2200/2500 ms waar die oudere versie geldt. |
| GAME-03 | P0 | Laat op eigen beurt zonder werpactie drie volledige deadlines verlopen; probeer de waarschuwingen alleen te sluiten. | Eerste en tweede deadline tonen een waarschuwing en nieuwe kans; pas derde veroorzaakt verlies. Sluiten van een waarschuwing telt niet als werpactie. Tegenstander ontvangt hetzelfde definitieve resultaat. |
| GAME-04 | P0 | Herlaad tijdens waarschuwing 2; zet de clientklok terug; onderbreek netwerk; laat derde deadline samenvallen met een worp. | Server beslist eenduidig op één volgorde/deadline; geen reset door herladen/klokwijziging en geen dubbele einduitslag. |
| GAME-05 | P1 | Gebruik testklok: blijf 299 seconden in de kamer zonder interactie; ga over 300 seconden. Herhaal met activiteit vlak voor de grens en met verborgen tab. | Niet voortijdig verwijderd; na vijf minuten echte inactiviteit naar lobby met uitleg. Inkomende chat en animaties gelden niet als gebruikersactiviteit. Server ruimt presence ook bij weggevallen clients op. |
| GAME-06 | P0 | Start twee nieuwe wedstrijden tegelijk en open één bestaand wedstrijdnummer als onbevoegde gebruiker. | Leesbaar numeriek nummer is uniek volgens het gekozen datamodel; nummer raden geeft geen extra rechten. Interne id en displaynummer zijn expliciet gescheiden waar nodig. |
| AUTH-01 | P0 | Vul e-mail in en klik direct voordat captcha gereed is; probeer ook Enter en rechtstreeks endpointverzoek. | Codeaanvraag geblokkeerd. Ongeldige/ontbrekende captcha verstuurt geen mail en verbruikt niet de resend-cooldown; anti-misbruiklimieten kunnen onafhankelijk blijven gelden. |
| AUTH-02 | P0 | Voltooi echte Turnstile, vraag code aan; test verlopen/ongeldig/hergebruikt token en token uit verkeerde context. | Server valideert token vóór OTP-verzending. Clientstatus alleen geeft geen toegang. Fouten laten een duidelijke herhaalbare flow zien. |
| AUTH-03 | P0 | Test OTP met voorloopnul, foute code, verlopen code, teveel pogingen, opnieuw aanvragen en correct inloggen. | Correcte serverlimieten, geen accountlek via fouttekst, geen OTP in clientlogs/URL. De knopstatus weerspiegelt daadwerkelijke aanvraagstatus. |
| AUTH-04 | P1 | Nieuwe gebruiker doorloopt gebruikersnaamkeuze; bestaande gebruiker logt opnieuw in en volgt `next`. | Alleen eerste keer naamkeuze; veilige interne bestemming; geen open redirect; browser terug/refresh geeft geen vastgelopen flow. |

## 9. Productiebeveiliging: concreet te verifiëren

- **Identiteit en rollen:** verwijder beslissingen op basis van de letterlijke naam `Nick`, lokale role-data en `DemoGate`. Controleer iedere beheer-API en websocketactie server-side. `/demo` en de zichtbare OTP-mailpreview mogen geen productionele aanmeldroute vormen.
- **OTP/Turnstile:** geheime sleutels uitsluitend server-side. Geen OTP of captcha-secret in builds, sourcemaps, telemetry of audit. Gebruik een echte servergevalideerde tokenflow met gecontroleerde vervaldatum, hergebruik en aanvraaglimieten. Het demonstratievinkje wordt vervangen.
- **Sessies en mutaties:** bestaande veilige sessiearchitectuur hergebruiken; cookiebeveiliging en bescherming tegen cross-site mutaties controleren. Geauthenticeerde actor komt niet uit een vrij invulbaar payloadveld.
- **Realtime:** kamer-/wedstrijd-/privékanaalautorisatie bij verbinden, subscriben én verzenden; mute/ban/revocation werkt ook op al geopende verbindingen. Herverbinden en herhaalde berichten/worpen zijn idempotent.
- **Wedstrijdintegriteit:** server bezit beurt, score, timeoutteller, deadlines en eindresultaat. Manipuleren van DOM, clientklok, localStorage, displaynummer of lokaal berekende score mag geen ongeldige worp of ratingmutatie opleveren.
- **Content:** server herhaalt lengte-, type-, doelgroep- en referentievalidatie. Tekst wordt veilig gerenderd; geen ongecontroleerde HTML. Interne CTA-validatie voorkomt externe of uitvoerbare URL’s. Verwijderen van media/artikelen houdt referentiële integriteit intact.
- **Media:** controleer uploadrecht, bestandssignatuur, MIME, werkelijke pixelafmetingen, grootte en decodeerfouten. Produceer een eigen veilige afbeeldingsvariant; gebruik unieke opslagkeys en juiste content-typeheaders. SVG/HTML en een alleen hernoemd bestand krijgen geen uitvoerbare route.
- **Externe afbeeldingen:** beslis expliciet of HTTPS-bronnen direct geladen mogen worden of worden ingelezen in eigen opslag. Bij server-side ophalen zijn redirect-/IP-/hostnamecontroles nodig tegen verzoeken naar interne diensten. Een geldige HTTPS-string alleen is geen veilige server-fetch.
- **Conceptprivacy:** ongepubliceerde media en artikelen lekken niet via openbare objectkeys, zoekindex of voorspelbare API’s. Publicatie en later intrekken respecteren de gekozen cache- en toegangsregels.
- **Bestaande bootstrap expliciet filteren:** de geïnspecteerde productie-repo op `5817bd4` levert de bestaande settings-JSON ook aan gewone spelers. Stop lobbyconcepten dus niet ongefilterd in `private.system_settings.data`; splits de publicatieprojectie van de beheerdata en verifieer de volledige bootstrapresponse.
- **API-payloadgrenzen behouden:** de geïnspecteerde productie-API heeft een algemene JSON-bodygrens van 16.384 tekens. Een prototype-afbeelding kan 300.000 tekens zijn en past daar niet in. Gebruik begrensde media-uploadhandelingen en mediareferenties; verruim de globale limiet niet blind. Breid daarnaast het strikte tournament-inputschema expliciet uit voor het gekozen hero-model.
- **Audit en conflicten:** serverlog bevat actor, tijd, doel en revisie. Publicatie is atomair; gelijktijdige wijzigingen kunnen niet ongemerkt oudere inhoud terugzetten. Foutpaden en rollback bewaren de laatst werkende versie.
- **Operationeel bewijs:** migrations en herstelpad getest op bestaande data; staging- en productiecredentials gescheiden; geen clientbundel met secrets; basisgezondheid na deploy gecontroleerd. Een succesvolle pipeline vervangt bovenstaande gebruikers- en rechtencontroles niet.

## 10. Bestaande prototypechecks

Bij deze overdracht zijn op de genoemde prototypecommit de hero-, lobby-, toernooi-, chat-, game-state- en demo-authchecks opnieuw geslaagd, evenals TypeScript zonder emit. De uitvoering van 14 oktober 2026 om 09:19 UTC staat met commando's, exitcodes en output in `VERIFICATIE.json`. Dezelfde broncommit heeft een eerder geslaagde Sites-publicatie. Er zijn voor deze overdracht geen browsertests uitgevoerd en er is geen productiecode gewijzigd of getest. De overige hieronder genoemde scripts zijn aanwezig, maar vallen buiten die verse verificatierun.

| Script | Wat het nuttig afdekt | Wat het niet bewijst |
|---|---|---|
| `scripts/check-lobby-content.mjs` | Concept/publicatie, volgorde, kamer-id-targeting, validatie, interne links, lokale opslag/cross-tab en corrupte data | Serverrechten, databaseconflicten, werkelijke browserweergave |
| `scripts/check-hero-images.mjs` | Hero-defaults, veilige bronnen, controles, oude records, live bracketbehoud, overrides, opslagfouten en limieten | Werkelijke beelddecodering/upload UI, mobiele uitsnede, object-storageveiligheid |
| `scripts/check-tournaments.mjs` | Brackets, double elimination, correcties, planning, migratie, deelnemersrechten in demo-store | Meerdere echte accounts, gelijktijdige servermutaties, productieautorisatie |
| `scripts/check-chat-tabs.mjs` | Tabgedrag, concept/historie, binnenkomstmelding, spectator-chatkanaal | Scroll/focus in browsers, realtime levering, echte kanaalrechten |
| `scripts/check-game-state.mjs` | Reducer, dartvlucht versus score, overgangen en timeoutlogica | Timerfrequentie, rAF-gedrag, inputlatency op apparaten, serverdeadlines |
| `scripts/check-demo-auth.mjs` | Lokale OTP-regels, naamvalidatie, bestemming en demo-sessie | Echte captcha, e-mailaflevering, sessiebeveiliging en serverrate-limits |
| `scripts/check-fair-play.mjs` | Pure fair-playberekening en bijbehorende SQLite-/API-logica voor de prototypearchitectuur | Productie-infrastructuur, multiplayer, netwerkvertraging, anti-cheat als geheel |
| Overige domeinchecks | `check-admin-operations`, `check-competition-rules`, `check-dart-geometry`, `check-darts-checkouts`, `check-darts-elo`, `check-darts-friends`, `check-divisions`, `check-match-formats`, `check-public-catalog` | Geen vervanging voor gerichte browser- en integratieacceptatie |

Voor de ongewijzigde bron zijn de gerichte checks direct met Node uit te voeren, bijvoorbeeld:

```bash
node --experimental-strip-types scripts/check-lobby-content.mjs
node --experimental-strip-types scripts/check-hero-images.mjs
node --experimental-strip-types scripts/check-tournaments.mjs
node --experimental-strip-types scripts/check-chat-tabs.mjs
node --experimental-strip-types scripts/check-game-state.mjs
node --experimental-strip-types scripts/check-demo-auth.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

De verse bronchecks zijn uitgevoerd met Node v24.19.0. Gebruik bij herhaling een compatibele Node-versie (de scripts gebruiken onder andere `node:module.registerHooks`) en de projectgebonden dependency-installatie. Verander voor integratie niet de Node-keuze van de doelrepo alleen vanwege deze referentiechecks. `check-fair-play.mjs` gebruikt `node:sqlite`. De bestaande build-/Sites-scripts zijn referentie-infrastructuur; pas de uitvoering aan de doelrepo en diens CI-gates aan. Geen limieten of assertions versoepelen om tests groen te krijgen. Draai de bestaande werp-/latencytests uit de productie-repo apart: deze broncodechecklist levert daarvoor geen meetresultaten.

## 11. Bekende aandachtspunten bij het overnemen

1. **Geen echte productie-login:** captcha is een lokale simulatie met 750 ms controle en reset na 120 seconden; OTP staat in een preview. De uitgestelde aanvraagknop is wel de gewenste UX. Behoud en verifieer de al aanwezige echte productie-tokencontrole; importeer de lokale simulatie niet.
2. **Hardcoded demo-identiteit:** meerdere componenten, moderatiecontroles, audit en eigen-spelerdetectie gebruiken `Nick`. Koppel deze aan de daadwerkelijke sessie zonder het uiterlijk te veranderen.
3. **Timeout is nu lokaal en 30 seconden:** `TURN_TIME_SECONDS` staat in `components/darts-game.tsx`; dit volgt niet automatisch elke beurttijd uit platform-/toernooibeheer. Het prototype herstart de timer bij bepaalde worp-/eventovergangen. `lock-x` en `launch` zetten de timeoutteller terug op nul. Leg in de serverregels expliciet vast wat een beurttijd en geldige activiteit is; neem deze clientdetails niet ongemerkt over als anti-misbruikregel.
4. **Vijf minuten is lokale aanwezigheid:** `useRoomIdle` meet pointerdown, keydown, wheel en touchmove in de huidige client. Refresh/remount start die meting opnieuw. Voor productie moet presence/expiry gedeeld en servergestuurd zijn, met een expliciete regel voor actieve spelers en passieve toeschouwers.
5. **90% betekent hier het mobiele layoutbereik:** prototype-CSS gebruikt `max-width:1099px`, dus ook sommige tablets; de productiecanon begint desktop al bij 1024 px. Behoud die productiegrens tenzij expliciet aangepast, en test beide grensparen. Na een gewonnen partij kan `game.ready` nog waar zijn; tot terugkeer naar de kamerlobby blijft dan de 60%-toestand gelden. Controleer dit als concrete UX-keuze bij overname.
6. **Demo-displaynummers zijn niet wereldwijd uniek:** lokale teller begint rond 83626; oude hashes worden naar een kort nummer afgebeeld. Gebruik in productie een eigen unieke nummerreeks/kolom en behoud de interne wedstrijdidentiteit en rechten.
7. **Lokale content is geen CMS-backend:** localStorage, cross-tab-events en lokale audit tonen de gewenste bediening. Centrale opslag, revisieconflicten, rollen en levering naar andere gebruikers moeten echt worden geïmplementeerd.
8. **Geen generieke realtimekoppeling voor hero:** lobbycontent luistert naar browser-storage-events; de toernooistore heeft geen gelijkwaardige algemene cross-tab-listener. Test overerving en publicatie in productie tussen gescheiden sessies, niet alleen na een reload in dezelfde browser.
9. **Artikelen hebben twee lagen zichtbaarheid:** een zichtbaar artikel moet onderdeel zijn van de gepubliceerde lobby en bereikbaar zijn via een zichtbare nieuws-widget voor de huidige kamer. Het wijzigen van alleen de artikelstatus in een concept publiceert niets.
10. **Sommige widgets zijn voorbeelden:** applaus, pollstemmen en communityprestaties zijn lokale/vooraf ingevulde inhoud; weekchallenge leest eigen oefenvoortgang. Bepaal per widget de echte gegevensbron en empty-state. Een gepubliceerde voorbeeldscore mag niet als geverifieerde prestatie worden gepresenteerd.

## 12. Afrondingscriterium

De sprint is pas gereed wanneer de gebruikte commit is vastgelegd, P0/P1-gevallen aantoonbaar slagen, browserbewijs voor mobiel én desktop beschikbaar is, de bestaande productieregressies groen zijn en de nieuwe beheergegevens vanuit een echte beheerderssessie zichtbaar worden in een andere spelerssessie. Rapporteer resterende beperkingen expliciet. Noteer afzonderlijk wat alleen op broncode-/unitniveau is gecontroleerd en wat daadwerkelijk op staging is doorlopen.
