# Documenten, Google, support en privacy — 15 oktober 2026

## Resultaat en publicatie

De aangeleverde uitwerking versie 2 is uitgevoerd als één samenhangende uitbreiding. De volledige bronteksten staan onder `reference/documents-google-tickets-2026-10-15`. Contactgegevens: DG Webservices, Markenseplein 1, 2583 KR Den Haag, KvK 88135713, info@dgwebservices.nl. Support blijft support@dartspoint.nl.

De aangeleverde juridische versies worden intern opgeslagen en niet door een migratie gepubliceerd. De eigenaar beoordeelt de werking op staging en legt de externe provider- en bewaarinstellingen vast voordat de teksten worden gepubliceerd. De nieuwe ticketrol Platformbeheer geeft geen juridische publicatiebevoegdheid. De bestaande productieapplicatie en de geplande opening worden met deze staginguitrol niet vervangen.

## Gebruikers en team

- Publieke voorwaarden, privacyverklaring, handleiding en contactpagina, download van exact de gepubliceerde tekst en veilige mobiele weergave. De editor bewaart onveranderlijke versies, wijzigingen, aankondigingen en eerdere aanvaardingen. Nieuwe acceptatie blokkeert nieuwe deelname, niet een lopende wedstrijd of toegang tot support.
- Google via een bewuste klik, server-PKCE en gecontroleerde terugkeerroute. Nieuwe spelers kiezen zelf hun spelersnaam en bevestigen 16+ en de voorwaarden. Gesloten registratie wordt ook in de Auth-database afgedwongen. Bestaande profielrechten en sancties blijven gelden.
- Mijn tickets, publiek gastformulier met mailboxverificatie, afzonderlijke teaminbox, onderwerpen en vier ticketrollen. Persoonlijke dossieruitsluiting gaat vóór roltoegang; intrekken wordt ook bij open schermen en downloads gecontroleerd. Nieuwe teamrollen wijzigen geen bestaande spel- of moderatierechten.
- Claimvergrendeling, idempotente berichten, interne notities, medewerkersvoornaam, sjablonen, statussen, volgers en meldingen. Bestaande moderatiemeldingen maken één gekoppeld privé-ticket, ook bij dubbele verzending.
- Afgeschermde bijlagen, inhoudscontrole en echte ClamAV-scan vóór vrijgave. Ondertekende inkomende mail wordt duurzaam opgeslagen; onzekere afzenders en berichtkoppelingen gaan naar triage. De medewerkersweergave toont mailstatus en gecontroleerd herstel zonder adressen of berichtinhoud te lekken.
- Privacyaanvragen bewaren de oorspronkelijke ontvangst en kalendertermijn. Inzage/export, proportionele beoordeling van gastidentiteit, afzonderlijke bevestiging, recente herauthenticatie, categoriegebonden beslissingen, onderbouwde bewaarexcepties en hervatbare verwijdering zijn aangesloten op de inbox.

## Uitvoering en herstel

Mail, scans, exports, termijnen en retentie draaien in een afzonderlijke supportwerkservice buiten de werplus. Accountsluiting trekt sessies in en handelt een actieve wedstrijd volgens de bestaande regels af. Gedeeltelijke technische verwijdering wacht op een actieve wedstrijd. Auth-verwijdering bewaart minimale resultaten van tegenstanders zonder de speler als anoniem te presenteren.

Een minimale verwijdermarkering wordt eerst met Restic versleuteld opgeslagen en teruggelezen. Daarna pas mag de verwijdertaak uitvoeren. Een verlopen markering moet opnieuw duurzaam worden vastgelegd; een oude uploadbevestiging kan een vernieuwde markering niet goedkeuren. Een oude back-up wordt met onafhankelijk opgehaalde markeringen en retentie hersteld vóór vrijgave. Applicatierechten op de herstel- en uitvoertabellen worden opnieuw beperkt.

Databaseback-ups krijgen een harde kalenderleeftijd met echte verwijdering van verlopen snapshots en ongebruikte data. Het minimale herstelregister blijft maximaal 37 dagen. Nieuwe runtime- en operatielogs worden op datum verwijderd. Terugschakelen naar een oudere release ondersteunt de oorspronkelijke logconfiguratie; de nieuwe logbewaartermijn geldt voor releases met de nieuwe launcher.

De beheerde hostupdate wijzigt de staging-Compose en staging-retentietimers. De actieve Caddy-routering op de VPS bevestigt dat de stagingwebpagina’s nu al openbaar bereikbaar zijn; die bestaande bereikbaarheid en de volledige Caddy-inhoud blijven bij deze herkende inrichting behouden, zonder reload. Een bestaande Tailscale-inrichting krijgt uitsluitend een uitzondering voor de exacte POST-webhookroute. De afzonderlijke realtimehostblokken blijven behouden. Er worden geen productie-Compose, productiehostblokken, productietimers of applicatieprocessen door het installatiescript vervangen of herstart. Gedeelde beheerscripts worden onder beide deploymentlocks bijgewerkt, met privé-rollbackkopie.

