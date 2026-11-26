# SocialHero Connector v1

Beheer: `/beheer/blog` → **SocialHero**, uitsluitend voor de bestaande eigenaarrol. Open in SocialHero de blogkoppeling, maak een code voor de juiste website en omgeving en plak die hier. Vóór **Koppelen** zijn **SocialHero mag concepten aanleveren** en **SocialHero mag automatisch publiceren** zichtbaar. Beide staan bij een nieuwe bestemming standaard aan. De uitleg luidt: “SocialHero mag artikelen zelfstandig live zetten volgens de campagneplanning en de ingestelde goedkeuringsmodus.” Met **Koppelen** bevestigt de eigenaar deze keuzes. De website plant zelf geen campagnes: SocialHero roept de expliciete publicatieroute op het geplande tijdstip aan.

Rechten worden per stabiele bestemming, site en omgeving bewaard, inclusief beslisser, tijdstip en herkomst. Een bestaande uitschakeling blijft bij opnieuw koppelen en migraties behouden. Na koppelen kan de eigenaar de afzonderlijke rechten bewust aanpassen. Publiceren vereist ook conceptrechten. Intrekken werkt direct, ook bij een herhaald verzoek of een reeds verkregen machineprincipal. Eerder uitgegeven handmatige credentials blijven onder het bestaande lokale publicatiebeleid vallen.

**Verbinding controleren** hervat een onderbroken verificatie. De actieve controle leest de lokale verbindingsstaat en bewaart het tijdstip van die lokale controle; de SocialHero-server controleert zelf de actieve capabilities met zijn bearer. De actieve bearer wordt hier niet opnieuw opgeslagen om een providercontrole uit te voeren. **Ontkoppelen** trekt de lokale credential direct in. Artikelen, rechtenkeuzes en historie blijven bestaan.

## Configuratie en uitrol

De bestaande releaseketen voert `supabase/migrations/20261126102855_socialhero_pairing_v1.sql` en de uitbreidingsmigratie `20261126113210_socialhero_complete_blog.sql` uit vóór de nieuwe applicaties. Bestaande migraties zijn ongewijzigd. De uitbreiding bewaart bestaande toestemmingen conservatief en maakt alleen werkelijk gepubliceerde slugs tot openbare aliassen. Er zijn geen nieuwe verplichte hostingsecrets of hosthelpers. De bestaande database, mediaopslag, sessiecontrole en blogservice blijven in gebruik.

| Instelling | Bron / standaard |
| --- | --- |
| Canonieke koppelorigin | Serverconfiguratie `NEXT_PUBLIC_APP_URL`, staging `https://staging.dartspoint.nl`, productie `https://dartspoint.nl` |
| Omgeving | Bestaande `APP_ENV`, afzonderlijk `staging` en `production` |
| Stabiele site-ID | `BLOG_SITE_ID`, standaard `dartspoint`; niet aanpassen na koppelen |
| Vertrouwde SocialHero-server | `SOCIALHERO_SERVER_URL`, standaard `https://socialhero.dgwebservices.nl`; nooit vanuit browserinvoer |
| Tijdelijke encryptiesleutel | Onafhankelijke HKDF-sleutel uit bestaande server-only `SUPABASE_SECRET_KEY`; optioneel `SOCIALHERO_PROVISIONING_KEY` (minimaal 32 tekens) |
| Publieke taalorigins | Bestaande `BLOG_CANONICAL_NL_ORIGIN` / `BLOG_CANONICAL_EN_ORIGIN` en domeinstandaarden; capabilities meldt beide toegestane publieke origins |

De huidige beheerde hosthelper levert de bestaande variabelen. Overrides zijn optioneel voor andere installaties en vereisen daar de normale runtimeconfiguratie. Staging en productie gebruiken aparte databases/configuratie, connection-ID's en bearers. Dezelfde opgegeven SocialHero-meetpixel wordt asynchroon vanuit de rootlayout geladen; de pixel is onafhankelijk van de blogcredential.

## Analyticstoestemming en CTA's

De eigen toestemmingsmanager staat op publieke pagina's en bij inloggen/inschrijven. **Privacy-instellingen** opent de keuze opnieuw. Analytics staat uit totdat de bezoeker expliciet toestemt; weigeren en later intrekken zijn beschikbaar. Een geldige keuze wordt maximaal 180 dagen per browser/origin bewaard, los van account-, inschrijf- of publicatietoestemming. Verlopen, onleesbare of ontbrekende keuzes geven geen toestemming.

