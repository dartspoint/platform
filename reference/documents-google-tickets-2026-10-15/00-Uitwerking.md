# DartsPoint uitwerking documenten login en support
Voor DG Webservices • 15 oktober 2026 • Versie 2

## 1 Doel en gekozen inrichting
DartsPoint krijgt één samenhangende inrichting voor juridische informatie, aanmelden, teamrollen, support en privacyverzoeken. De basisdocumenten blijven kort en leesbaar. De bijbehorende software maakt de beschreven afspraken uitvoerbaar. Dit document legt het voorgestelde gedrag vast; de uitvoeringsopdracht voor Codex volgt daarna.

DG Webservices ontwikkelt en exploiteert DartsPoint en is verantwoordelijk voor de verwerking van persoonsgegevens. Hetzner verzorgt de server, Supabase de database en authenticatie, en Cloudflare Turnstile de onzichtbare botcontrole. Google wordt een extra inlogmogelijkheid naast de bestaande e-mailcode. Support gebruikt support@dartspoint.nl.

De nieuwe teamrollen zijn nu al toekenbaar aan geregistreerde gebruikers en werken in het ticketsysteem. De overige rechten voor kamers, wedstrijden en toernooien worden in een latere sprint uitgewerkt. Bestaande beheerders behouden hun huidige rechten.

Het pakket bevat nieuwe voorwaarden, privacyverklaring en handleiding zonder invulmarkeringen of conceptstempels. De teksten beschrijven de hieronder gekozen inrichting en worden tegelijk met die werkende inrichting gepubliceerd. De eerdere implementatieprompts zijn nog niet aangepast en vormen geen opdracht voor deze gecombineerde sprint.

## 2 Basisdocumenten en publicatie
De algemene voorwaarden regelen gratis gebruik, accountveiligheid, eerlijk spelen, chatgedrag, moderatie, evenementen, intellectuele eigendom, beëindiging, klachten en wijzigingen. DP-punten hebben geen geldwaarde. Er komen geen betaalvoorwaarden voor producten die nog niet worden verkocht en geen btw-nummer in deze documenten. Wettelijke aansprakelijkheid en consumentenrechten blijven gelden; een algemene uitsluiting van alle aansprakelijkheid biedt geen betrouwbare bescherming.

De privacyverklaring beschrijft accounts, Google-login, zichtbare spelersgegevens, chats, tickets, beveiliging, ontvangers, bewaartermijnen en rechten. De Cloudflare Turnstile Privacy Addendum-link blijft expliciet aanwezig. De handleiding behandelt spelen, aanmelden, support en accountbeheer zonder interne ontwikkelterminologie.

Als eenvoudige startkeuze stel ik 16 jaar als minimumleeftijd voor. Dit is productbeleid, geen algemene wettelijke leeftijdsgrens voor online darts. Bij registratie komt een leeftijdsbevestiging; een volledige geboortedatum is daarvoor niet nodig. Voor 16- en 17-jarigen blijft toestemming van een wettelijke vertegenwoordiger nodig waar de wet dat vraagt. Als jongere spelers welkom moeten blijven, moeten de voorwaarden en de aanmeldprocedure daarop worden aangepast vóór publicatie.

### Publieke plaatsen
| Plaats | Inhoud |
| --- | --- |
| /algemene-voorwaarden | Actuele voorwaarden, versie, ingangsdatum en download |
| /privacy | Privacyverklaring, bewaartermijnen en knop Privacyverzoek |
| /handleiding | Spelhandleiding, aanmelden, support en accountbeheer |
| /support | Publiek formulier en support@dartspoint.nl, ook zonder account |
| /contact | Ondernemingsgegevens, contact en koppeling naar support |
| Footer en aanmeldscherm | Voorwaarden, privacy, help en Ontwikkeld door DG Webservices |
| Clubhuis en accountinstellingen | Mijn tickets, privacyverzoek en account verwijderen |
| Google en e-mailtemplates | Dezelfde openbare privacy- en voorwaardenlinks |

Pagina's voor voorwaarden, privacy, contact en support blijven bereikbaar bij gesloten registratie, een ban of een onderhoudsvenster voor gameplay. Tijdens een wedstrijd opent hulp zonder het spel te verlaten of een gedwongen pop-up over de werpbediening.

### Wijzigen vanuit platformbeheer
Platformbeheer krijgt Juridisch en informatie met de drie documenten en de contactgegevens. Elk document heeft titel, vaste URL, taal, tekst, versienummer, publicatiedatum, ingangsdatum, wijzigingssamenvatting en publicatiestatus. Een editor biedt koppen, lijsten, links, tabellen en voorbeeldweergave; geen vrij uitvoerbare HTML.

Een bewerking begint als nieuwe interne werkversie. Een gepubliceerde versie blijft ongewijzigd bewaard. Publiceren maakt een nieuwe versie actief; terugzetten maakt eveneens een nieuwe versie, zodat eerdere aanvaardingen controleerbaar blijven. Publieke teksten tonen alleen de gepubliceerde inhoud. Downloads bevatten exact die inhoud en versie. Inhoud en links worden veilig gerenderd en zijn leesbaar op mobiel en met toetsenbord.

