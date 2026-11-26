# SocialHero Connector v1

Beheer: `/beheer/blog` → **SocialHero**, uitsluitend voor de bestaande eigenaarrol. Open in SocialHero de blogkoppeling, maak een code voor de juiste website en omgeving en plak die hier. **Verbinding controleren** hervat een onderbroken verificatie. De actieve controle leest de lokale verbindingsstaat; de SocialHero-server controleert zelf de actieve capabilities met zijn bearer. **Ontkoppelen** trekt de lokale credential direct in. Artikelen en historie blijven bestaan. Publiceren staat standaard uit; zet **SocialHero mag artikelen publiceren** pas aan wanneer automatische publicatie is toegestaan. Het serverbeleid geldt ook voor oudere handmatig uitgegeven credentials en voor herhaalde publicatieverzoeken.

## Configuratie en uitrol

De bestaande releaseketen voert `supabase/migrations/20261126102855_socialhero_pairing_v1.sql` uit vóór de nieuwe applicaties. Er zijn geen nieuwe verplichte hostingsecrets of hosthelpers. De bestaande database, mediaopslag, sessiecontrole en blogservice blijven in gebruik.

| Instelling | Bron / standaard |
| --- | --- |
| Canonieke koppelorigin | Serverconfiguratie `NEXT_PUBLIC_APP_URL`, staging `https://staging.dartspoint.nl`, productie `https://dartspoint.nl` |
| Omgeving | Bestaande `APP_ENV`, afzonderlijk `staging` en `production` |
| Stabiele site-ID | `BLOG_SITE_ID`, standaard `dartspoint`; niet aanpassen na koppelen |
| Vertrouwde SocialHero-server | `SOCIALHERO_SERVER_URL`, standaard `https://socialhero.dgwebservices.nl`; nooit vanuit browserinvoer |
| Tijdelijke encryptiesleutel | Onafhankelijke HKDF-sleutel uit bestaande server-only `SUPABASE_SECRET_KEY`; optioneel `SOCIALHERO_PROVISIONING_KEY` (minimaal 32 tekens) |
| Publieke taalorigins | Bestaande `BLOG_CANONICAL_NL_ORIGIN` / `BLOG_CANONICAL_EN_ORIGIN` en domeinstandaarden; capabilities meldt beide toegestane publieke origins |

De huidige beheerde hosthelper levert de bestaande variabelen. Overrides zijn optioneel voor andere installaties en vereisen daar de normale runtimeconfiguratie. Staging en productie gebruiken aparte databases/configuratie, connection-ID's en bearers. Dezelfde opgegeven SocialHero-meetpixel wordt asynchroon vanuit de rootlayout geladen; de pixel is onafhankelijk van de blogcredential.

## Contract en beveiliging

De server reserveert eerst een willekeurige `attemptId` met uitsluitend een hash van de code. Een herhaalde claim na een netwerkfout gebruikt hetzelfde attempt. De claim gaat naar de vaste SocialHero-origin en vaste v1-paden, zonder redirects en met begrensde antwoorden en time-out. Providerfouten worden naar gecontroleerde foutcodes vertaald.

Vóór `verify` commit de website de bearerhash, connection-ID, destination-ID, het lokale beleid en de status `pending`. Alleen `GET /api/socialhero/v1/capabilities` werkt dan met die credential. Andere routes geven `PAIRING_IN_PROGRESS` en `Retry-After`. Na de bevestiging wordt de credential `active`; de tijdelijk AES-GCM-versleutelde bearer wordt verwijderd. De tijdelijke kopie verloopt uiterlijk tien minuten na de lokale poging; de bestaande worker wist verlopen kopieën ook zonder beheersessie. Na sleutelrotatie kan een onderbroken installatie een nieuwe code vereisen. Definitieve verificatieafwijzing trekt de voorlopige credential in.

Een nieuwe verbinding trekt de specifieke vorige credential pas na succesvolle verificatie in. Alleen de actuele installatiepoging mag activeren. Ontkoppelen tijdens verificatie kan daardoor niet ongedaan worden gemaakt door een laat antwoord. Databasebeveiliging sluit browserrollen uit van instellingen, pogingen, hashes, revisies en receipts. Logging bevat alleen foutcode, status en request-ID.

