# Nederlands, English en kamermetadata

Deze implementatie gebruikt dezelfde Next.js 16.3.8-app, Supabase-identiteiten,
Postgresgegevens, Redis en Colyseus-server per omgeving. `.app` maakt geen
nieuwe tenant, spelerspool of account aan. Staging en productie blijven gescheiden.

## Inventaris en vertaalroute

| Werkelijke module | Bron / vertaalroute | Verificatie |
| --- | --- | --- |
| Landing, contact, openbare navigatie | `darts-marketing.tsx`, modulecatalogus `marketing` | SSR en mobiele browser, metadata-unitchecks |
| OTP, Google, registratie, verplichte hernoeming | Bestaande authroutes en logincomponenten, `login`/`registration`/`requiredRename` | Echte lokale OTP, Mailpit, onboarding; externe Google apart controleren |
| Lobby, kamers, vrienden, profiel, voorkeuren, chat | Bestaande componenten, modulecatalogi, gedeelde taalcontext | Twee browsers, DB-integratie, vrije chat blijft letterlijk |
| Match, oefenen, toernooi, divisies, ladder | Bestaande componenten en modules; geen gewijzigde spelregels | Originele ruleschecks, bestaande browser- en timinggates |
| Kamer-, speler-, chat-, toernooi-, seizoens-, DP- en platformbeheer | Bestaande beheercomponenten en catalogi | Typecheck, bestaande beheeracceptatie, rechtenchecks |
| Releases en ideeën | Catalogi voor bediening/statussen; redactionele inzendingen blijven broninhoud | Bestaande releaseacceptatie |
| Support, privacy en bezorgbeheer | UI-catalogi, optionele Engelse onderwerpen/sjablonen, opgeslagen flowlocale | Bestaande support/privacy-integratie en mailopvang |
| Geautomatiseerde e-mail | Eén renderer `packages/emails/src/templates.ts`, NL/EN-inhoud | Alle templates, escaping, vervaltijd en echte EN-OTP |
| Voorwaarden, privacy, handleiding | Actuele gepubliceerde bron 2.0 plus gekoppelde Engelse revisie | Hash, DB-publicatie, akkoordbewijs, publieke pagina's |
| Beheerde lobbyartikelen en polls | `translations.en.source/text` in bestaande layout; dezelfde inhouds-ID | Geldige/onvolledige/verouderde editie, pollposities behouden |
| Systeemmeldingen | Gecontroleerde versie-1 room-eventadapter en zichtbare notificatielabels | Eén event, twee talen, onbekende versie en vrije chat |
| PWA, sitemap, Open Graph, HTML-taal | Locale-manifest, SSR-metadata, publieke alternates | Unitchecks, browser en build |

Er is geen afzonderlijke bestaande social-cardgenerator aangetroffen; deze sprint
voegt er geen toe. Apple-login bestaat niet en wordt niet toegevoegd. De oudere
launch-API krijgt geen nieuw publiek formulier. Nicknames, kamer-, toernooi- en
seizoensnamen, vrije chat, tickets, redenen, auditgeschiedenis, handgeschreven
releaseberichten en ideeën zijn broninhoud. Beheerde lobbycontent krijgt alleen
een Engelse editie wanneer die expliciet aan dezelfde bron is gekoppeld. Anders
staat bij aangepaste content `Original text`. Bestaande historische bronmeldingen
blijven leesbaar. De spelberichtadapter herkent uitsluitend bekende servermeldingen
met een exacte spelersprefix en maakt een versie-1 presentatiedescriptor; scoring
en opgeslagen snapshots blijven ongewijzigd. Onbekende historische tekst blijft
broninhoud. Verander geen inhouds-ID's of polloptieposities om te vertalen.

## Taal, domeinen, URLs en caches

- Inhoudstalen: `nl` en `en`; formattering: `nl-NL` en Brits `en-GB`.
- Productiestandaard: `dartspoint.nl` Nederlands, `dartspoint.app` Engels.
  `www`-varianten staan expliciet in de productie-allowlist.
- Staging: `staging.dartspoint.nl` en voorbereid `staging.dartspoint.app`.
  Dezelfde bestaande realtimehost `realtime.staging.dartspoint.nl` wordt gebruikt.