Alleen bestaande bevoegde platformbeheerders kunnen inhoud beheren; de eigenaar of een expliciet gemachtigde publiceert juridische wijzigingen. De nieuwe ticketrol Platformbeheer geeft deze publicatiebevoegdheid niet automatisch. Elke wijziging en publicatie wordt gelogd.

Een tekstcorrectie vraagt geen nieuwe voorwaardenacceptatie. Een wezenlijke wijziging krijgt een begrijpelijke samenvatting en normaal minstens 30 dagen aankondiging; noodzakelijke beveiligings- of wettelijke wijzigingen kunnen eerder gelden met uitleg. Waar nieuwe aanvaarding nodig is, vindt die plaats vóór nieuwe deelname, nooit midden in een wedstrijd. Contact, privacyverzoeken en uitloggen blijven beschikbaar. Een privacyverklaring wordt meegedeeld; er komt geen verplicht vakje waarmee de gebruiker algemeen toestemming voor alle verwerking moet geven.

Bij registratie wordt de aanvaarde voorwaardenversie met gebruiker en tijdstip vastgelegd. De getoonde privacyversie wordt apart als informatievastlegging opgeslagen. Geen onnodige IP-opslag voor dit bewijs. Optionele marketingtoestemming blijft afzonderlijk en standaard uit.

## 3 Google aanmelden
Op inloggen en registreren staat Doorgaan met Google boven de bestaande e-mailcode. Een klik opent de officiële Google-aanmelding in hetzelfde venster en keert terug naar DartsPoint. Er komt geen automatische One Tap-pop-up.

Een bestaande gebruiker houdt zijn spelersnaam, DP-punten, vrienden, tickets, rechten en sancties. Een nieuwe gebruiker kiest een spelersnaam, bevestigt de minimumleeftijd en aanvaardt de voorwaarden. De echte Google-naam wordt nooit vanzelf de openbare spelersnaam. Google verstrekt via de gebruikelijke profielrechten mogelijk ook naam en afbeelding; die worden niet openbaar overgenomen.

Supabase beheert authenticatie en het koppelen van geverifieerde identiteiten. Dezelfde bevestigde e-mail via OTP en Google moet in de geteste standaardflow hetzelfde spelersaccount opleveren. Verschillende e-mailadressen worden niet automatisch samengevoegd. Zelfservice voor handmatig koppelen of ontkoppelen van verschillende accounts valt buiten deze sprint; support kan een veilig vervolgproces begeleiden.

De integratie gebruikt de bestaande serverauthenticatie met PKCE, een servercallback en strikt toegestane terugkeeradressen. Alleen openid, e-mail en basisprofiel zijn nodig; geen toegang tot Gmail, Drive, contacten of agenda. Geheimen blijven op de server. De provider-callback van Supabase en de terugkeerroute van DartsPoint worden afzonderlijk ingesteld voor staging en productie.

Gesloten registratie geldt ook voor Google, inclusief directe providerverzoeken. Bestaande spelers kunnen blijven inloggen. Incomplete onboarding kan worden hervat; terugkerende callbacks maken geen dubbele profielen of welkomstmails. Een geschorst of voor verwijdering afgesloten account krijgt geen gameplaytoegang door Google te gebruiken. Annuleren en storingen geven een duidelijke melding met e-mailcode als alternatief.

## 4 Rollen en bevoegdheden
Een geregistreerde speler kan meerdere teamrollen hebben. VIP en de bestaande spelerskleur blijven daarvan losstaan. Toewijzen en intrekken gebeuren in Gebruikers en teamrollen, met zoekfunctie, reden, datum en audit. Alleen de bestaande eigenaar of expliciet bevoegde beheerder mag dit doen; teamleden kunnen zichzelf niet verhogen.

| Teamrol | Nu actief | Bedoeld voor latere sprint |
| --- | --- | --- |
| Toernooienbeheer | Tickets binnen gekoppelde onderwerpen lezen, claimen en beantwoorden | Aangewezen toernooien beheren en hun toernooikamers modereren |
| Chatbeheer | Tickets binnen gekoppelde onderwerpen lezen, claimen en beantwoorden | Chat in alle kamers beheren |
| Spelbeheer | Tickets binnen gekoppelde onderwerpen lezen, claimen en beantwoorden | Chat en spellen in alle kamers beheren |
| Platformbeheer | Alle supportonderwerpen; privacyafhandeling met afzonderlijke bevoegdheid voor uitvoerende acties | Volledig platformbeheer |

De bestaande owner/admin-rechten blijven behouden en hun gebruikers worden herkenbaar aan Platformbeheer gekoppeld. Een nieuw toegekende rol schrijft niet stilzwijgend admin naar het bestaande rechtenmodel. Voor nieuwe teamleden toont het beheerscherm dat momenteel ticketrechten actief zijn. De rest van de applicatie blijft deze rollen negeren totdat de volgende sprint daarvoor expliciete bevoegdheden toevoegt.

Lezen of beantwoorden van een ticket geeft geen banbevoegdheid, inzage in alle privégesprekken, wijziging van uitslagen of bevoegdheid om persoonsgegevens te exporteren. Die acties hebben een afzonderlijke controle. Gegevensuitvoer en definitieve verwijdering zijn aanvankelijk voorbehouden aan de eigenaar of expliciet geautoriseerde bestaande platformbeheerders.

