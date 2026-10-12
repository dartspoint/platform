# DartsPoint — platformbeheer voor eigenaren

De eigenaar opent `/beheer` via Platformbeheer in het eigen profiel van lobby of spel. Het ontwerp gebruikt dezelfde Afterhours-identiteit: diep groen, warme lichte tekst, rode primaire acties, het vaste logo en rustige scoretypografie. Op desktop staat de navigatie links; op kleinere schermen opent een apart beheermenu. Het spelbord blijft een afzonderlijke ervaring.

Elke beheerpagina heeft één hoofdtitel in de beheershell. De inhoud begint daarna direct met de toolbar, tabel of instellingskaarten. Dubbele paginatitels, overbodige bovenregels en herhaalde beschrijvingen zijn verwijderd. Functionele sectiekoppen en noodzakelijke uitleg bij velden blijven staan.

## Onderdelen

1. **Overzicht:** spelers, kamers, actieve toernooien, opvolging van meldingen, bezetting, recente beheeracties en directe acties.
2. **Toernooien:** concepten maken, kopiëren, wijzigen, publiceren en inschrijving/check-in openen. Knock-out en dubbele eliminatie voor 4, 8, 16, 32 of 64 plaatsen, met Elo-, willekeurige of handmatige plaatsing.
3. **Seizoenen & divisies:** divisies met naam, kleur en niveau; spelers indelen; speeldagen genereren; uitslagen, standen, promotie/degradatie en vervolgseizoenen beheren.
4. **Spelers & rollen:** zoeken/filteren, profielen, rollen speler/VIP/admin, waarschuwingen, tijdelijke mute en schorsing met reden. Eigenaar Nick blijft beschermd tegen verwijderen van de eigen rol of zelfschorsing.
5. **Kamers:** aanmaken en wijzigen, capaciteit maximaal 50, regels, ratingbereik, moderator, categorie en toegang. Sluiten blokkeert nieuwe instroom; bestaande bezetting en wedstrijden blijven staan. Alleen lege, gesloten kamers kunnen worden verwijderd.
6. **Moderatie:** bestaande lokale spelersmeldingen en fictieve voorbeeldmeldingen, context/Game ID, in behandeling nemen, maatregel of afhandeling met toelichting.
7. **Spel & deelname:** startscore 301/501/701, finishregel, best-of per ronde en finale, tempo- en comfortvoorkeuren, capaciteit, ratingbereik, minimaal gespeelde wedstrijden, VIP-toegang, goedkeuring en check-in.
8. **Elo:** actief beleid K32/start1500/plaatsing10+5, en een berekenbaar beleidsconcept. Een concept opslaan wijzigt geen bestaande ratings of actief beleid.
9. **Platforminstellingen:** naam/contactgegevens en beleidsvoorkeuren, lobbyaankondiging en onderhoudsmelding met voorbeeld.
10. **Actielogboek:** gecombineerde beheeracties, inclusief toernooien en seizoenen, met zoekfunctie, periodefilter en CSV-export van de huidige selectie.

## Officiële DartsPoint-toernooien

De organisator is DartsPoint. Deelnemers schrijven zich in via de publieke toernooilijst in de lobby. Alle gepubliceerde evenementen zijn bereikbaar; de lijst stopt niet na de eerste vier. Concepten en geannuleerde toernooien staan niet in de publieke lijst. Gepubliceerde afgeronde toernooien blijven beschikbaar om uitslagen terug te kijken.

Inschrijving en check-in hebben aparte tijdvensters. Deelname controleert ratingbereik, gespeelde wedstrijden, rol, regelsacceptatie en eventuele beheerdersgoedkeuring. Er zijn aparte statussen voor wachtlijst, bevestigd, ingecheckt en uitgeschreven. Zonder expliciete check-intijden wordt het venster afgeleid van de geplande start en de ingestelde check-inperiode. Zonder starttijd is er geen afgeleide tijdgrens.

Nieuwe toernooien nemen opgeslagen spel- en deelnamevoorkeuren over. Elk toernooi bewaart zijn eigen configuratie; latere wijzigingen aan de platformstandaard veranderen bestaande evenementen niet. Voor officiële DartsPoint-toernooien is toeschouwen altijd toegestaan, ook als de algemene spelvoorkeur anders staat.

### Brackets, uitslagen en herstel

