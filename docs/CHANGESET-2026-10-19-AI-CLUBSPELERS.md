# AI-clubspelers — implementatie en acceptatie

Opdracht: `reference/ai-clubspelers-2026-10-19/01-CODEX-OPDRACHT.md`.
Bronpakket: 396 bestanden gecontroleerd op grootte en SHA-256; alle controles correct. De NPC-bronnen, persona's en audits zijn als referentie bewaard. De native applicatie blijft de autoriteit.

## Integratiebasis

Werk gestart vanaf `d2d95b7e2954eb99dc911cd61e70150f6360e89d`. De oorspronkelijke lokale checkout `70528c0` miste alleen de twee operator-databasecorrecties; deze zijn behouden. De audit noemt een nog bestaande Auth-FK, maar `20261015133738_privacy_erasure.sql` heeft die al verwijderd. De nieuwe identiteitsmigratie ontdekt daarom geen oude FK om te vervangen. Zij voegt een afzonderlijke Auth-FK toe, backfillt bestaande menselijke identiteiten en bewaart de bestaande privacytombstones.

Actieve en geschorste mensen vereisen `auth_user_id=id`. Alleen verwijderde menselijke tombstones mogen zonder Auth-identiteit blijven bestaan. Een verwijdering bij Auth kan geen actief menselijk profiel ongemerkt zonder identiteit laten bestaan. Oude registratiepaden worden ondersteund met een BEFORE INSERT-trigger. NPC's hebben geen Auth-identiteit; hun 25 UUID's zijn deterministisch afgeleid van vaste registry-ID's. Seedconflicten overschrijven geen ratings, historie of beheeraanpassingen. De migratie weigert bestaande actieve menselijke weesprofielen: herstel/onderzoek die eerst, zonder fictieve Auth-users aan te maken.

## Uitvoering

`npc-worker` bezit de afzonderlijke PostgreSQL-jobqueue. De supportworker voert alleen de expliciete korte chatbezorgopdracht uit. De webservice en NPC-worker krijgen AI-encryptieconfiguratie; realtime, gameplayworker, support, migratie en backup krijgen die niet.

De gewone chattransactie is herbruikbaar binnen de NPC-publicatietransactie. Berichten, herhalingshistorie en outbox worden samen gecommit. Teksten worden vóór opslag genormaliseerd en vergeleken met alle nog geldige historie van 12 uur, over karakters en kamers heen. Dit is geen globale wachttijd. Vergelijking gebruikt namen, Unicode, hoofdletters, onzichtbare tekens, getallen, overlap en enkele vaste tweetalige families. Zij garandeert geen perfecte semantische herkenning.

Generatie gebruikt Responses, strict structured output, `store:false`, geen tools en uitsluitend de officiële providerhost zonder redirects. In deze versie krijgt vrije generatie geen uitslag- of worpbewijs; spelcomplimenten worden conservatief onderdrukt. Zij mag geen prestaties uit persona-voorbeelden afleiden. Providerretentie buiten applicatieopslag hangt af van de OpenAI-accountconfiguratie.

De server rekent in UTC tokenbudgetten af. Iedere call reserveert conservatief maximaal 16384 tokens; onzekere usage blijft belast. Kosten in euro/dollar worden niet verzonnen en worden expliciet als onbekend weergegeven. De normale native spelautoriteit voert deterministische NPC-worpen uit; daarvoor wordt geen taalmodel gebruikt. De bestaande impactverwerking en policy-2-legafrekening blijven leidend.

## Publiek en slaap

Alleen een geauthenticeerde personal-realtimeverbinding die een werkelijk gemounte kamerchat rapporteert telt mee. Iedere verbinding krijgt een eigen server-UUID; roomsubscription iedere 15 seconden, TTL 45 seconden. Een gesloten socket verwijdert alleen die verbinding. Meerdere tabs met dezelfde menselijke UUID tellen eenmaal. Tokenexpiry, sessierevocatie, accountstatus, sancties, native kamerlidmaatschap en de bestaande vijfminuten-idlegrens blijven gelden. Bootstrap en beheer activeren geen publiek. Een vertraagde/achtergrondverbinding kan na TTL verlopen; hervatten begint nieuw werk zonder inhaalbatch.