## 5 Onderwerpen en routering
Onderwerpen bepalen wie een ticket mag zien en beantwoorden. Een onderwerp koppelen aan een rol is een toegangsbesluit, niet alleen een e-mailinstelling. Meldingsvoorkeuren staan daarvan los. De bevoegdheden van meerdere teamrollen worden gecombineerd.

| Onderwerp | Toernooi | Chat | Spel | Platform |
| --- | --- | --- | --- | --- |
| Toernooien en divisies | Ja | Ja | Ja | Ja |
| Chat en gedrag | Nee | Ja | Ja | Ja |
| Wedstrijd en score | Nee | Nee | Ja | Ja |
| Ban of beperking en bezwaar | Nee | Nee | Ja | Ja |
| Account en aanmelden | Nee | Nee | Nee | Ja |
| Privacy en gegevensverzoeken | Nee | Nee | Nee | Ja |
| Technisch probleem | Nee | Nee | Ja | Ja |
| Idee of algemene vraag | Ja | Ja | Ja | Ja |
| Klacht over een teamlid | Nee | Nee | Nee | Ja |

Binnen privacy komen subonderwerpen inzage, kopie/export, correctie, account verwijderen, bepaalde gegevens verwijderen, bezwaar en beperking. De publieke keuze Onrechtmatige inhoud melden krijgt een afgeschermde behandeling door Platformbeheer. Een melding over acuut gevaar krijgt een duidelijke waarschuwing dat support geen noodhulpdienst is.

Platformbeheer kan onderwerpen aanmaken, ordenen, hernoemen, uitschakelen en aan rollen koppelen. Per onderwerp zijn omschrijving, benodigde velden, standaardprioriteit, reactiedoel en meldingsinstellingen instelbaar. Verwijderen gebeurt door archiveren zodat bestaande tickets behouden blijven.

Privacy, accountbeveiliging en klachten over teamleden hebben een beschermde minimumtoegang: de gewone onderwerpeditor kan die niet ineens zichtbaar maken voor alle rollen. Voor banbezwaren blijft de toegang beperkt tot Spelbeheer en Platformbeheer. Verruimen van andere toegang geldt standaard alleen voor nieuwe tickets. Toegang tot bestaande dossiers verruimen toont het aantal betrokken tickets en vraagt een bewuste bevestiging met audit. Intrekken geldt direct, ook voor open schermen, zoekresultaten, downloads en realtimekanalen.

Toernooientickets zijn in deze sprint, zoals gevraagd, voor alle vier rollen toegankelijk. Toewijzing aan een specifiek toernooi wordt wel opgeslagen als context, maar legt nu geen verborgen extra beperking op. Later kunnen aangewezen toernooien als extra toegangsscope worden toegevoegd.

Een behandelaar kan een ticket naar een passend onderwerp overdragen. Zodra dat een beperktere toegang geeft, verdwijnt het ticket bij onbevoegde teamleden. Persoonlijke gegevens worden niet in algemene teammails meegestuurd. Privacyvragen die onder een breed onderwerp binnenkomen worden zo snel mogelijk afgeschermd.

Een beschermd privacy-, accountbeveiligings- of klachtendossier wordt niet naar een algemeen onderwerp verplaatst. Een gewone supportsubvraag krijgt zo nodig een apart gekoppeld ticket met alleen de informatie die daarvoor nodig is. De koppeling zelf ontsluit het beschermde dossier niet.

Bestaande meldknoppen bij spelers en berichten blijven bestaan en maken een gekoppeld ticket met een moderatiezaak wanneer behandeling nodig is. De melding wordt niet als openbaar bericht naar de gemelde speler gestuurd. Het supportticket bevat alleen noodzakelijke context; toegang tot extra bewijs volgt de bestaande, apart gecontroleerde bevoegdheid. Dubbele technische verzending van dezelfde melding maakt geen dubbele dossiers.

## 6 Het ticketscherm voor spelers en team
In Mijn tickets ziet de speler uitsluitend eigen tickets met onderwerp, laatste reactie, status en ongelezenmarkering. Een melding in de notificatiebel opent de betreffende conversatie. In het spel blijft de melding compact; geen onderbreking van een worp en geen tickettekst in de openbare kamerchat.

Een nieuw ticket bevat onderwerp, korte titel, bericht en optionele bijlagen. Bij relevante onderwerpen kunnen kamer, wedstrijdnummer, toernooi of sanctie worden meegestuurd. Het systeem neemt de ingelogde identiteit over en vertrouwt geen zelf ingevuld gebruikers-ID. Een e-mailadres of gebruikersnaam van een andere speler geeft geen toegang tot diens ticket.

Het team krijgt een eigen Support-omgeving met Nieuw, Van mij, Wacht op speler, Wacht op team en Gesloten. Filters: onderwerp, status, behandelaar, leeftijd en urgentie. Zoeken werkt alleen binnen toegestane tickets. Het conversatiescherm scheidt Antwoord aan speler duidelijk van Interne notitie.