- De primaire publieke NL-versie is `https://dartspoint.nl/…`, EN is
  `https://dartspoint.app/…`. Bestaande Nederlandse paden blijven bestaan.
  `/nl/…` en `/en/…` zijn concrete Next-routes voor landing, contact, handleiding,
  privacy, voorwaarden, login, registratie en support. Dubbele publieke taalroutes
  canonicaliseren naar de overeenkomstige **zelfde** taal op haar primaire host.
- Publieke indexeerbare inhoud volgt eerst de expliciete URL en dan de host;
  account- en gastcookies veranderen die publieke artikeltekst niet.
- In de applicatie geldt: net gekozen taal, expliciete accountvoorkeur,
  expliciete gastvoorkeur, domeinstandaard. Browsertaal en IP veranderen dit niet.
  Authflows bewaren de gekozen taal. Nieuwe accounts slaan de actieve taal op;
  bestaande voorkeurloze accounts krijgen geen Nederlandse backfill.
- `LocaleProvider` blijft boven de bestaande spelboom. De profielkeuze slaat via
  de bestaande eigen-accountmutatie op. Zij verandert context zonder navigatie,
  nieuw socket, nieuw bord of herinitialisatie. Bij een opslagfout volgt herstel
  met melding. De publieke keuze navigeert naar hetzelfde artikel in de andere taal.
- `dp-locale` bewaart de expliciete gastkeuze, `dp-ui-locale` helpt taalafhankelijke
  API-feedback. Geen van beide cookies verleent rechten. Sessiecookies blijven
  domeingebonden. Een gebruiker kan met dezelfde identiteit op beide domeinen
  inloggen; er is geen nieuw cross-domain-SSO-protocol.
- Proxy en persoonlijke API's blijven `private, no-store`; proxy zet de inhoudstaal
  en overschrijft interne locale/pathheaders. Publieke SSR is dynamisch en bevat
  de passende host/locale-metadata. Voeg geen gedeelde cache toe zonder beide
  varianten en persoonlijke gegevens af te scheiden.
- `/api/manifest?locale=nl|en` geeft de actuele lokale beschrijving. PWA-identiteit,
  scope en start-URL blijven gelijk. Het oude statische manifest blijft beschikbaar
  voor oude clients. Spelen en voortgang bewaren vereisen internet.

## Catalogi onderhouden

De offline-oefenweergave gebruikt `offline.nl/en.json`. Na een wijziging:
`node scripts/generate-offline-i18n.mjs`. De deploybuild controleert de gegenereerde
`offline-i18n.html` en `sw-i18n.js`. De oorspronkelijke offlinegame en serviceworker
blijven bytegelijk aan de bron; alleen een afzonderlijke presentatielaag vertaalt
bekende labels en meldingen. De offlinekeuze volgt de URL, daarna voor app-routes
de actuele UI-cookie en anders het domein. Publieke URLs behouden hun vaste taal.

`packages/i18n/src/catalogs/<module>.nl.json` en `.en.json` bevatten dezelfde
semantische sleutels en variabelen. De expliciete importmapping staat in
`apps/web/lib/i18n/catalog-loaders.ts`; `route-modules.json` selecteert de modules
per route. Beide taalvarianten van de benodigde modules zijn vooraf geladen voor
een directe taalwisseling. Gedeelde feedback, vaste labels en korte algemene
meldingen staan in aparte gedeelde catalogi. Er vindt geen vertaalnetwerkverzoek
plaats bij renderen, een worp of een scoreupdate.

1. Voeg een stabiele sleutel toe, bijvoorbeeld `rooms.count` of
   `tournaments.startsAt`; hernoem bestaande sleutels niet bij een tekstcorrectie.
2. Voeg de NL- en volledige Brits-Engelse zin met dezelfde placeholders toe.
   Gebruik ICU `plural`/`select`, bijvoorbeeld
   `{count, plural, one {# room} other {# rooms}}`.
3. Gebruik `useI18n(module).t` in componenten; servercode gebruikt de requestlocale.
   `runtimeFeedback` is alleen voor gecontroleerde ontwikkelaarsteksten in
   eventhandlers/helpers. Registreer vaste labels expliciet; geef nooit API-data,
   chat, namen of CMS-proza aan `localiseStaticCopy` door.