Het bracket heeft minimaal vier posities en groeit tot een macht van twee die alle toegelaten deelnemers past. Vrijloten worden automatisch verwerkt. Een nog onbesliste voorgaande wedstrijd is nooit een vrijloting.

Bij knock-out gaan winnaars naar de volgende ronde. Dubbele eliminatie heeft een winnaarsroute en een verliezersroute: de eerste nederlaag geeft een herkansing, de tweede schakelt de speler uit. Beide routes eindigen in de grote finale. Wint de nog ongeslagen finalist, dan is het toernooi afgelopen. Wint de finalist uit de verliezersroute, dan volgt een echte tweede finale: beide spelers hebben dan één nederlaag. Het kampioenschap volgt pas na deze beslissende wedstrijd.

Alleen een geldige best-of-uitslag of een walkover met reden wordt verwerkt. Een correctie op een gespeelde uitslag vraagt om een reden en wist afhankelijke vervolguitslagen in beide routes, inclusief een eventuele finalereset. Onafhankelijke wedstrijden blijven staan. Spel- en deelname-instellingen en deelnemers zijn na de start vergrendeld.

Een volledige bracketreset is een afzonderlijke beheeractie met reden: wedstrijden en kampioen worden gewist en het toernooi keert terug naar check-in. Daarna kan de organisator opnieuw indelen. Deze beheerreset is iets anders dan de tweede finale bij dubbele eliminatie.

### Bordplanning

Een toernooi heeft 1–16 virtuele borden en automatische of handmatige toewijzing. De planning controleert voorgaande wedstrijden, toelating, check-in, gereedmelding, al bezette borden, spelers die elders aan een bord staan en de rusttijd sinds hun vorige gespeelde partij. De rusttijd is instelbaar van 0 tot 900 seconden. Wachtende partijen tonen waarom ze nog niet kunnen beginnen.

Bij automatische planning krijgt een geschikte volgende partij een vrij bord. Gereedmelding is een lokale status met de acties klaar en pauze; het is geen gemeten netwerk-aanwezigheid. Handmatig kan beheer een startklare partij aan een vrij bord toewijzen. Een wedstrijd begint pas na een expliciete startactie. De startcontrole voorkomt ook dat dezelfde speler tegelijk in een ander lokaal toernooi speelt.

De automatische planning wordt vernieuwd vanuit het geopende planningsoverzicht, de geopende toernooikamer en relevante lokale beheeracties. Er draait geen achtergrondplanner wanneer de website gesloten is.

### Speciale toernooikamers

Iedere toernooikamer heeft route `/toernooi/[id]`. De kamer toont borden, wachtende partijen, het bracket en deelnemers. Iedereen die het gepubliceerde event kan openen mag kijken; alleen de ingedeelde, toegelaten en gereedgemelde deelnemer kan zijn eigen wedstrijd starten. De aanwezigheid van een kamernaam geeft op zichzelf geen speelrecht.

De algemene kamerroute opent bij een toernooicategorie een specifiek actief event of de evenementenkiezer in de lobby. Een bestaande sociale kamer wordt niet overgenomen doordat een organisator dezelfde naam in een toernooi invult. Verborgen concepten en afgeronde evenementen blokkeren zo ook geen gewone sociale wedstrijd.

Toeschouwen toont de uitslag of de opgeslagen bordstand van deze lokale competitie. Het is geen gedeelde live-uitzending tussen verschillende apparaten. Een toeschouwer wordt niet automatisch ingeschreven en telt niet mee als deelnemer.

## Seizoenen en divisies

Divisies zijn een eigen spelvorm op `/divisies`, los van de evenementenkalender. Beheer maakt een conceptseizoen met startdatum, best-of, divisies, spelers en promotie-/degradatieplaatsen. Er kan één seizoen tegelijk actief zijn.

Een gegenereerd schema laat iedere speler eenmaal tegen iedere divisiegenoot spelen. Speeldagen liggen een week uit elkaar; een oneven deelnemersaantal krijgt rustweken. Indeling en regels zijn na de start vergrendeld. De speler ziet de divisieladder, alle speelrondes en zijn eigen wedstrijden. Alleen de twee ingedeelde spelers hebben speelrecht; eerdere open speelrondes van beide spelers moeten eerst worden afgerond.