Iedere bevoegde medewerker kan een ticket openen. Eén medewerker claimt de behandeling. Twee gelijktijdige claims kunnen niet allebei slagen. Alleen de actuele behandelaar verstuurt normaal een openbaar antwoord. Een collega ziet de verantwoordelijke en kan een interne notitie toevoegen of met reden overnemen; Platformbeheer kan herverdelen. Openen alleen vergrendelt niet. Dubbel klikken op Verzenden maakt geen dubbel antwoord. Bij het intrekken van een rol gaan tickets waarvoor de behandelaar geen toegang meer heeft terug naar de bevoegde wachtrij.

Antwoorden verschijnen met de ingestelde echte voornaam, bijvoorbeeld Sanne van DartsPoint Support, en eventueel de teamrol. De voornaam moet zijn ingesteld voordat iemand kan antwoorden. Privé-e-mailadres en achternaam worden niet gepubliceerd. Intern worden de onveranderlijke medewerkers-ID, voornaam ten tijde van verzending en rol vastgelegd. Verzonden antwoorden blijven controleerbaar; een correctie wordt als nieuw bericht toegevoegd.

Platformbeheer kan antwoordsjablonen beheren per onderwerp, met veilige velden voor voornaam, ticketnummer en eventueel wedstrijd- of toernooinaam. Een sjabloon vult het antwoordveld en wordt door de medewerker gecontroleerd vóór verzending. Geen automatisch inhoudelijk besluit over een ban of privacyverzoek.

Interne notities gaan nooit naar de aanvrager, e-mailtemplates of diens gewone ticketexport. Een AVG-inzageverzoek kan wel persoonsgegevens in interne notities omvatten; Platformbeheer beoordeelt dan de toepasselijke rechten en beschermt gegevens van anderen. Bij een klacht over een medewerker wordt die persoon uitgesloten van de interne behandeling en het interne dossier, ook met de rol Platformbeheer. Die persoonsuitsluiting gaat vóór roltoegang. De eigenaar regelt herbeoordeling door een andere bevoegde persoon; bij een klacht over de eigenaar wordt een andere geschikte beoordelaar aangewezen. Eventueel wederhoor gebeurt via een afzonderlijk, beperkt bericht.

Bijlagen: maximaal 3 per bericht en 10 MB per bestand; PNG, JPG, WebP en PDF. Opslag is privé. Bestanden worden op werkelijke inhoud gecontroleerd en op malware gescand, en pas na controle beschikbaar gemaakt. Downloadrechten worden opnieuw getoetst; links verlopen snel. Geen externe afbeeldingen automatisch laden, geen SVG/HTML of uitvoerbare bestanden. Het formulier vraagt geen identiteitsbewijs en waarschuwt geen wachtwoorden of inlogcodes mee te sturen.

## 7 Ingelogde en uitgelogde afhandeling
### Ingelogde speler
Na indienen staat het ticket direct in Mijn tickets en ontvangt de speler een ontvangstbevestiging. Een teamantwoord verschijnt in de conversatie, maakt één ongelezen notificatie in DartsPoint en verstuurt één e-mail. E-mail bevat standaard een korte melding met een link naar het ticket, zodat gevoelige inhoud niet onnodig in mailboxen staat. Bij privacyverzoeken bevat mail alleen een neutrale melding.

De speler kan in het ticket antwoorden. Een antwoord op de notificatiemail naar support@dartspoint.nl kan ook aan hetzelfde ticket worden toegevoegd na veilige herkenning. De online inbox blijft het centrale overzicht. Gelezen status wordt per gebruiker bijgehouden; een mail openen markeert het ticket niet automatisch als gelezen.

### Uitgelogde aanvrager
Het publieke supportformulier vraagt voornaam, e-mailadres, onderwerp en bericht. Turnstile en snelheidslimieten beperken misbruik. Een korte mailcode of bevestigingslink controleert het adres zonder een DartsPoint-account aan te maken. Daarna krijgt de aanvrager een ticketnummer en ontvangt hij de openbare antwoorden per e-mail, ondertekend met de voornaam van de medewerker. Reply-To is exact support@dartspoint.nl.

Gewone supportvragen wachten op adresbevestiging voordat inhoudelijke informatie wordt gedeeld. Een ontvangen privacyverzoek of melding van onrechtmatige inhoud wordt wel meteen met ontvangsttijd geregistreerd en beschikbaar voor beoordeling; het onbevestigde adres is geen reden het verzoek kwijt te raken. Noodzakelijke identiteitscontrole gebeurt apart.

Een gebande gebruiker kan via een afgeschermde supporttoegang zijn eigen tickets blijven gebruiken, of de publieke e-mailroute kiezen. Deze toegang geeft geen spel-, chat- of kamerrechten. De gebruiker hoeft geen nieuw account te maken. Aanmelden met Google op dezelfde bestaande of gekoppelde identiteit behoudt de sanctie; een onbekend nieuw e-mailadres is zonder aanvullend detectiebeleid niet gegarandeerd als dezelfde persoon herkenbaar.

Gasttickets worden niet achteraf op basis van alleen een opgegeven e-mailadres aan een speler gehangen. Daarvoor zijn bevestiging van de mailbox en een expliciete koppelactie nodig. Bestaande vertrouwelijke correspondentie wordt nooit zichtbaar door alleen een gelijk e-mailadres in een formulier te typen.