De routes onder `/api/socialhero/v1` implementeren capabilities, media, post lezen/upsert, publicatie en `DELETE /connection`. De gekoppelde verbinding gebruikt numeriek `contractVersion: 1` en scopes `read`, `draft`, optioneel `publish`. De oudere ETag-interface blijft beschikbaar voor bestaande handmatige credentials, onder hetzelfde lokale publicatiebeleid.

Conceptaanmaak vereist `baseRevision: null`; updates vereisen de actuele revisie. Alleen titel, type, locale en Markdown zijn inhoudelijk verplicht voor een concept. Auteur/categorie hebben bestaande redactionele standaarden. De website genereert de slug; vervolgwijzigingen behouden die tenzij expliciet een nieuwe slug is aangeleverd. Publiceren vereist daarnaast een samenvatting en geüploade hero met alt-tekst. Capabilities meldt deze lokale vereisten. Media worden werkelijk gedecodeerd, gecontroleerd en opnieuw gecodeerd door de bestaande uploadservice. Artikelen, media en idempotentieresultaten zijn aan de stabiele bestemming gebonden, zodat opnieuw koppelen dezelfde historie kan gebruiken en een ander project die niet kan wijzigen. Redactie en connector gebruiken dezelfde opslag-, revisie-, slugredirect- en publicatieservices. Nieuwe conceptrevisies vervangen de liveversie pas bij expliciete publicatie.

## Installatie bij een volgende Next.js-website

1. Neem `packages/socialhero/src/index.ts` over als lokale servermodule (of als privépakket bij gedeeld pakketbeheer). Deze module bevat de claimvalidatie, vaste providerpaden, foutvertaling, credentialhash en tijdelijke encryptie; hij heeft alleen Node crypto en Zod nodig.
2. Gebruik `packages/data/src/socialhero.ts` als lifecycle-adapter. Vervang de databasequeries en `authorizeBlogTokenOwnerInTransaction` door de bestaande transactionele opslag en beheerderscontrole. Bewaar `attemptId`, pending/active-staat, destination-ID, eenmalige encryptie en voorgangercontrole met dezelfde invarianten. Pas de migratie aan de lokale applicatierol aan.
3. Implementeer een dunne blogadapter met de bestaande CMS-services. DartsPoint doet dit in `packages/data/src/blog.ts`: `blogCapabilities`, `storeBlogMedia`, `getSocialHeroPost`, `saveSocialHeroDraft` en `publishSocialHeroPost`. Bijvoorbeeld: `saveSocialHeroDraft(principal, externalId, body, {key: request.headers.get('Idempotency-Key')!})` valideert `baseRevision` en roept dezelfde interne `save` aan als `saveBlogDraft` van de editor. Vul per site auteurs, categorieën, locales, mediavereisten, preview, canonical en cachehooks in.
4. Neem de dunne routes uit `apps/web/app/api/socialhero/v1` en de beschermde beheerroute/UI over. Bind alle machinevragen aan de servercredential, site en destination; vertrouw geen site-ID in een postbody. Houd de beheerroute achter bestaande sessiecontrole én Origin/CSRF-controle.
5. Configureer de vaste HTTPS-origins en gescheiden omgevingen. Migreer via de normale releaseketen. Oefen met een stagingcode en een herkenbaar stagingconcept, zonder publicatietoestemming; test publicatie daarna expliciet op staging.

## Verificatie

`npm run typecheck`, `npm test`, `npm run build:deploy` en `python3 ops/scripts/check-ops.py` zijn de bestaande controles; deze repository heeft geen afzonderlijk lintcommando. `tests/integration/blog.ts` gebruikt een echte geïsoleerde PostgreSQL-database voor de blogservice en destination-/revisie-/publicatiecontroles. `tests/integration/socialhero-pairing.ts` gebruikt eveneens echte PostgreSQL-transacties met een gemockte SocialHero-HTTP-server voor claim, callbackvolgorde, retry/herstel, verval, ontkoppelen en rotatie. `bash scripts/test-blog.sh` voert deze controles en de bestaande browser-/HTTP-blogcontroles achtereenvolgens uit op de lokale ontwikkelomgeving.

Live release- en verificatieresultaten staan bij de oplevering, met de bijbehorende GitHub Actions-runs. Zonder geldige omgevingsgebonden SocialHero-code is een echte providerkoppeling of stagingpublicatie niet als geslaagd te beschouwen.