Vóór het pixelscript begint `window.socialheroConsent` op `false`. De callback zet de actuele boolean en verstuurt exact `socialhero:consent` met die boolean als `detail`. Een opgeslagen expliciete toestemming wordt opnieuw doorgegeven. Dit werkt ook als de pixel pas later laadt; intrekken en intrekken in een ander tabblad geven direct `false` door. De bridge blijft actief op de applicatiepagina's, zonder spel- of beheerknoppen met een banner te bedekken.

De inschrijf- en inlogacties zijn gemarkeerd met `data-socialhero-cta`. De website verstuurt daarvoor zelf geen formulierinhoud of aanvullende meetrequests; de bestaande SocialHero-pixel handelt toegestane CTA-klikken af. De toestemmingsmanager en CTA-attributen kunnen apart van de blogadapter naar een volgende website worden overgenomen.

## Contract en beveiliging

De server reserveert eerst een willekeurige `attemptId` met uitsluitend een hash van de code. Een herhaalde claim na een netwerkfout gebruikt hetzelfde attempt. De claim gaat naar de vaste SocialHero-origin en vaste v1-paden, zonder redirects en met begrensde antwoorden en time-out. Providerfouten worden naar gecontroleerde foutcodes vertaald.

Vóór `verify` commit de website de bearerhash, connection-ID, destination-ID, het lokale beleid en de status `pending`. Alleen `GET /api/socialhero/v1/capabilities` werkt dan met die credential. Andere routes geven `PAIRING_IN_PROGRESS` en `Retry-After`. Na de bevestiging wordt de credential `active`; de tijdelijk AES-GCM-versleutelde bearer wordt verwijderd. De tijdelijke kopie verloopt uiterlijk tien minuten na de lokale poging; de bestaande worker wist verlopen kopieën ook zonder beheersessie. Na sleutelrotatie kan een onderbroken installatie een nieuwe code vereisen. Definitieve verificatieafwijzing trekt de voorlopige credential in.

Een nieuwe verbinding trekt de specifieke vorige credential pas na succesvolle verificatie in. Alleen de actuele installatiepoging mag activeren. Ontkoppelen tijdens verificatie kan daardoor niet ongedaan worden gemaakt door een laat antwoord. Databasebeveiliging sluit browserrollen uit van instellingen, pogingen, hashes, revisies en receipts. Logging bevat alleen foutcode, status en request-ID.

De routes onder `/api/socialhero/v1` implementeren capabilities, media, post lezen/upsert, publicatie en `DELETE /connection`. De gekoppelde verbinding gebruikt numeriek `contractVersion: 1` en de actuele scopes `read`, optioneel `draft` en `publish`, volgens de bevestigde bestemmingskeuze. Capabilities leest auteurs en categorieën uit dezelfde bewerkbare records als het beheer. De oudere ETag-interface blijft beschikbaar voor bestaande handmatige credentials, onder hetzelfde lokale publicatiebeleid.

Conceptaanmaak vereist `baseRevision: null`; updates vereisen de actuele revisie. Alleen titel, type, locale en Markdown zijn inhoudelijk verplicht voor een concept. Auteur/categorie hebben bewerkbare redactionele standaarden. De website genereert de slug; vervolgwijzigingen behouden die tenzij expliciet een nieuwe slug is aangeleverd. De handmatige editor bewaart of de redacteur een slug bewust heeft aangepast; ongepubliceerde automatische slugs blijven de titel volgen. Publiceren vereist daarnaast een samenvatting en geüploade hero met alt-tekst. Capabilities meldt deze lokale vereisten. Media worden werkelijk gedecodeerd, gecontroleerd en opnieuw gecodeerd door de bestaande uploadservice. Artikelen, media, vertaalrelaties en idempotentieresultaten zijn aan de stabiele bestemming gebonden, zodat opnieuw koppelen dezelfde historie kan gebruiken en een ander project die niet kan wijzigen. Redactie en connector gebruiken dezelfde opslag-, revisie-, slugredirect- en publicatieservices. Nieuwe conceptrevisies vervangen de liveversie pas bij expliciete publicatie. Een conceptslug is wel gereserveerd, maar geeft vóór publicatie geen openbare redirect.

## Publicatiebevestiging en herstel

Een publicatie schrijft de aangewezen revisie, liveprojectie, actieve slug, datum, historische aliassen en duurzame publicatieoperatie atomair weg. De actuele rechten blijven tot die commit vergrendeld; de worker voert daarna uitsluitend de bevestiging uit, geen latere onbevoegde schrijfactie. De openbare pagina is dynamisch en bevat naast de revisie een willekeurige publieke publicatie-indicator. Na cacheverversing haalt de website de vaste eigen artikelroute werkelijk op en vergelijkt beide waarden en, waar aanwezig, de externe artikel-ID. Een HTTP 200 zonder die inhoud geldt niet als bevestiging.