Winst levert drie seizoenspunten op. De rangschikking volgt punten, legsaldo en gewonnen legs. Bij twee verder gelijkstaande spelers beslist hun gespeelde onderlinge wedstrijd. Onbesliste gedeelde standen blijven herkenbaar als gedeelde plaats. Elo wordt niet gebruikt om deze stand te bepalen.

Een divisiebadge naast de gebruikersnaam komt uitsluitend uit het actieve seizoen. Deze badge staat los van rolkleuren, VIP-kroon en Elo-kleur. Lobby en clubhuis verwijzen naar de divisieladder en de volgende eigen wedstrijd.

Bij afsluiten blijven resultaten en eindstand bewaard. Afsluiten met open wedstrijden vraagt om een reden; ongespeelde partijen krijgen geen punten. Een vervolgseizoen neemt spelers en divisies over, past promotie/degradatie toe en begint als concept zonder oud speelschema of uitslagen. Per divisiegrens wordt het kleinste ingestelde aantal promotie- en degradatieplaatsen gebruikt, begrensd door de beschikbare groepsgrootte. Bij een gedeelde stand op een grens blijven de betrokken divisies ongewijzigd en krijgt beheer een waarschuwing om het nieuwe concept handmatig in te delen. Zodra een vervolgseizoen bestaat, is de oorspronkelijke eindstand vergrendeld.

## Speelbare competitiepartijen

`CompetitionGame` speelt echte lokale dartpartijen tegen een automatische demotegenstander. Toernooipartijen gebruiken de ingestelde 301/501/701-startscore, single-out of double-out, best-of van de ronde/finale en uitgooihulp. Divisiepartijen gebruiken 501 double-out met de best-of van het seizoen. De vertrouwde timingbalken, inslagverwerking en scoretabel blijven behouden.

Deze partijen bewaren hun bordstand per competitie-Game ID op het apparaat. Na de gewonnen laatste leg verwerkt de speler de uitslag met **Uitslag vastleggen**. Daarna veranderen het betreffende bracket of de divisieladder. De losse `/spelen`-wedstrijd en zijn hervatbestand worden niet overschreven.

Competitiepartijen wijzigen geen Elo, ook niet als een toernooi als ranked is gemarkeerd. De toernooivelden voor beurttijd en hersteltijd worden als configuratie opgeslagen; deze lokale competitie-engine handhaaft daarvoor nog geen servertimer of verbindingsdeadline. De werkende automatische rusttijd hoort bij de bordplanning, niet bij een netwerkverbinding.

## Overige koppelingen met de spelersomgeving

- Nieuwe kamers en aangepaste capaciteit/status verschijnen in lobby en het Kamer-paneel.
- Rolwijzigingen kleuren nicknames overeenkomstig eigenaar/admin/VIP/speler.
- Aankondigingen en onderhoudsmelding worden bovenaan de lobby getoond.
- Een opgeslagen gewone partij kan expliciet worden hervat, ook wanneer de kamer ondertussen voor nieuwe instroom gesloten is.

## Prototypegrenzen en verificatie

Beheer, toernooien, seizoenen en competitiepartijen worden op het apparaat bewaard. Acties sturen geen echte accountmaatregelen, berichten of uitnodigingen. Nick is de vaste demoeigenaar. De bestaande Sites-publicatie blijft eigenaar-afgeschermd; interne rolweergave, lokale toegangchecks en DemoGate zijn geen productieautorisatie.

De bestaande D1-controle voor individuele demoworpen blijft afzonderlijk bestaan. De nieuwe toernooi- en divisie-engine gebruikt deze servercontrole niet. Een echte lancering vereist accountautorisatie per handeling, gedeelde persistente competitiedata, betrouwbare aanwezigheid, serverplanning en serververwerking van wedstrijdresultaten.

Visuele browsercontrole was in deze werkomgeving niet beschikbaar. Broncodecontrole, logische controles en productiebuild vormen de technische verificatie; daarmee is apparaat- of realtimeacceptatie niet aangetoond.

## Logische vervolgstappen

- Poulefase gevolgd door knock-out, met expliciete beslissingsregels bij gelijke stand.
- Geschillen en beroep op uitslagen, los van algemene chatmoderatie.
- Servergestuurde organisatorrollen, betrouwbare auditregistratie en live aanwezigheid.
- Gedeelde wedstrijden en bordplanning die ook doorlopen als beheerders hun scherm sluiten.
