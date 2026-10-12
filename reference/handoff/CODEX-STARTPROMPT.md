# Hoofdopdracht voor Codex op de development-VPS

Je gaat DartsPoint volledig bouwen voor echte gebruikers en multiplayer. Het absolute pad van dit uitgepakte overdrachtspakket is door de gebruiker beschikbaar gesteld. Begin met `00-LEESMIJ.md`, `MANIFEST.json`, alle documenten in `docs/` en de bestaande `AGENTS.md`-regels van de doelrepository. Controleer het pakket met `python3 verify-package.py`.

## Opdracht en resultaat

Neem **exact dezelfde UI en UX** over uit `source-sites/`: marketing, e-mail/OTP-flow, eerste gebruikersnaam, lobby, vrienden, berichten, kamers, speelveld, ranking, toernooien, divisies, profiel, instellingen, oefenen, PWA en volledig platformbeheer. Dit is een implementatieopdracht, geen nieuwe designopdracht. Gebruik bestaande componenten, stylesheetregels, lettertypen en assets als bron. Bouw echte persistence en realtime functionaliteit achter dezelfde presentatie.

De volledige productieapp wordt eerst op de **development-VPS** gebouwd. Als alles gebouwd en getest is, commit en push je naar de door de gebruiker bedoelde GitHub-repository op **main**. Maak niet zelf een andere repository en verzin geen remote-URL. Gebruik een bestaande geverifieerde remote; ontbreekt die, rond het lokale werk eerst af en vraag alleen die ontbrekende bestemming. De gebruiker maakt later staging/production en vult de GitHub Environments met credentials.

Na inrichting geldt: merge naar **staging** → gevalideerde deployment door self-hosted staging-runner; merge naar **production** → gevalideerde deployment door aparte self-hosted production-runner. Geen automatische deployment vanaf main, geen productie-secrets op development, geen PR-code uitvoeren met een deploymentrunner.

## Eerst inspecteren, daarna bouwen

1. Lees de hele overdracht en inspecteer beschikbare RAM/CPU/schijf, Docker, Caddy, poorten, bestaand Git-werk en bestaande services. Behoud andere projecten en niet-gerelateerde wijzigingen.
2. Leg het exacte source-SHA, gekozen runtimeversies en het doelpad vast. Houd de originele `source-sites/` als onveranderde referentie buiten productiecode.
3. Controleer welke gepinde packages uit de Sites-lockfile via de publieke registry verkrijgbaar en voor native Next.js compatibel zijn. Behoud ze waar mogelijk. Kies bij een concrete incompatibiliteit de dichtstbijzijnde geschikte stabiele versie, leg de afwijking vast en voer de volledige visuele vergelijking uit. Gebruik geen ongemotiveerde `latest`-upgrades.
4. Maak een uitvoerplan en voer dat uit. Ga autonoom door met omkeerbaar werk. Ontbrekende stagingcredentials blokkeren niet het bouwen en testen tegen lokale Supabase/mailopvang. Rapporteer een echte blokkade concreet; vervang functionaliteit niet door mockdata om een vinkje te kunnen zetten.

## Vaststaande stack

Gebruik native Next.js/React/TypeScript voor `apps/web`, Colyseus/Node voor `apps/realtime`, en zo nodig `apps/worker` voor duurzame achtergrondtaken. Deel pure spelregels, schema's, autorisatiecontracten en mailtemplates via `packages/`. Gebruik managed Supabase Auth en PostgreSQL, Redis intern, Resend voor transactionele mail, Caddy en Docker Compose. Verwijder de Sites/Vinext/Cloudflare-runtimeafhankelijkheid uitsluitend uit de **doelapp**, niet uit de referentiebron.

De `ops/`-bestanden zijn bruikbare doelconfiguraties en geen bewijs dat de genoemde services al bestaan. Maak ze passend bij jouw daadwerkelijke packagepaden/commands, valideer ze en voltooi alle contracten waarnaar ze verwijzen. Geen dummy-healthcheck of stub die altijd 200 teruggeeft.

## Echte authenticatie

- Eén flow voor registratie en inloggen: e-mailadres → 6-cijferige OTP per mail → verificatie → alleen bij eerste login unieke gebruikersnaam → lobby.
- Supabase `.Token`-mailtemplate gebruiken, geen magic-linkflow als vervanging. Configureer codegeldigheid op 600 seconden, resendtermijn van minimaal 60 seconden en passende server-side abusebeveiliging. Test verkeerde, verlopen, hergebruikte en vervangen codes en providerfouten.
- Geen wachtwoordveld. Geen eigenaar selecteren tijdens registratie. Geen client-side lokale vlag als toegangscontrole.
- Eerste gebruikersnaam atomair en hoofdletterongevoelig uniek reserveren. Normale nieuwe speler: witte naam, voorlopige witte rating 1500. Auth-UUID blijft de identiteit bij naamswijzigingen.
- Verifieer sessies server-side. Bescherm API, database en Colyseus óók als iemand UI-knoppen omzeilt.
- Maak een eenmalige owner-bootstrap voor een expliciet geverifieerde auth-UUID/e-mailadres, met audit en uitschakeling na gebruik. Neem geen e-mailadres uit voorbeelddata over. De gebruiker levert de bedoelde identiteit via de aangegeven beveiligde configuratie.

## Realtime spel en integriteit

