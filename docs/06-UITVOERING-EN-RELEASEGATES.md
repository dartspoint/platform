# Uitvoering op de development-VPS en releasepoorten

Dit document bepaalt de bouwvolgorde. De originele Sites-bron is referentie voor presentatie en bestaande pure domeinregels. Productiecontracten uit deze overdracht zijn leidend voor identiteit, persistence, autorisatie en multiplayer.

## 1. Referentie vastzetten

- Controleer de SHA en checksums uit `MANIFEST.json`. Bewaar een onveranderde kopie van `source-sites/` buiten de doelrepository of onder een expliciet uitgesloten referentiepad.
- Lees bestaande documentatie en scripts. Noteer werkende prototypefuncties, simulaties en hiaten in een traceabilitymatrix.
- Start de referentie uitsluitend in een ontwikkelomgeving. Capture de schermen en interactiestaten uit document 08 vóór wijzigingen. De originele assets en fonts zijn inbegrepen; nieuwe benaderingen of AI-gereconstrueerde screenshots zijn geen vervanging voor de originele componenten.
- Leg de actuele packageversies, Node/pnpm-versies en beschikbaarheid vast. De Sites-bron gebruikt een Vinext/Cloudflare-buildomgeving; native Next.js heeft een andere runtimeconfiguratie nodig.

**Poort:** het origineel is reproduceerbaar of iedere concrete runtimebeperking is vastgelegd; de volledige UI-bron is behouden en er is een visuele referentiebaseline.

## 2. Dezelfde UI onder native Next.js

Voorgestelde monorepo-indeling:

| Pad | Verantwoordelijkheid |
|---|---|
| `apps/web` | Native Next.js App Router; bestaande schermen, CSS, assets, SSR en HTTP/BFF |
| `apps/realtime` | Colyseus rooms, auth, game lifecycle, reconnect en realtime transports |
| `apps/worker` | Duurzame achtergrondtaken, deadlines, outbox en planning |
| `packages/game-core` | Pure score-, match-, checkout- en Elo-regels; geen browser of netwerk |
| `packages/contracts` | Versiebeheerde schemas, berichten, validation en gedeelde types |
| `packages/data` | PostgreSQL-transacties en server-only repositories |
| `packages/emails` | De herbruikbare HTML/plaintext-mailrenderer en assetscontracten |
| `packages/ui` of bestaande webcomponenten | Alleen waar zinvol delen; geen verplichte herbouw van alle componenten |
| `supabase/migrations` | Geordende database- en RLS-migraties; één waarheid voor DDL |
| `tests` | Unit, integratie, echte transportflows, E2E, visueel en load |
| `ops` | Getoetste workflow-, runtime-, backup-, drain- en herstelconfiguratie |

Kopieer de bestaande schermcomponenten, CSS en publieke assets eerst intact. Vervang pas daarna de datatoegang via adapters. Behoud routes waar ze zichtbaar onderdeel zijn van het product. De vijf historische conceptvarianten zijn geen vijf productieontwerpen; het vastgelegde Afterhours-ontwerp is leidend.

| Sites-specifiek onderdeel | Doelactie |
|---|---|
| `vite.config.ts`, Vinext/Worker-build, Sites helpers en connector-preview | Niet als productieruntime gebruiken; native Next-config met standalone-output in doelproject |
| `.openai/hosting.json` met Sites project-ID en D1 | Alleen herkomst/reference; geen target-cloudinfra of productionsecret |
| `app/chatgpt-auth.ts` en ChatGPT identity | Vervangen door expliciete Supabase-accountflow voor DartsPoint |
| Wrangler/Cloudflare bindings, D1 adapter | Naar server-only PostgreSQL-repositories; geen D1-conversie verwarren met realtime-integratie |
| Lokale Nick-session flag | Verwijderen uit productietoegang; alleen geverifieerde Supabase-sessie geldt |
| `localStorage`/`sessionStorage` domeinstores | Echte backenddata; alleen niet-kritieke voorkeuren/caches/tabselecties blijven client-side |
| Vaste spelersnamen als sleutels | Stabiele UUID-relaties; displaynamen zijn labels en mogen nooit autorisatie bepalen |
| `/api/fair-play` met clientcoördinaten | Vervangen door gevalideerde Colyseus-bedieningscommando's en serverberekening |
| Demokalender en publieke seedstand | Publieke serverquery met uitsluitend gepubliceerde data en veilige cache-invalidation |
| OTP-demo, lokaal accountoverzicht en demomail | Echte provider/serverintegratie achter hetzelfde scherm; geen democode in productie |

**Poort:** dezelfde schermen renderen onder native Next.js. Visuele afwijkingen zijn opgelost of noodzakelijk, benoemd en afzonderlijk gereviewd. Er blijft geen verborgen Sites-authafhankelijkheid over.