### Inkomende mail
Nieuwe mail naar support@dartspoint.nl maakt een ticket in afgeschermde triage bij Platformbeheer; een geldige reply wordt aan de bestaande conversatie toegevoegd. Na beoordeling krijgt een nieuwe mail een passend onderwerp. Een ticketnummer in het onderwerp alleen geeft geen toegang. De combinatie van geverifieerde afzender, oorspronkelijke berichtreferenties en betrouwbare ontvangstgegevens bepaalt de koppeling. Bij twijfel volgt verificatie of een afgeschermde beoordeling zonder bestaande ticketinhoud terug te mailen. Nieuwe CC-adressen en doorgestuurde mails geven geen automatische toegang tot een bestaand dossier.

De huidige code gebruikt Resend voor applicatiemails. Het voorstel hergebruikt die verzendlaag. Voor ontvangst blijft support@dartspoint.nl het publieke adres. Als daar al een mailbox bestaat, wordt doorsturen naar een afzonderlijk geverifieerd ontvangstdomein ingericht. De bestaande MX-records voor het hoofddomein worden niet vervangen om één supportadres te koppelen. De mailboxprovider en forwarding moeten bij uitvoering worden vastgesteld.

De mailverwerking controleert webhookhandtekeningen, dubbele gebeurtenissen, berichtreferenties, bijlagen, autoresponders en mail-lussen. Een geldige webhook bewijst niet dat de oorspronkelijke afzender betrouwbaar is. Ontvangst wordt duurzaam vastgelegd vóór bevestiging aan de provider. Verzendfouten en bounces staan bij het ticket en gaan naar een herstelwachtrij. Geen automatische meervoudige antwoorden door retries.

## 8 Statussen meldingen en termijnen
De statussen zijn Nieuw, In behandeling, Wacht op speler, Wacht op team, Opgelost en Gesloten. Voor verwijderen staat daarnaast een afzonderlijke uitvoeringsstatus bij het privacyverzoek; een opgelost ticket bewijst niet dat de verwijdertaak klaar is.

Een antwoord van de speler opent een opgelost ticket opnieuw. Binnen 30 dagen na sluiting wordt hetzelfde ticket hervat; daarna kan een nieuw gekoppeld ticket ontstaan. Een wettelijke termijn wordt daarbij nooit opnieuw gestart. Gewone vragen krijgen als intern doel een eerste reactie binnen twee werkdagen; dit is geen gegarandeerde openbare reactietijd. Na zeven dagen wachten op de speler volgt een herinnering, na veertien dagen kan een gewone vraag sluiten met uitleg. Privacyverzoeken, actieve bezwaren en gemelde veiligheidsproblemen sluiten niet automatisch door inactiviteit.

Nieuwe tickets maken een taak, teller en ingamemelding voor de teamleden met een op het onderwerp bevoegde rol. Na claimen gaan vervolgmeldingen naar de behandelaar en expliciete volgers; andere bevoegden blijven het ticket kunnen zien. Platformbeheer kan kiezen voor directe e-mail of een overzicht voor teamleden. In meldingen staat geen onnodige gevoelige inhoud. Spelers krijgen bij een teamantwoord altijd de gevraagde melding in DartsPoint en per e-mail; bij uitgelogde aanvragers alleen e-mail. Ticketmails zijn dienstberichten; open- en kliktracking staan uit.

Een privacyverzoek krijgt vanaf ontvangst een wettelijke kalendertermijn van één maand, met herinneringen en escalatie. Dit is geen vaste termijn van 30 dagen. Verlenging met maximaal twee extra maanden kan alleen waar de AVG dat toestaat, met een gemotiveerde melding binnen de eerste maand. Een behandelaar moet de reden vastleggen. Een open identiteitsvraag, onderwerpwijziging of ticketverplaatsing zet de teller niet vanzelf stil.

## 9 Account sluiten en gegevens verwijderen
### Aanvragen en bevestigen
Instellingen toont Account en privacy met Mijn gegevens opvragen, Gegevens laten corrigeren, Gegevens laten verwijderen en Account verwijderen. Elke keuze maakt een afgeschermd privacyticket. De speler ziet wat verdwijnt en wat beperkt kan blijven bestaan, en hoeft geen reden voor accountverwijdering te geven.

Voor een volledige accountverwijdering volgt een recente herauthenticatie en een afzonderlijke bevestiging via de geverifieerde mailbox. Alleen een bestaande sessie of een losse e-mail met de tekst verwijder mijn account is onvoldoende voor een onomkeerbare actie. Als iemand de mailbox niet meer heeft, beoordeelt Platformbeheer proportioneel ander bewijs; geen standaard identiteitsbewijs uploaden. De wettelijke aanvraag wordt intussen wel geregistreerd.

Na bevestiging wordt het account direct voor spelen en chat afgesloten, verdwijnt de openbare profielvermelding en worden actieve sessies en OAuth-toegang ingetrokken. Een actieve wedstrijd wordt volgens de bestaande regels beëindigd of administratief afgehandeld, zonder de persoonsgegevens langer te bewaren omdat er nog een toernooi loopt. Open uitnodigingen en toekomstige deelname worden geannuleerd. De aanvraag is nog via geverifieerde e-mail te volgen. Er geldt geen verplichte afkoelperiode.

