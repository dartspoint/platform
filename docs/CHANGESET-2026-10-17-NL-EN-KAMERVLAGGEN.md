# NL/EN, gedeelde community en kamervlaggen — 17 oktober 2026

DartsPoint heeft een gedeelde NL/EN-taalcontext, modulecatalogi, taalbediening in
publieke navigatie en profiel, Engelse mails en gekoppelde actuele Engelse
voorwaarden/privacy/handleiding. Kamers hebben een onafhankelijke optionele regio
en voertaal, lokale SVG-vlaggen, beheerpreview en combineerbare filters.

De bestaande community, eigen-accountautorisatie, spelregels, bord, timing,
scoring, serverautoriteit en desktop/mobile-indeling blijven leidend. Nieuwe
voorkeurloze accounts volgen de gekozen flow; oude accounts krijgen geen onjuiste
NL-backfill. Eén room-event rendert per ontvanger. Vrije spelerstekst blijft letterlijk.

Onderhoud, inventaris, woordenlijst, routes, bronhashes, publicatie, providerstappen
en rollback: [INTERNATIONALISATIE.md](INTERNATIONALISATIE.md).

## Verificatie en resterende externe controles

Deze tabel maakt onderscheid tussen lokale bewijzen, gesimuleerde hostchecks en
werkelijk verbonden domeinen. Een gesimuleerde `.app`-host bewijst geen DNS/TLS.

| # | Acceptatie | Resultaat / bewijs |
| --- | --- | --- |
| 1 | Gast op `.nl` | Lokale NL-SSR/browser geslaagd; domeinprecedentie unitcheck |
| 2 | Gast op `.app` met NL-browser | EN-SSR/browser en echte flow lokaal geslaagd; `.app`-DNS/TLS extern nog te koppelen |
| 3 | Account met expliciet EN op `.nl` | Eigen accountvoorkeur + in-place context lokaal geslaagd |
| 4 | Bestaand account zonder voorkeur | Resolver en nullable migratie; geen massabackfill |
| 5 | Taalwissel tijdens actieve match | Twee echte browsers: zelfde match-ID/stateVersion/scores/beurt, bordnode en websocketcount; chatdraft behouden |
| 6 | Registratie en onboarding | Echte EN-OTP naar Mailpit, onboarding bewaart `en` |
| 7 | OTP en mailtaal | Echte lokale EN-body en onderwerp; NL/EN wisselen verstuurt geen tweede mail; externe provider-template nog uitvoeren/controleren |
| 8 | Google-login op beide hosts | Veilige origin/flowcookie behouden; echte externe Google-/`.app`-provideracceptatie niet aangetoond |
| 9 | Twee ontvangers, één systeemevent | DB-projectie en beide renderers lokaal geslaagd |
| 10 | Vrije chat/nickname | Exacte inhoud en veilige tekstparameters lokaal geslaagd |
| 11 | Legacy/onbekend event | Veilige fallback, geen crash of vrije-tekstclassificatie; bestaande deduplicatie behouden |
| 12 | Kamerregio instellen/wijzigen/verwijderen | Geautoriseerde DB-mutaties en projectie lokaal geslaagd |
| 13 | Geen regio/internationaal | Afzonderlijke waarden en labels, unit + DB geslaagd |
| 14 | Voertaal los van regio | Contracts en DB-mutaties geslaagd |
| 15 | Kamerfilters | Echte opgeslagen GB-SCT/nl en internationaal/meertalig; gecombineerde browserfilters, reset en mobiele 390px-weergave geslaagd |
| 16 | Onbevoegde mutatie | Vreemde-accountpayload, ongeldige locale en onbevoegde kamerwijziging lokaal geweigerd |
| 17 | Actuele documenten NL/EN | Volledige gepubliceerde 2.0-bron gekoppeld via hash; openbare EN-weergave lokaal geslaagd; geen juridische goedkeuring |
| 18 | Akkoord en taalwisseling | Zelfde inhoudsversie, nieuwe taal/revisie-evidence en geen dubbel akkoord lokaal geslaagd |
| 19 | Handleiding/CMS | Lokaal hetzelfde artikelpad in andere taal; actuele guide 2.0. Op staging ontbreekt nog een gepubliceerde handleidingbron. Geen bestaande losse zoekmodule aangetroffen. CMS-edities controleren bron en volledigheid |
| 20 | Tijdzone/countdown/DST | Formatterunits en reminders bewaren instant; Amsterdam/London DST geslaagd; bestaande countdowncode behouden |
| 21 | SEO | EN-canonical `.app`, wederzijdse hreflang, HTML-taal en metadata lokaal geslaagd; extern `.app` nog te koppelen |
| 22 | Mobiel/toegankelijkheid | Publieke mobiele 390px-browsercontrole zonder horizontale overflow of hydrationfouten; toegankelijke selects |
| 23 | Catalogi/templates | ICU-compileerbaarheid, gelijke sleutels/placeholders en HTML-escaping geslaagd |
| 24 | Gameplayperformance | Volledige bestaande regressiesuite: zie definitieve runstatus hieronder; geen grenswaarden verlaagd |
| 25 | Migraties/oude clients | Vier expandmigraties lokaal toegepast; oude omitted metadata behouden; legacy locale blijft null |
| 26 | Cache/origin/accountscheiding | Expliciete origins, dynamische publieke SSR, persoonlijke private/no-store, unit/browserchecks; echte CDN-multihostcheck extern na koppeling |