4. Houd enumwaarden en optionwaarden onveranderd. Vertaal alleen het zichtbare
   label. Maak samengestelde zinnen één bericht met parameters.
5. Controleer de benodigde route-imports als een module elders gebruikt wordt.
6. Draai `npm run verify:ci`, build en relevante browsercontrole. De unitcheck
   compileert alle ICU-catalogi, vergelijkt sleutels en placeholdernamen en weigert
   lege Engelse waarden. Ontbrekende sleutels falen tijdens ontwikkeling;
   productie heeft voor een onverwachte ontbrekende sleutel een neutrale melding.
   Onbekende serverfoutcodes tonen een algemene lokale fout, geen ruwe SQL/details.

Parameters worden als React-tekst gerenderd; vertaalbestanden zijn geen bron voor
HTML. `ignoreTag` voorkomt dat ICU inhoud als onveilige opmaak interpreteert.
Gebruik bestaande veilige documentrendering voor beheerde Markdown.

## Woordenlijst

| Nederlands | English |
| --- | --- |
| DartsPoint | DartsPoint |
| DP-punten | DP-punten |
| leg / set / checkout / 180 | leg / set / checkout / 180 |
| dubbel-in / dubbel-uit | double-in / double-out |
| oefenen | practise (werkwoord), practice (zelfstandig naamwoord) |
| kamer / voertaal | room / room language |
| land of regio / geen regio | country or region / no region |
| internationaal / meertalig | international / multilingual |
| wedstrijd / beurt / worp | match / turn / throw |
| ranglijst / divisie / seizoen | ranking / division / season |
| gelijkspel / opgave / rustweek | draw / forfeit / bye |
| toernooienbeheer / chatbeheer | tournament management / chat moderation |
| spelbeheer / platformbeheer | game moderation / platform administration |
| voorwaarden / privacyverklaring | terms / privacy notice |
| inschrijven / inchecken | register / check in |

## Systeemevents en notificaties

De bestaande chatprojectie voegt alleen voor vertrouwde serverregels met
`kind=system` een getypeerde `system_event` toe. Versie 1 heeft type
`room.member_joined` en `params.displayName`; bestaande ID, tijd, cursors,
deduplicatie en kanaaltoegang blijven leidend. De ontvanger rendert in de eigen
taal. De adapter voor betrouwbare oude join-events gebruikt bestaande velden;
zij classificeert geen vrije tekst op basis van een regex. Onbekende versies of
ontbrekende parameters vallen terug op de bewaarde historische body.

Nieuwe reminderjobs bewaren de start als ISO-instant plus de bestaande
`Europe/Amsterdam`-zone; de renderer formatteert per ontvanger. Een divisiedeadline
blijft een datum zonder nieuwe verzonnen starttijd. Moderatieduur gebruikt een
getal met een lokaal label. Bestaande handmatige redenen blijven letterlijk.
E-mailbezorging en outbox-idempotency veranderen niet door een taalkeuze.

## Juridische documenten en beheerde content

De volledige NL-bronnen zijn op 17 oktober 2026 gelezen uit de daadwerkelijk
gepubliceerde `/api/documents` op `dartspoint.nl`. `content/legal/registry.json`
bewaart de bron- en vertaalhash per document. De NL/EN Markdownbestanden bevatten
voorwaarden, privacy en handleiding 2.0. De Engelse editie is een vertaling met
redactionele revisie `en-1`, geen nieuwe inhoudelijke voorwaardenversie.

`private.legal_translations` en `private.legal_translation_publications` bewaren
onveranderlijke revisies, bron-ID en bronhash. Publiceer in bestaand documentbeheer
eerst de bron en vervolgens de gecontroleerde Engelse revisie. Alleen bestaande
bevoegde beheerders mogen dit. Een bekende exacte 2.0-bron kan deterministisch
uit de meegeleverde editie worden ingezaaid, ook bij een later aangemaakte
fixture/publicatie. Een onbekende of gewijzigde bron krijgt geen schijnvertaling.