## Aangetoonde controles

De controles gebruiken lokale eigen testdata, echte PostgreSQL/Supabase Auth, Mailpit en afzonderlijke wegwerpcontainers. Er is geen mail naar externe spelers verzonden.

| Controle | Vastgesteld |
| --- | --- |
| TypeScript en productiebuild | Geslaagd |
| Unittests | 78 geslaagd |
| Beheerde deployment en rollback | 49 geslaagd, inclusief echte Compose-samenvoeging voor oude en nieuwe images |
| Juridische versies en gesloten registratie | Database-integratie geslaagd |
| Ticketrechten en mailherstel | 69 databasecontroles geslaagd |
| Bewaarbeleid | 36 databasecontroles geslaagd |
| Privacy, herauthenticatie en identiteit | Echte lokale Auth-/mail-/database-integratie geslaagd |
| Verwijdering, concurrente exports en hervatten | Database-integratie geslaagd |
| Ontvangstherstel en afzonderlijke termijnmeldingen | Echte database- en klokovergangtest geslaagd |
| Oud databaseherstel plus latere verwijdermarkering | Echte pg_dump, versleutelde Restic en restore-db.py geslaagd |
| Restic maximumleeftijd en omgevingsscheiding | Echte versleutelde lokale repository geslaagd |
| Bijlagenscanner | Echte schone scan en EICAR-weigering geslaagd |
| Mobiele en toetsenbordbediening, gast en team | 13 browsercontroles geslaagd |
| Mailstatus en afscherming herstelpaneel | 4 browsercontroles geslaagd met echte Mailpitmail |
| Webhookgrens en bestaande openbare staging | 13 echte lokale Caddy-HTTP-controles over beide inrichtingen geslaagd |
| Zelfstandige worker-image | Echte PNG-metadata en supportworker-import geslaagd in de gepinde Node-container, zonder netwerk of ontwikkelafhankelijkheden, met alleen-lezen root en privé logvolume |

Supabase database-lint meldt geen errors. De bestaande retentiefunctie geeft één waarschuwing over de expliciet getypeerde JSONB-initialisatie; de daadwerkelijke database-uitvoering van de retentietests slaagt. De oorspronkelijke aangeleverde assets en beschermde stijlprefixen zijn behouden. De hostupdate herkent ook echte `caddy fmt`-uitvoer zonder de bestaande toegangsregels te verruimen. Bestaande testaccounts ruimen hun eigen juridische acceptaties op voordat hun tijdelijke profiel wordt verwijderd; de productiebeperkingen blijven gelden. De uitnodigingstest controleert zowel geldige levering vóór annulering als geweigerde levering daarna; de testopruiming wordt met de bestaande transactievergrendeling geordend.

De eerste staginguitrol werd automatisch teruggedraaid doordat de supportworker een ontbrekende native Sharp-bibliotheek niet kon laden. De zelfstandige workerbundel bevat nu uitsluitend de zes benodigde, vergrendelde runtimepackages. Elke worker-imagebuild controleert de echte bijlagenbibliotheek en de supportworker onder de productiegebruiker zonder netwerk; testlogs worden verwijderd vóór publicatie. Hiervoor is geen verdere hostupdate of schemawijziging nodig.

## Nog te bevestigen op staging en bij providers

De concrete stappen en callbacks staan in [GOOGLE-SUPPORT-EN-PRIVACY-INRICHTING.md](GOOGLE-SUPPORT-EN-PRIVACY-INRICHTING.md).

- De eigenaar heeft Google voor staging ingericht en GOOGLE_AUTH_ENABLED=true gezet; de publieke Supabase-providerinstelling is gecontroleerd. Een echte eigenaarstest met dezelfde mailbox via OTP en Google blijft nodig voor provideracceptatie.
- Resend-ontvangstdomein, geverifieerde DNS, tracking uit en webhookevents moeten met de nieuwe environmentinstellingen worden bevestigd. De echte Hostnet-supportmailbox wordt pas naar productie doorgestuurd als de productie-inrichting is beoordeeld. Test staging rechtstreeks met het aparte ontvangstadres.
- De nieuwe server-CAPTCHA- en webhooksecrets worden niet uit GitHub teruggelezen. Een ontbrekende providerconfiguratie blokkeert de betreffende functie en wordt niet als geslaagde inrichting weergegeven.
- Werkelijke Supabase-back-up/PITR-retentie, Hostnet-kopieën en verwerkersafspraken vragen providerbewijs; de applicatie kan dit niet uit een database-URL afleiden.
- Na installatie van de beheerde hostupdate volgen stagingdeployment, release-/readinesscontrole en de echte post-migratie backup-/herstelpoort. Productiepublicatie volgt pas na beoordeling van de eigenaar.