Een gegevenskopie kan vooraf worden aangevraagd. De keuze daarvoor is optioneel en mag verwijdering niet zonder reden vertragen. Voor de normale uitvoering is zeven dagen na identiteitsbevestiging het interne doel. Verzoeken worden zonder onnodige vertraging behandeld en de wettelijke reactietermijn blijft bewaakt.

### Uitvoering en controle
De verwijderprocedure is een hervatbare taak met controle per gegevenscategorie. Deze wist of ontkoppelt profielgegevens, voorkeuren, vriendenrelaties, aanwezigheid, notificaties, concepten, eigen chatinhoud, provideridentiteiten, relevante e-mailpayloads en persoonsgegevens in bestanden en tickets. Bij chatverwijdering worden zowel tekst als genormaliseerde tekst verwijderd; alleen verbergen is niet genoeg. Bewijskopieën en zoekindexen worden afzonderlijk beoordeeld.

Wedstrijdresultaten van tegenstanders en toernooien mogen niet stukgaan. Het publieke profiel en de naamkoppeling verdwijnen; alleen noodzakelijke minimale wedstrijdgegevens blijven maximaal 24 maanden na de wedstrijd beschikbaar voor historie, competitiecontrole en geschillen. Een deelnemerscode of unieke wedstrijdhistorie kan nog herleidbaar zijn en wordt dus niet ten onrechte anoniem genoemd. Overige technische worpdetails worden bij accountverwijdering verwijderd, tenzij specifiek nodig als afgeschermd bewijs. Werkelijk onomkeerbare totalen zonder individuele koppeling kunnen blijven bestaan.

Een lopend geschil, rechtsvordering of geldige sanctie kan een beperkte uitzondering rechtvaardigen. De medewerker legt per categorie doel, grondslag, gegevens, toegang en herbeoordelingsdatum vast. Een actieve ban kan met een minimaal controlekenmerk worden gehandhaafd; ook een gehashte e-mail blijft hierbij een persoonsgegeven. Het volledige account blijft niet voor de zekerheid bestaan. Actieve sanctieregisters worden ten minste ieder halfjaar beoordeeld.

De procedure omvat Supabase Auth en bestaande sessies, de applicatiedatabase, privébestanden, uitgaande mailwachtrijen, tijdelijke exports en relevante verwerkers. Een verdwenen auth-gebruiker kan nog een eerder uitgegeven JWT hebben: gevoelige routes, de supportomgeving en directe datatoegang moeten daarom opnieuw controleren of account en sessie nog geldig zijn. Realtimeabonnementen en caches verliezen toegang bij afsluiting. Alleen een status deleted of een oproep naar deleteUser is geen volledige uitvoering.

Na controle ontvangt de aanvrager per e-mail een korte bevestiging: wat is verwijderd, welke beperkte gegevens eventueel overblijven, waarom en tot wanneer, en wat de maximale back-upuitloop is. De taak en de melding hebben afzonderlijke statussen; een mailstoring maakt een geslaagde verwijdering niet ongedaan en leidt niet tot een dubbele uitvoering.

### Andere privacyverzoeken
Inzage/export omvat persoonsgegevens in account, spel, chats, tickets en relevante registraties. Gegevens van anderen, beveiligingsgeheimen en vertrouwelijke melders worden zorgvuldig afgeschermd; eigen persoonsgegevens in interne notities worden inhoudelijk beoordeeld. Download gaat via een privébestand met herauthenticatie of een eenmalige gastverificatie, is maximaal zeven dagen beschikbaar en bevat geen publiek deelbare permanente link. De tijdelijke kopie wordt daarna gewist.

Een gedeeltelijk verwijderverzoek kiest de gewenste categorieën; accountsluiting is niet verplicht om een privacyrecht uit te oefenen. Bezwaar tegen openbare ranglijsten en beperking van verwerking krijgen een menselijke beoordeling. Een afwijzing bevat uitleg en informatie over een klacht bij de Autoriteit Persoonsgegevens en de mogelijkheid naar de bevoegde rechter te gaan. Ook een rechtstreeks ontvangen e-mail wordt intern als ticket behandeld: gebruikers worden niet afgewezen omdat zij het formulier niet hebben gebruikt.

## 10 Bewaarbeleid
Dit zijn voorgestelde bedrijfskeuzes voor de nieuwe inrichting, geen wettelijke standaardtermijnen. De privacyverklaring gebruikt dezelfde termijnen. Dagelijkse opschoning, controle op maximale leeftijd en storingsmeldingen maken het beleid uitvoerbaar. Een gerechtvaardigde bewaarexceptie is specifiek, tijdelijk en aantoonbaar.