Akkoordbewijs blijft aan dezelfde inhoudelijke voorwaarden-/privacyversie
gekoppeld. Nieuwe acceptaties registreren optioneel de getoonde taal en Engelse
revisie-ID's. Taal wisselen maakt geen nieuw akkoord; oude taalgegevens blijven
`null`. Een ontbrekende actuele vertaling wordt expliciet gemeld met een link
naar de Nederlandse bron. De app toont geen oude editie alsof die actueel is.

Lobbybeheer heeft per kop, widget en artikel een afzonderlijke Engelse editie.
Zij bewaart een kopie van de bronvelden en toont ontbrekend/onvolledig/verouderd.
Na bronwijzigingen moet de redacteur de editie opnieuw controleren. Opslaan en
publiceren gebruikt de bestaande lobbyrechten en versiecontrole. Supportonderwerpen
en antwoordsjablonen hebben afzonderlijke optionele Engelse velden; vrije ticketinhoud
blijft intact. De huidige handleiding is één bestaand document, geen nieuw
helpcentrum met fictieve zoekfunctie of artikelen.

De Engelse juridische teksten zijn op overeenkomst met de gepubliceerde bron
gecontroleerd, **niet juridisch goedgekeurd**. Voor gerichte werving in het VK
moet de verantwoordelijke de territoriale toepasselijkheid van UK GDPR en de
bestaande privacy-informatie beoordelen; de ICO geeft aan dat aanbieden van
producten/diensten aan personen in het VK relevant kan zijn. Deze sprint voegt
geen vertegenwoordiger, rechtsgrond of rechtskeuze toe.

## Kamers: regio, vlag en voertaal

`community_rooms.region` is optioneel: `null` betekent geen regio, de expliciete
waarde `international` toont een wereldbol. Landcodes zijn geallowliste ISO-codes;
`GB-ENG`, `GB-SCT`, `GB-WLS` zijn afzonderlijke regionale opties. `GB` blijft het VK.
`primary_language` is onafhankelijk: `nl`, `en`, `multilingual` of `null`.
Geen automatische afleiding uit taalvoorkeur, IP of kamernaam.

De bestaande kamerbeheerder kiest in de doorzoekbare selectie een regio en
voertaal, controleert de preview en slaat via de bestaande geautoriseerde route
op. Vlaggen hebben lokale SVG-assets uit `flag-icons` 7.6.0 onder MIT, met licentie
in `apps/web/public/flags/LICENSE`. De code registry is de allowlist; willekeurige
URL's worden niet geaccepteerd. Landnamen volgen de weergavetaal via Intl.DisplayNames.

Lobbyfilters starten met alle kamers, combineren regio en voertaal en hebben
reset. Een Engelse interface mag een Nederlandse kamer zonder Britse vlag tonen.
Metadata verandert geen kamerrechten, scoring of matchmaking. Oude clients die de
nieuwe velden weglaten wissen ze niet. Bewuste verwijdering gebruikt `null` en
verschijnt in de bestaande audit before/after.

## Externe configuratie en verificatie

De repository bevat voorbereide Caddy-voorbeelden in
`ops/Caddyfile.{staging,production}.bilingual.example`. Deze activeren geen DNS,
Caddy of productie. Behoud de bestaande Tailscalebronrestrictie voor staging,
privépoorten en centrale realtimehost. Dezelfde drie images bedienen beide hosts.