## 3. Identiteit, eerste naamkeuze en eerste eigenaar

Implementeer document 03. Gebruik lokale Supabase en mailopvang als stagingcredentials nog ontbreken. Een echte lokale OTP van de authprovider naar de opvang is wél een integratietest; een zelfbedachte democode is dat niet.

Maak een profiel-onvolledig-toestand. Na verificatie kan deze gebruiker zijn naam claimen en uitloggen, maar nog niet chatten, spelen, aanmelden of beheer openen. Unieke naamreservering, profielaanmaak en start-rating gebeuren atomair. Twee apparaten die tegelijk een naam claimen mogen nooit twee profielen of een dubbele claim veroorzaken.

Normale gebruikers krijgen nooit owner/admin/VIP uit `user_metadata`, e-mailtekst, URL, formulier of een lokaal profiel. Rollen worden server-side vastgesteld. Ownerbootstrap is een eenmalige beheerdersactie met expliciete geverifieerde identiteit, geen normale registratiebijwerking.

**Poort:** nieuw account, terugkerend account, sessieherstel, verlopen/verkeerde OTP, resend, naamconflict, directe API-toegang en ownerbootstrap zijn aantoonbaar getest.

## 4. Domeinopslag en veilige services

Implementeer document 05 met migraties, constraints, indexen, server-only transacties en RLS. Meng geen twee migratiestelsels: kies Supabase SQL-migraties als DDL-bron, ook als Drizzle voor getypte queries wordt gebruikt. Behoud immutable audit/events voor gevoelige acties; werk niet uitsluitend de eindstand bij.

Voer alle rechtenchecks uit op gebruikers-UUID, lidmaatschap en actuele rol. Verborgen knoppen zijn geen beveiliging. Geblokkeerde, gemute of verwijderde gebruikers mogen niet via rechtstreeks aangeroepen endpoints alsnog toegang krijgen. Maak privacygrenzen testbaar met twee onafhankelijke accounts.

**Poort:** geen autoritatieve domeinmutatie berust nog op lokale browseropslag; service-credentials verschijnen niet in een browserbundle, log of publiek responseobject.

## 5. Eerst één echte volledige wedstrijd

Implementeer Colyseus-contract uit document 04. Begin met twee echte browsers die een gewone 501-wedstrijd spelen en een derde die toekijkt. Daarna 301 dubbel-in/dubbel-uit, 701, sets/legs, uitgooitips, reconnect en verschillende schermformaten.

De browser verstuurt bedieningsacties, geen scores of zelfgekozen raakcoördinaten. De bestaande `scoreDart`, matchregels, checkoutberekeningen en Elo-formule worden gedeelde pure logica; de server is eigenaar van de toestand en de beslissingen. Houd spel- en regelversies bij een match vast zodat een nieuwe configuratie niet halverwege de wedstrijd ingaat.

De pijl vliegt eerst, daarna verschijnt de score bij de servervastgelegde impact. Een vertraagde achtergrondtab mag de wedstrijd nooit blokkeren. Bij terugkomst krijgt de speler de actuele toestand en ontbrekende events in plaats van oude animaties opnieuw als nieuwe worpen te tellen.

**Poort:** een compleet gespeelde match heeft één resultaat, precies één ratingtransactie indien van toepassing en dezelfde toestand op speler-, tegenstander- en toeschouwersscherm.

## 6. Community en competities

Maak daarna vrienden, verzoeken, uitnodigingen, alle chatkanalen, moderatie, kamerbeheer, toernooien, brackets, dubbele eliminatie, bordplanning, seizoenen/divisies en ladderpublicatie echt. Het functionele canon is de checklist, niet alleen deze samenvatting.

- Lobby blijft een overzicht van kamers en eventuele eventpromotie. Een privégesprek kunnen sluiten is onafhankelijk van berichtbewaring en accountblokkade.
- Spelchat hoort bij die specifieke wedstrijd; kamerchat bij actueel toegestane kamerlidmaatschap. Privéberichten zijn alleen zichtbaar voor deelnemers en een expliciet begrensd moderatieproces.
- Dubbele eliminatie verliest een deelnemer pas na zijn tweede nederlaag; de grand-final-reset volgt de ingestelde regels.
- Een seizoen/divisie is een competitie, geen toernooi-eliminatieformat. Bordplanning is een operationele instelling van de gekozen spel-/competitieflow.
- No-show, opgeven en onbereikbaarheid krijgen afzonderlijke status en redenen. Een administratieve beslissing mag geen gefingeerde darts, gemiddelden of gewone ranked-resultaten genereren.
- Achtergrondtaken moeten veilig herhaald kunnen worden. Twee workers mogen nooit dezelfde matchup tweemaal starten of hetzelfde bord aan twee actieve wedstrijden geven.