| Gegevens | Normale bewaartermijn |
| --- | --- |
| Actief account en actuele spelstatistieken | Zolang het account gebruikt wordt; verwijderen op verzoek |
| Onvoltooide registratie | 30 dagen zonder afronding |
| Inactief account | Na 24 maanden waarschuwen; 30 dagen om actief te blijven vóór verwijdering |
| Kamerchat en wedstrijdchat | 90 dagen na het bericht |
| Privéberichten | 12 maanden na ieder bericht |
| Chatconcepten | 7 dagen na laatste wijziging |
| Technische worpgegevens | Maximaal 12 maanden; korter bij accountverwijdering tenzij noodzakelijk bewijs |
| Minimale wedstrijdresultaten na accountverwijdering | Maximaal 24 maanden na de wedstrijd |
| Gewone tickets en bijlagen | 12 maanden na sluiting |
| Privacyticket en bijlagen | Inhoud 6 maanden na afronding; minimaal afhandelbewijs tot 24 maanden na afronding |
| Onbevestigde gewone gasttickets | 7 dagen; privacy- en juridische meldingen blijven afzonderlijk beoordeeld |
| Moderatiebewijs en bezwaar | 12 maanden na afronding; actieve sanctie alleen noodzakelijke kerngegevens met halfjaarlijkse beoordeling |
| Technische logs en bezoekregistraties | Maximaal 30 dagen |
| E-mailbezorgmetadata | 90 dagen |
| Ruwe binnenkomende mail en kopie in supportmailbox | 30 dagen nadat deze veilig in het ticket is verwerkt |
| Tijdelijke export | 7 dagen |
| Beheer- en beveiligingsaudit | 12 maanden, zonder onnodige berichtinhoud |
| Bewijs voorwaardenacceptatie | Tijdens accountduur en maximaal 24 maanden na einde; alleen minimale bewijsvelden |
| Vrijwillige updates | Tot afmelding; minimale afmeldregistratie maximaal 24 maanden |
| Back-ups | Hoogstens 30 dagen uitloop na verwijdering uit actieve systemen |

De huidige back-upconfiguratie met 14 dagelijkse, 8 wekelijkse en 12 maandelijkse snapshots past niet bij deze 30 dagen. Het nieuwe beleid vereist een expliciete maximale leeftijd, werkelijke verwijdering van oude back-updata en controle van eventuele Supabase-back-ups en herstelpunten. Alleen minder snapshots instellen is onvoldoende. Na een herstel worden verwijderingen en verlopen bewaartermijnen opnieuw toegepast voordat de applicatie beschikbaar komt. Het minimale herstelregister blijft tot het laatste relevante herstelpunt is verlopen en wordt daarna gewist, uiterlijk zeven dagen later.

Een uitzondering voor een concreet geschil, een rechtsvordering of wettelijke verplichting krijgt een doel en eind-/herbeoordelingsdatum; deze rechtvaardigt geen onbeperkte algemene opslag. Bij accountverwijdering geldt de verwijderbeoordeling boven de gewone bewaartermijnen: gewone supportinhoud blijft bijvoorbeeld niet automatisch nog een heel jaar bewaard omdat dat de standaard is. Zelfstandige verwerkingen door Google en Cloudflare vallen onder hun eigen beleid en worden niet als door DartsPoint gewist beloofd.

## 11 Technische samenhang
De bestaande code heeft Supabase-authenticatie, rollen owner/admin/vip/player, notificaties en een mailwachtrij met Resend. Nieuwe teamrollen worden als aparte toekenningen met expliciete ticketbevoegdheden toegevoegd. Huidige gameplay-gates voor admin worden niet hergebruikt als algemene toegang tot tickets. De nieuwste onderzochte main is d2433d911e9e960b7e74abb4614409e40f38f118; de twee commits na de eerdere controle betreffen vooral spelersteksten en aantallen.

De uitbreiding heeft gegevensgroepen voor teamrollen, onderwerpen en rolkoppelingen, tickets, deelnemers, openbare berichten, interne notities, bijlagen, toewijzingen, gebeurtenissen, e-mailkoppelingen en notificaties. Privacyverzoeken hebben daarnaast identiteitscontrole, wettelijke deadline, beslissing, bewaarexcepties en uitvoertaken. Documenten hebben onveranderlijke versies en aanvaardingsregistraties.

Elke API, databasepolicy, bestandsdownload en realtime-inschrijving controleert actuele toegang. Een verborgen menu is geen beveiliging. Geheime sleutels blijven servermatig. Berichten en bijlagen komen niet in publieke projecties, zoekindexen of logs. Nieuwe toekenningen en intrekkingen werken zonder dat een oude browsersessie nog langdurig toegang houdt. Gevoelige uitvoer- en verwijderhandelingen vragen recente herauthenticatie. De bestaande eigenaar mag zichzelf niet buitensluiten en de laatste eigenaar kan niet per ongeluk worden verwijderd.

E-mail, notificaties, exports en verwijdertaken gebruiken duurzame wachtrijen met unieke gebeurtenissleutels, herhaalbare verwerking en een zichtbare foutstatus. Dagelijkse retentietaken verwerken kleine batches buiten het pad van een worp. Grote exports en bijlagenverwerking mogen geen gameplayvertraging veroorzaken.

## 12 Wat deze gecombineerde sprint moet opleveren
De sprint omvat de openbare documenten en editor, versieacceptatie, Google-login, teamroltoekenning voor tickets, de volledige supportinbox, publieke formulieren, inkomende en uitgaande mail, notificaties, privacyverzoeken, export/verwijdertaken en uitvoerbaar bewaarbeleid. De verdere chat-, spel- en toernooibevoegdheden blijven buiten deze sprint. Een banbezwaar kan dus worden beantwoord, maar een nieuw teamlid krijgt daardoor nog geen knop om de ban op te heffen.