| Systeem | Exacte benodigde wijziging | Controle |
| --- | --- | --- |
| DNS/TLS | `dartspoint.app`, eventueel `www.dartspoint.app`; staging `staging.dartspoint.app` naar de werkelijk gebruikte VPS. Geen verzonnen IP; AAAA alleen na test | Werkelijke DNS, geldig certificaat en assets; staging ook split DNS via Tailscale |
| Caddy | Voeg de gewenste `.app`-webhost toe aan hetzelfde bestaande environmentblok; voeg diens HTTPS-origin toe aan realtime-originmatcher | Configvalidering, HTTPS, HTTP matchmaking en websocket met beide origins |
| Supabase redirectallowlist | Per toegestane weborigin `ORIGIN/en/inloggen`, `ORIGIN/nl/inloggen`, bestaande basis en `ORIGIN/api/auth/google/callback` met de bestaande veilige queryflow | OTP en Google afronden op oorspronkelijke host; ongeldige origin geweigerd |
| Google | Bestaande Google-provider en Supabase provider callback behouden; geen tweede identiteit of clientsecret in de app | Zelfde bevestigde e-mail via OTP/Google levert dezelfde profile-ID |
| Supabase e-mail | Kopieer de environment-HTML uit `packages/emails/templates/supabase-otp[-staging].html` naar de gebruikte OTP/Magic Link-template; conditioneel onderwerp uit `supabase-otp-subject.txt` | Eén mail, gekozen taal, dezelfde code/expiry, geen nieuwe mail na taalwisseling |
| Turnstile | Voeg de gebruikte `.app`-host toe aan de bestaande omgevingswidget naast `.nl`; sitekey/secret blijven omgevingsspecifiek | Echte challenge en siteverify hostname op beide hosts |
| Realtime | App-allowlist staat centraal in `packages/i18n/src/domains.ts`; zelfde realtime-URL per omgeving | HTTP-CORS en websocket zowel NL- als EN-origin; onbekende origins geweigerd |
| Mail/Resend | Bestaande afzender/verzenddomein behouden; toegestane klikhosts gebruiken; accountlocale, dan flowlocale, anders `nl` | Mailopvang lokaal, echte stagingtest uitsluitend met testaccounts |

De OTP-template kiest vóór accountcreatie één taal op basis van de exact
geallowliste `.RedirectTo`. Dit vertrouwt geen gebruikersmetadata voor rechten.
Het render-script `scripts/generate-otp-templates.ts` genereert beide talen in één
provider-template. Accountvoorkeuren gaan bij gewone notificaties voor; bij
bestaande voorkeurloze accounts wordt zonder vastgelegde flow `nl` gebruikt.

De Supabase Management API en Cloudflare-accountconfiguratie zijn niet door deze
repositorydeploy gewijzigd. Een succesvolle appdeploy bewijst die instellingen
niet. De bestaande staging-GitHubvariabelen wijzen naar `.nl`, hetzelfde
Supabaseproject en dezelfde realtimehost; Google is daar al ingeschakeld.

## Uitrol en rollback

1. Draai typechecks, catalogus/ICU-pariteit, originele spelregels, asset/CSS-pariteit,
   DB-integratie, mailopvang, bestaande browseracceptatie en timinggates.
2. Commit en push `main`; voer de bestaande gereviewde promotie naar `staging` uit.
   De beschermde workflow verifieert, bouwt drie images en laat de bestaande
   stagingrunner de gecontroleerde deployment uitvoeren. Geen runnerherinstallatie.
3. De vier nieuwe checksummed expandmigraties draaien vóór de nieuwe applicatie.
   Zij voegen optionele metadata, vertaalbewijs en communicatielocale toe; zij
   verplaatsen geen accounts en backfillen geen taalvoorkeuren. De correctiemigratie
   voor bronmatching wijzigt geen eerder geregistreerde migratiechecksum.
4. Verifieer release-SHA/readiness, `/en`, `/nl`, documentversies, eigen voorkeur,
   kamerflags en echte stagingauth. Productie is buiten deze opdracht gehouden.
5. Rollback gebruikt de bestaande vorige images/releaseprocedure. Laat optionele
   expandkolommen en onveranderlijke vertaal-/akkoordgegevens staan. Oude clients
   blijven werken; verwijder geen migraties of historische acceptaties.

Actuele bewijsresultaten en stagingstatus staan in
[de sprintoplevering](CHANGESET-2026-10-17-NL-EN-KAMERVLAGGEN.md).

## Officiële implementatiebronnen

- [Next.js internationalisation](https://nextjs.org/docs/app/guides/internationalization),
  plus de geïnstalleerde 16.3.8-documentatie voor proxy/headers/cookies.
- [FormatJS IntlMessageFormat](https://formatjs.github.io/docs/intl-messageformat/).
- [Supabase Auth-templates](https://supabase.com/docs/guides/auth/auth-email-templates),
  [redirects](https://supabase.com/docs/guides/auth/redirect-urls) en actuele changelog.
- [Google taalvarianten](https://developers.google.com/search/docs/specialty/international/localized-versions)
  en [W3C taalmarkering](https://www.w3.org/International/techniques/authoring-html.en).
- [ICO: toepasselijkheid UK GDPR](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/who-does-the-uk-gdpr-apply-to/).