Leeglopende kamers en platform krijgen afzonderlijke monotone epochs. Een vertrek gevolgd door terugkomst maakt oude jobs niet opnieuw geldig. De publiekstoets gebeurt vóór reserveren/genereren en onder de publicatielock. Late resultaten worden onderdrukt. NPC–NPC-wedstrijden bewaren hun state tijdens slaap; human–NPC-wedstrijden behouden de native disconnect- en timeoutregels. In-flight providerrequests worden waar mogelijk afgebroken; reeds verwerkt verbruik kan blijven bestaan.

## Sleutelbeheer

Standaard uitsluitend de actuele eigenaar, met verse databasecontrole en bestaande recente OTP-herauthenticatie voor sleutelacties. Een admin- of supportrol verleent geen toegang. Geen client-reveal, geen sleutel/ciphertext in bootstrap, audit of foutmelding. Een mislukte vervanging behoudt de vorige sleutel. Versievoorwaarden beschermen gelijktijdig wijzigen en oude tests.

Voor iedere omgeving afzonderlijk:

- SECRET `AI_INTEGRATION_MASTER_KEY_B64`: canonieke base64 van exact 32 cryptografisch willekeurige bytes.
- VARIABLE `AI_INTEGRATION_MASTER_KEY_ID`: label van de actieve encryptieversie.
- SECRET `AI_INTEGRATION_PREVIOUS_KEYS_JSON`: alleen tijdens rotatie een object van oude key-ID's naar hun base64-sleutels.

Gebruik de bestaande beveiligde serversecretprocedure. Print sleutelwaarden nooit in chat of logs. Runtimebestanden zijn 0600. Zonder AI-configuratie kunnen staging en production gewoon deployen; AI blijft uit. Een aanwezige ongeldige sleutel wordt door preflight afgewezen. De provider-API-key wordt daarna uitsluitend via `/beheer?tab=platform#openai` toegevoegd en expliciet getest. De echte test verbruikt beperkt providerbudget. Verwijderen uit DartsPoint is geen intrekking bij OpenAI.

Mastersleutelrotatie: zet nieuwe actieve key en ID plus de oude sleutel in de private previous-keyconfiguratie, pauzeer nieuwe initiatieven, en voer in de web-runtime `node scripts/rotate-ai-master-key.mjs --rotate` uit. Dit onderhoudsbestand wordt meegebundeld in het workerartifact, maar mag alleen met de tijdelijke web/NPC-encryptieomgeving worden uitgevoerd; geef de gewone worker nooit deze omgeving. Controleer de metadata en een expliciete verbindingstest. Verwijder de oude sleutel pas als alle records opnieuw versleuteld zijn en herstelmateriaal veilig apart is bewaard. Bewaar keymateriaal afzonderlijk van databasebackups.

## Tot nu toe uitgevoerd

- Typecheck, 112 unittests en oorspronkelijke spelregel-/bronpariteitscontroles geslaagd.
- 50 infrastructuurtests geslaagd, inclusief afwezige AI-configuratie in beide omgevingen, ongeldige sleutelconfiguratie en scheiding van runtimegeheimen.
- Gerichte native databaseproeven op geïsoleerde lokale database: 25 identiteiten, rechten, ciphertext/metadata, mislukte rotatie, bootstrap, honderd gelijktijdige publicatiepogingen, verschillende teksten, clientloos spel, slaap/hervatten, writerfencing, epochs, meerdere tabs en sleutelverwijdering.
- Native browserproeven: directe HTTP-rechten, 25 karakterkaarten, dirty polling, write-only sleutelveld, desktop/mobiel zonder overflow of browserfouten.
- Deploymentbuild geslaagd op de tussentijdse implementatie; bij verdere wijzigingen opnieuw bouwen.

Providerverificatie gebruikt fakes; nul echte OpenAI-calls. De T3-preview is op deze host geblokkeerd door AppArmor; de browserproeven gebruiken de bestaande Playwright-workflow.

Volledige hosted regressie, seriële timingroute, herstel-/belastingproeven en staginguitrol zijn nog niet aangetoond. Deze versie mag niet als opgeleverd op staging worden gerapporteerd vóór die gates werkelijk slagen. Bewijs staat in `artifacts/npc-native-result.json` en `artifacts/npc-browser/`.

## Rollback

Pauzeer nieuwe initiatieven en gebruik zo nodig de noodstop. Stop de NPC-worker, maar laat bestaande human–NPC-partijen via de normale lifecycle eindigen. Behoud het voorwaartscompatibele schema en alle profiel-UUID's, wedstrijdhistorie en recente herhalingshistorie. Voeg de oude Auth-FK op `profiles.id` niet terug: dat is na het seeden van NPC-profielen geen geldige rollback.