De logische bouwvolgorde is: rechten en onderwerpmodel; documenten en onboarding; Google; tickets en notificaties; inkomende mail; privacytaken en retentie; gezamenlijke controle op staging. De publieke privacytekst gaat pas live wanneer de beschreven processen werken. De eigenaar beoordeelt de werking op staging vóór productiepublicatie.

### Aantoonbare acceptatie
1. Een ticket over toernooien is voor alle vier rollen zichtbaar; een banbezwaar uitsluitend voor Spelbeheer en Platformbeheer; een privacyticket uitsluitend voor Platformbeheer.
2. Een toegekende teamrol geeft geen bestaande admin-, chat-, spel- of toernooi-acties cadeau. Intrekken werkt ook bij een open ticket en een bestaande downloadlink.
3. Twee medewerkers kunnen niet tegelijk eigenaar van dezelfde claim worden. Een dubbel verzonden verzoek geeft maar één bericht en één e-mail.
4. Een ingelogde speler krijgt een teamantwoord in Mijn tickets, een ingamemelding en e-mail. Een gast krijgt het antwoord per mail en kan via support@dartspoint.nl reageren zonder spelersaccount.
5. Een gestolen ticketnummer of vervalste afzender ontsluit geen correspondentie. Bijlagen blijven privé. Interne notities komen niet in gewone spelersreacties terecht.
6. Een gebande speler kan eigen bezwaar en privacyverzoek indienen, maar niet via die route spelen of chatten.
7. OTP en Google met dezelfde bevestigde identiteit behouden hetzelfde account. Gesloten registratie, sancties, voorwaardenacceptatie en minimumleeftijd worden in beide routes afgedwongen.
8. Een verwijdering verwijdert ook verborgen chattekst, bewijskopieën waar geen uitzondering geldt, zoek-/cachekopieën en providerkoppelingen. Wedstrijdresultaten van anderen blijven bruikbaar met minimale gegevens.
9. Een eerder uitgegeven sessietoken geeft na afsluiting geen toegang tot gevoelige data. Een mislukte verwijdertaak hervat zonder gegevens opnieuw aan te maken.
10. Een herstelproef uit back-up brengt gewiste gegevens niet opnieuw online. Maximumleeftijden worden werkelijk gemeten.
11. Juridische documenten blijven zonder login bereikbaar; eerdere versies en acceptaties zijn aantoonbaar. De Cloudflare-link werkt.

## 13 Gegevens voor de uitvoering
Het voorstel legt de productkeuzes vast zonder open tekstvelden in de publieke documenten. Voor de daadwerkelijke publicatie zijn wel de juiste bedrijfsgegevens op de contactpagina nodig. De volledige juridische ondernemingsnaam, het vestigingsadres en het KvK-nummer zijn hier niet geverifieerd en worden niet gegokt. Het weglaten van het btw-nummer uit deze drie documenten betekent niet automatisch dat eventuele andere informatieplichten vervallen.

Daarnaast moet bij uitvoering worden vastgesteld welke mailboxprovider support@dartspoint.nl ontvangt, of Resend de actuele verzender blijft, welke Supabase-regio en back-upinstellingen actief zijn, en welke verwerkersafspraken en internationale doorgiftemechanismen gelden. De privacytekst noemt e-maildienstverleners als categorie en belooft geen uitsluitend Nederlandse of Europese verwerking. Een ontbrekende providerinstelling wordt vóór publicatie opgelost en komt niet als invulveld op de publieke pagina.

De voorgestelde minimumleeftijd, bewaartermijnen en toernooitickettoegang zijn expliciete keuzes in dit ontwerp. Dit pakket is nog geen Codex-opdracht en wijzigt de live dienst niet.

## 14 Bronnen en toetsing
De aanbevelingen sluiten aan op de onderzochte repository dartspoint/platform en op primaire bronnen, gecontroleerd op 15 oktober 2026. De broncodecontrole omvatte auth, onboarding, rollen, notificaties, worker/mail, chat/moderatie en back-ups; providerdashboards en productiegegevens zijn niet ingezien.

- [AVG artikelen 5, 6, 12 tot en met 22 en 28](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [Autoriteit Persoonsgegevens over privacyrechten in de praktijk](https://autoriteitpersoonsgegevens.nl/themas/basis-avg/privacyrechten-avg/voor-organisaties-privacyrechten-in-de-praktijk)
- [ACM over bedrijfsgegevens vermelden](https://www.acm.nl/nl/verkoop-aan-consumenten/consumenten-informeren/bedrijfsgegevens-vermelden)
- [Cloudflare Turnstile Privacy Addendum](https://www.cloudflare.com/en-gb/turnstile-privacy-policy/)
- [Cloudflare over onzichtbare widgets](https://developers.cloudflare.com/turnstile/concepts/widget/)
- [Supabase Google-login](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase verwijderen en sessies](https://supabase.com/docs/guides/auth/managing-user-data)
- [Resend ontvangen met behoud van bestaand maildomein](https://resend.com/docs/dashboard/receiving/custom-domains)