**Poort:** alle aangeboden prototypeacties hebben een echte werking of staan expliciet buiten de overeengekomen V1. Geen doodlopende knoppen of verborgen TODO's.

## 7. E-mail en publieke pagina

Gebruik de meegeleverde mailbasis voor alle transactionele mails. Scheid authmail via Supabase SMTP van overige mails via de server-side outbox. De OTP zelf mag nooit via de database-outbox van DartsPoint, analytics of logs worden verspreid. Authprovider beheert de code; de template toont deze alleen in het bedoelde bericht.

DNS, afzender, bounce/complaintverwerking, retries en onderdrukking van niet-verplichte notificaties horen bij de implementatie. Geen HTML uit chats of namen zonder escaping in de mail. Een gepauzeerde of geblokkeerde ontvanger krijgt geen onbeperkte notificaties. Gebruik gebeurtenis-ID's om dubbele verzending te beperken; herstel na provider-timeout moet geen spamloop veroorzaken.

De marketingpagina behoudt de bestaande hero, fotografie, layout, CTA's, spelpreview en ladders. Gebruik echte gepubliceerde events en een nette lege toestand als die er niet zijn. Geen fictieve liveaantallen of demogegevens publiek als waarheid presenteren. Maak privacy-/voorwaardeninformatie passend bij de werkelijke productie-inrichting vóór de publieke lancering; verzin geen bedrijfsregistratie of juridische claims.

**Poort:** OTP en minimaal één gewone transactionele mail zijn echt bezorgd op staging, styling en links kloppen, publieke routes lekken geen private data en staging staat op noindex.

## 8. Testmatrix voor oplevering

| Gebied | Minimale concrete controles |
|---|---|
| UI | Referentie/doel screenshots, mobiel toetsenbord, safe areas, geen horizontale overflow, 200% tekstzoom, focus, Escape, reduced motion |
| Auth | Nieuwe en bestaande e-mail, verkeerde/verlopen/gebruikte code, resend/invalidation, directe providerabuse, naamrace, reserved names, refresh/signout |
| Autorisatie | Speler/admin/owner/kamermoderator/VIP, cross-user data, scope, geblokkeerd account, geen clientrolpromotie |
| Spel | Bordsegmenten/ringgrenzen, 301 openingsdubbel, bull, bust, D-out, legs/sets, timeout, dubbele commando's, impact, reconnect |
| Elo | Verwachte formule, provisional, exact één mutatie, geen ranked delta bij oefening/ongeldige walkover, audit en concurrency |
| Sociaal | Dubbele vriendschapsaanvraag, verwijderen, blokkeren, persoonlijke mute, privétab sluiten/heropenen, chatgeschiedenis en toegang |
| Competitie | Bracketbyes, seeding, dubbele eliminatie/reset, late afmelding, no-show, seizoenstand, tie-break, twee bordplanners tegelijk |
| Ops | ExactSHA, juiste environment, secrets niet ingebakken, readiness, migrationfail, drain, providerstoring, rollback en restore |
| Load | Doelconcurrentie onderbouwd testen met meerdere kamers/matches/toeschouwers; eventlooplag, p95-latency en geheugen meten |

De bestaande `source-sites/scripts/check-*.mjs` leveren waardevolle domeinvoorbeelden. Neem de relevante cases over; voer scripts pas uit wanneer imports en runtime van de doelmonorepo zijn aangepast. Alleen de oude prototypetests draaien bewijst geen echte auth, netwerkisolatie of Colyseus-correctheid.

## 9. Main, staging en productie

De laatste lokale releasepoort bestaat uit: featuretraceability compleet, tests groen, visuele vergelijking uitgevoerd, secretscan schoon, migraties reproduceerbaar en geen dataverlies bij herstart. Daarna commit/push naar de geverifieerde `main`-remote.

Staging krijgt eigen data, authproject, mailconfiguratie, runner en GitHub Environment. Een geslaagde stagingdeploy moet met echte e-mail en meerdere apparaten worden geaccepteerd. Voeg geen productieklantgegevens toe aan seeds of de testomgeving.

Productie krijgt vervolgens eigen configuratie en runner. Activeer DNS/SSL en ownerbootstrap gecontroleerd. Kies bewust de timing voor een deploy die op lopende wedstrijden wacht. Bewijs dat backup en restore werken vóór de eerste publieke competitie; een backupbestand zonder uitgevoerde hersteltest is geen afgerond herstelplan.

Maak na iedere release een kort rapport met SHA, schema-/protocolversie, uitgevoerde controles, resterende beperkingen en rollbackdoel. Laat uitvoerbare failclosed hooks in `ops/` nooit eindigen als permanente placeholders in de opgeleverde doelapp.