## Uitgevoerde opdrachten

- `npm run build:deploy`: standalone web-, realtime- en workerbundles gebouwd.
- `npm run verify:ci`: typechecks, 100 unitchecks en 49 bestaande opschecks geslaagd.
- `tests/integration/internationalisation.ts`: echte lokale DB/Auth-integratie.
- `tests/e2e/internationalisation.ts`: echte browsers, OTP/Mailpit, onboarding en
  taalwissel tijdens een actieve wedstrijd.
- `tests/unit/content-translations.test.ts`: bronwijziging, JSONB-keyvolgorde,
  onvolledige editie en pollidentiteit.
- Supabase CLI `db advisors --local --type security`: geen problemen gevonden.
- Beide tweetalige Caddy-voorbeelden gevalideerd met de gepinde Caddy 2.11.7.
- `npm run test:integration`: volledige bestaande acceptatie wordt uitgevoerd;
  de actuele exacte-commituitkomst staat in de GitHub Actions-uitrol die hieronder wordt gekoppeld.

Private lokale screenshots, Mailpit/browserresultaten en logs staan in de
geïgnoreerde map `artifacts/i18n`; secrets en lokale envfiles worden niet gecommit.

## Staging

De uitrol loopt via de bestaande `main` → `staging`-workflow met hosted verificatie,
imagepublicatie en de bestaande beperkte self-hosted stagingrunner. De actuele
[staginguitrol met exacte release-SHA en testuitkomst](https://github.com/dartspoint/platform/actions/workflows/deploy.yml?query=branch%3Astaging)
is de bron voor de uitrolstatus; `/healthz` en `/readyz` tonen de werkelijk actieve
SHA. De eindoplevering controleert die tegen de succesvolle workflow.

Test via Tailscale op `https://staging.dartspoint.nl/en` en `/nl`, wijzig daarna in
het profiel de taal binnen dezelfde kamer. Kies als bevoegde beheerder bij een
kamer bijvoorbeeld regio `GB-SCT` en voertaal `nl`; controleer na opslaan de vlag,
het onafhankelijke taallabel en de lobbyfilters. Een echte match kan openblijven
bij het wijzigen van alleen de interfacetaal.

Extern resteert: de meegeleverde handleidingbron en Engelse editie via een bevoegde stagingpubliceerder publiceren; `.app`-DNS/TLS/Caddy activeren, Supabase redirectallowlist en één
tweetalige OTP-template/onderwerp publiceren, Turnstile-hosts toevoegen en echte
Google-login per domein controleren. Productiecode/DNS zijn in deze sprint niet
uitgerold of gewijzigd. Dit volgt de expliciete staginggrens uit de opdracht.

## Aanvullende bevindingen

- Eerste schone CI-run op `8ced500`: functionele DB-asserties slaagden, daarna
  ontbrak de resultaatdirectory. De tests maken die directory nu zelf aan; dit
  verandert geen assertie of testgrens.
- Alle lokale DB-integratiechecks inclusief restore, retention, recovery, load en
  mail slaagden. De gerichte EN-OTP/onboarding/matchtaaltest en de bestaande
  volledige tweespelermatch/reconnect/practiceacceptatie slaagden eveneens.
- Verlopen Google-flows zijn lokaal voor NL en EN via echte HTTP-redirects
  gecontroleerd. Echte externe Google-aanmelding blijft een providercheck.
- Op staging komen de actuele voorwaarden en privacy 2.0 exact overeen met de
  meegeleverde bronhashes. Daar is geen handleiding gepubliceerd.
- De gekoppelde Supabase-beheerconnector weigert toegang tot het stagingproject.
  Providerwijzigingen of publicatie buiten de bestaande apprechten zijn daarom
  niet als uitgevoerd gemarkeerd.

- De bestaande losse Turnstile-fixture gebruikt nu dezelfde `LocaleProvider` als
  de echte app. Alle oude lifecycle-, token-, retry- en 320px-checks blijven
  behouden. De fouttekstassertie controleert nu exact de gecatalogiseerde
  `auth_provider`-melding; het OTP-request controleert ook `locale: nl`.
  Een extra EN-check bewijst een nieuw widget, ongeldig oud token en geen extra
  OTP-request na taalwisseling. Deze geïsoleerde browsertest slaagt.
- De ongewijzigde 200%-zoomassertie vond overloop in de navigatie na toevoeging
  van de taalkeuze. Een headercontainerquery gebruikt bij beperkte werkelijke
  breedte het bestaande mobiele menu. De volledige interfacecheck, inclusief
  toetsenbord, verlopen render-sample, offline oefenen en 200% zoom, slaagt.

- Native mobiele taalbediening is met echte browsers op 320 en 390 px gecontroleerd:
  de oorspronkelijke sluitknop blijft 44 px en het menu heeft geen horizontale
  overloop. De 200%-zoomcontrole slaagt met de actuele bundel.
- `tests/e2e/room-metadata.ts` maakt uitsluitend eigen lokale fixtures: GB-SCT met
  Nederlandse voertaal en internationaal/meertalig. De echte vlag, opslag,
  gecombineerde filters, reset en mobiele weergave slagen; fixtures worden opgeruimd.
- Expliciete manifestquery `locale=nl|en` gaat vóór een afwijkende gastcookie.
- De oude keyboardfixture accepteert nu ook de native taalselectie als geldig
  tabdoel. Document/supportacceptatie: 18 checks geslaagd. Bezorgstatusacceptatie:
  4 checks geslaagd bij herhaling na een eerste timeout bij claimen. Releasebeheer:
  opslag, idempotentie, privérechten, publicatie en mobiele bediening geslaagd.

- Toernooiblokkades, rondes en doorstroomwaarschuwingen gebruiken een gecontroleerde
  presentatielaag. De oorspronkelijke bronwaarden blijven leidend voor deelname,
  planning, filters en audit; vrije namen en inhoud blijven intact.
- Stagingrun op `d499cd1` stopte vóór tests/deployment op
  `qa_supabase_resource_scope_invalid`. De bestaande guard blijft ongewijzigd
  weigeren; de bestaande gedocumenteerde hosted fallback voert dezelfde volledige suite uit.
  De dedicated runner en zijn beveiliging worden niet gewijzigd.

- De QA-runner was online en niet bezet. De repositorykeuze
  `DARTSPOINT_QA_ON_VPS` is voor deze uitrol tijdelijk naar de gedocumenteerde
  hosted route gezet; dezelfde tests, grenswaarden, images en beperkte
  stagingdeployhelper blijven gelden. De oorspronkelijke waarde `true` wordt
  na de uitrol hersteld. De nog benodigde QA-opruiming blijft een expliciet
  operationeel punt zolang Tailscale extra authenticatie vereist.
- De volledige hosted main-CI op `48771b7` slaagde. De parallelle stagingrun
  vond mobiele overloop in de nieuwe vertaalbronselectie. Het paneel deelt nu
  de bestaande documentbundle en ververst mee na opslaan; native velden blijven
  binnen hun container. De ongewijzigde viewportassertie wordt met een gevulde
  bronselectie uitgevoerd. De 12 legal-adminchecks slagen lokaal tweemaal achter
  elkaar op 320/390 px. Deze bestaande CI-test draait nu ook in `test:integration`.
- De volgende CI-run mat direct na viewportemulatie nog de desktopmarges bij
  `innerWidth=320`; in de tweede diagnostische meting was staging al 320 px breed.
  De browsercheck wacht nu twee renderframes op de responsive layout en meet
  resultaat en foutdiagnostiek in hetzelfde frame. De oorspronkelijke
  éénpixelgrens, beide viewportbreedtes en alle opslagasserties blijven gelijk.
- De volledige CI en stagingdeploy van `3fef7cb` slaagden, inclusief vier
  migraties, Engelse voorwaarden/privacy 2.0, vlagassets, readiness en mobiele
  geometrie. De extra echte HTTPS-controle vond een bestaande marketingfout bij
  `prefers-reduced-motion`: de browser tekende een ander carrouselicoon dan SSR.
  De voorkeur wordt nu na hydration toegepast; NL en EN worden met verminderde
  beweging op foutloze hydration en uitblijvende automatische slides getest.
  De drie reeds gesaneerde i18n-resultaten worden ook als CI-artifact opgenomen.
- De vier PWA-installatie-instructies staan nu eveneens in de catalogus. Een
  geopende instructie verandert mee met de interfacetaal zonder de prompt opnieuw
  te openen of de installatieactie te herhalen.