Tot bevestiging retourneert de publicatieroute `202`, `state: "publishing"` en `Retry-After`; GET houdt de voortgang leesbaar. De worker, beheer en machine-retries gebruiken dezelfde duurzame operatie met begrensde lease en back-off. In Blogbeheer toont het artikel dat de openbare controle nog loopt, inclusief een veilige foutcode en retry. Een nieuwere publicatie kan een oudere controle vervangen. De oude idempotentiesleutel blijft naar zijn eigen operatie en aangewezen revisie verwijzen; `operationState: "superseded"`, `PUBLICATION_SUPERSEDED` en `retryable: false` maken een vervangen verzoek herkenbaar. SocialHero moet dan de actuele bronstatus lezen.

Een mislukte openbare controle vind je in `/beheer/blog` bij het artikel. Controleer de getoonde foutcode, de publieke route en de status; **Opnieuw controleren** hervat dezelfde operatie. Geheimen of ruwe providerantwoorden worden niet getoond. De beheerder kan een handmatig artikel maken met **Nieuw artikel**, auteur/categorie en TipTap-inhoud kiezen, eigen beelden uploaden, **Opslaan**, **Voorbeeld** en **Publiceren**. Een via SocialHero ontvangen testconcept staat in hetzelfde overzicht met herkomst **SocialHero**.

## Installatie bij een volgende Next.js-website

1. Neem `packages/socialhero/src/index.ts` over als lokale servermodule (of als privépakket bij gedeeld pakketbeheer). Deze module bevat de claimvalidatie, vaste providerpaden, foutvertaling, credentialhash en tijdelijke encryptie; hij heeft alleen Node crypto en Zod nodig.
2. Gebruik `packages/data/src/socialhero.ts` als lifecycle-adapter. Vervang de databasequeries en `authorizeBlogTokenOwnerInTransaction` door de bestaande transactionele opslag en beheerderscontrole. Bewaar `attemptId`, pending/active-staat, destination-ID, eenmalige encryptie en voorgangercontrole met dezelfde invarianten. Pas de migratie aan de lokale applicatierol aan.
3. Implementeer een dunne blogadapter met de bestaande CMS-services. DartsPoint doet dit in `packages/data/src/blog.ts`: `blogCapabilities`, `storeBlogMedia`, `getSocialHeroPost`, `saveSocialHeroDraft` en `publishSocialHeroPost`. Bijvoorbeeld: `saveSocialHeroDraft(principal, externalId, body, {key: request.headers.get('Idempotency-Key')!})` valideert `baseRevision` en roept dezelfde interne `save` aan als `saveBlogDraft` van de editor. Vul per site auteurs, categorieën, locales, mediavereisten, preview, canonical en cachehooks in.
4. Neem de dunne routes uit `apps/web/app/api/socialhero/v1` en de beschermde beheerroute/UI over. Bind alle machinevragen aan de servercredential, site en destination; vertrouw geen site-ID in een postbody. Houd de beheerroute achter bestaande sessiecontrole én Origin/CSRF-controle.
5. Configureer de vaste HTTPS-origins en gescheiden omgevingen. Migreer via de normale releaseketen. Oefen met een stagingcode en een herkenbaar stagingconcept. Controleer beide zichtbare rechten vóór koppelen en test publicatie expliciet op staging. Neem de bestemmingskeuzes, rechtensnapshot op de koppelattempt en de duurzame openbare publicatiecontrole mee naar de volgende adapter.

## Verificatie

`npm run typecheck`, `npm test`, `npm run build:deploy` en `python3 ops/scripts/check-ops.py` zijn de bestaande controles; deze repository heeft geen afzonderlijk lintcommando. `tests/integration/blog.ts` gebruikt een echte geïsoleerde PostgreSQL-database voor de blogservice en destination-/revisie-/publicatiecontroles. `tests/integration/socialhero-pairing.ts` gebruikt eveneens echte PostgreSQL-transacties met een gemockte SocialHero-HTTP-server voor claim, callbackvolgorde, retry/herstel, verval, ontkoppelen en rotatie. `bash scripts/test-blog.sh` voert deze controles en de bestaande browser-/HTTP-blogcontroles achtereenvolgens uit op de lokale ontwikkelomgeving.

Live release- en verificatieresultaten staan bij de oplevering, met de bijbehorende GitHub Actions-runs. Zonder geldige omgevingsgebonden SocialHero-code is een echte providerkoppeling of stagingpublicatie niet als geslaagd te beschouwen.