- Colyseus bepaalt kamerrechten, actieve speler, worpfase, positie/score, dubbel-in/-uit, busts, legs, sets en einduitslag.
- De browser mag geen zelfgekozen score, hitpositie, winnaar, Elo-delta of toernooiresultaat vaststellen. De bestaande client-x/y-fair-playroute is geen productie-anticheat.
- Behoud de automatisch bewegende horizontale/verticale balken, tweestaps gooiknop, vliegende pijl, chip op impact, checkoutregel en scoretabel exact. Synchroniseer de animatie met door de server vastgelegde impact; de animatiecallback beslist niet of er punten zijn verdiend.
- Sequenties, idempotency en databaseconstraints voorkomen dubbele worpen, dubbele eindafhandeling en dubbele Elo-mutaties. Herstellen na reconnect levert dezelfde toestand op.
- Maak vrienden, aanvragen, blokkeren, persoonlijke mute, kamer-/spelchat en afsluitbare privégesprekken echt. Gesloten privéchattab bewaart geschiedenis; de lobby bevat geen kamerchat en de vriendenpagina geen inbox.
- Toernooi-/divisiewedstrijden komen uit de planner en kunnen niet vrij worden vervangen door een spelersuitnodiging. Alleen ingeschreven spelers spelen in toernooikamers; toegestane toeschouwers blijven welkom.
- Maak no-show, terugtrekking, disconnect, verlaten en administratieve afhandeling expliciete toestanden met deadlines en audit. Geen fictieve gespeelde statistieken of gewone Elo-winst voor een administratieve walkover.
- Maak alle platformbeheeracties server-authorized. VIP is geen beheerdersmacht. Respecteer hiërarchie, kamermoderatorscope en bescherming van owner/laatste owner.

## Alle functies afmaken

Werk het functionele canon integraal af. Houd een traceabilitymatrix met per eis: broncomponent, productieadapter/API, opslag, autorisatie, test en status. Het verwijderen van een knop of verbergen van een nog niet gebouwde functie telt niet als implementatie. Gebruik geen hardcoded Nick/Bullseye, nep-vrienden, localStorage als database of gefingeerde publieke events in productie.

De openbare homepage haalt alleen toegestane gepubliceerde data op. Geen admininformatie, e-mailadressen of privéberichten in openbare props/caches. Maak canonicals, sitemap, share-afbeeldingen en mailasset-URL's omgevingcorrect; productie is dartspoint.nl, staging is noindex. dartspoint.app wordt pas apart geactiveerd nadat redirects, cookiegrenzen en herauthenticatie expliciet zijn ingericht.

## Exactheid controleren

Maak eerst screenshots van de onaangepaste referentie op desktop en mobiel en leg de interactiestaten vast. Vergelijk daarna de doelapp op dezelfde viewports, fonts en data. Controleer minimaal 360×800, 390×844, 768×1024, 1366×768 en 1920×1080, plus 320 px, landscape, virtueel toetsenbord en PWA safe areas. Draai Playwright keyboard-/flowtests en screenshotvergelijkingen. Verander geen zichtbare presentatie om een screenshottest gemakkelijker groen te krijgen.

Test daarnaast minimaal: nieuwe/terugkerende OTP-login, username-race, accountblokkade, eerste owner, cross-user/RLS-isolatie, twee echte browsers tegenover elkaar, toeschouwer, reconnect, 301 openingsdubbel, 501/701, double-out/bust, sets/legs, impacttiming, exacte Elo-mutatie, chattoegang, rolmisbruik, gesloten chats, volle kamer, dubbele eliminatie/grand-final-reset, seizoen/divisies, twee schedulers tegelijk, walkovers, deploydrain en herstel uit backup.

Test de e-mails in een echte opvang/inbox en minstens mobiele Gmail, Outlook en een Apple-mailclient waar beschikbaar. Test SPF/DKIM/DMARC en bezorging met de echte stagingprovider voordat de release productierijp heet. Noteer ontbrekende toegang als resterende releasepoort, niet als geslaagd.

## Oplevering en push

Lever een compleet, reproduceerbaar ontwikkelproject op met migrations, veilige seeds voor development, mailtemplates, `.env.example` zonder secrets, workflows, runbooks, dependencylock en testcommando's. Voeg `/healthz`, `/readyz` met `{ok:true,release:<SHA>}`, worker-heartbeat, versie-/release-identificatie en de interne draincontracten toe die de deployment gebruikt. Readiness controleert werkende dependencies; gesloten admissions tijdens drain betekenen niet dat een gezonde runtime defect is. Controleer dat de staging- en productionworkflow de exactgebouwde bron-SHA van hun merge publiceren en het juiste GitHub Environment gebruiken.

Publiceer geen actieve wedstrijden weg: laat de Colyseus-server nieuwe games weigeren en bestaande games veilig afronden volgens document 07. Borg compatibele migraties en rollback. Een timeout levert een expliciete mislukte deploy op, geen force-kill die scores verliest.

Maak pas wanneer het lokale werk compleet en getest is de commit(s) en push naar **main**. Meld concreet wat is gebouwd, welke tests werkelijk zijn uitgevoerd, de gepushte SHA, de resterende handmatige environmentinvoer en het staging-/productionactiveringspad. Noem niet alles 'klaar' als echte SMTP-, multiplayer- of deploymentacceptatie nog ontbreekt.
