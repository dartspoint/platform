# DartsPoint Blog en SocialHero — implementatie en bewijs

De blog gebruikt het bestaande Next.js-platform, de actuele Supabase-sessiecontrole en PostgreSQL. Handmatige redactie en SocialHero gebruiken dezelfde artikel-, media- en publicatieservices. Er is geen nieuwe hostingomgeving, OpenAI-credential of meetpixel nodig.

De volledige gewijzigde-bestandenlijst voor beide repositories staat in [BLOG-BESTANDEN.txt](BLOG-BESTANDEN.txt).

## Repository en bron

- Remote gecontroleerd: `https://github.com/dartspoint/platform.git`.
- Aangetroffen schone checkout: `codex/ai-clubspelers`, commit `c31fc26ecee9df2e8b42b338581f282f9f084bbc`.
- Implementatiebranch: `codex/blog-socialhero`, gestart vanaf de opgehaalde `origin/main`: `9269abc35ad986dd5efd5798dbb336b69ead72e0`. De niet-gemergede NPC-commits zijn geen onderdeel van deze blogwijziging.
- Visuele bron: aangeleverd archief `DartsPoint-Blog-Codex-Overdracht.zip`, prototypecommit `88bb7867add03f0f834ea5e1e1ddf3c075a1ad6b`.
- Overgenomen: `components/blog/{public-blog,blog-content,blog-share,blog-editor,blog-admin}.tsx`, `darts-blog.css`, `blog-editor.css`, `blog-admin.css` en de zes redactionele referentiebeelden in `public/blog/`.
- Hergebruikt: marketingnavigatie, Manrope/Barlow Condensed, DartsAdmin, bestaande Dialog-componenten, localeprovider, domeinresolver, sessies, rollen, databasepool, auditlog, migratierunner en releaseworkflow.
- Vervangen: prototype-seed/store, D1, demo-auth en demo-API's. Productieroutes lezen uitsluitend `public.blog_live`; de voorbeeldartikelen worden alleen door een expliciet lokaal testscript aangemaakt.

## Gegevens en publicatie

`packages/contracts/src/blog.ts` bevat documentschema versie **1**, de taxonomieën en de CommonMark/GFM-importer. TipTap staat vast op **3.33.0**. Opmaak, H2–H4, lijsten, geneste quotes/codeblokken, taken, links, afbeeldingen met alt/onderschrift, tabellen en celuitlijning gebruiken hetzelfde beleid bij redactie en import. HTML, embeds, onbekende nodes, onveilige links en afbeeldingen buiten de eigen opslag worden geweigerd. Uitvoerbare HTML wordt nooit gerenderd.

Concepten hebben onveranderlijke revisies. Opslaan vereist de verwachte huidige revisie. Een nieuwe werkversie verandert de liveversie niet. Publiceren verplaatst liveprojectie, revisie en URL samen in één transactie. Slugs blijven gereserveerd per taal/site/omgeving; alle oude aliassen verwijzen rechtstreeks naar de nieuwste live-URL. Een expliciete handmatige URL-wijziging vraagt bevestiging. Gepubliceerde NL/EN-vertalingen kunnen als paar worden gekoppeld; alleen echte liveparen krijgen wederkerige hreflang met hun eigen slugs.

Het vaste redactieprofiel is `redactie` / **DartsPoint Redactie**. Categorie-ID's: `speltips`, `online-darten`, `community`. Bevoegde actuele owners en admins mogen redigeren en publiceren; alleen de owner beheert integratiecredentials. Sessieversie, intrekking, accountstatus, verplichte naamswijziging en actuele rol worden ook in de service gecontroleerd.

Uploads gebruiken het bestaande opslagpatroon met private PostgreSQL-bytea, afzonderlijk van de landschapsvarianten voor lobbybeelden. Sharp controleert/decodert JPG, PNG en WebP, verwijdert metadata door opnieuw te encoderen en bepaalt echte dimensies, MIME en dominante kleur. Limieten: 8 MiB, 50 miljoen invoerpixels, 64–12000 pixels per zijde; uitvoer past binnen 2400 × 3000. Alleen live-referenties maken media publiek. Een ontbrekend breed beeld krijgt een deterministische 1200 × 630-WebP-uitsnede van de hero met focuspunt. Media-ID's en uitsnedeparameters vormen de versiegebonden URL.

## API-contract

Basis: `/api/socialhero/v1`, contractversie **`1`**. Alle responses zijn privé/no-store en bevatten een veilige `X-Request-ID`; fouten bevatten ook `requestId`, `code` en `message`. Tokens zijn willekeurig, maximaal een jaar geldig en alleen als SHA-256-hash opgeslagen. Tokenwaarden verschijnen uitsluitend eenmalig bij aanmaak. Intrekking werkt onmiddellijk. Rotatie: maak een vervangende credential met dezelfde minimale scopes, test read-only, verbind opnieuw in SocialHero, trek daarna de vorige credential in. De overlap wordt begrensd door de ingestelde vervaldata; receipts behouden hun identiteit over rotatie.

Scopes: `capabilities:read`, `media:write`, `drafts:read`, `drafts:write`, `posts:publish`. De site en `APP_ENV` worden bij iedere bewerking opnieuw gecontroleerd. Geauthenticeerde integratieverzoeken hebben een limiet van 120 per minuut per token; 429 geeft `Retry-After: 60`.

| Endpoint | Gedrag |
| --- | --- |
| `GET /capabilities` | Site/omgeving, versie, taalgebonden `canonicalOrigins` en `publicOrigins` als arrays, scopes/rechten, auteurs, categorieën en media/documentlimieten. |
| `POST /media` | Multipart `file`, duurzame `Idempotency-Key`; resultaat bevat werkelijke `assetId`, `type`, `width`, `height`, `url` en kleur. De uitvoer kan WebP zijn bij een PNG-invoer. |
| `PUT /posts/{externalId}` | Nieuwe artikelen vereisen `If-None-Match: *`; updates de exacte quoted revisie-ETag in `If-Match`. Markdown of `tiptap-json` schema 1. |
| `GET /posts/{externalId}` | Draft/live-revisie, artikel-ID, openbare URL en publicatietijd; ETag van de werkversie. |
| `POST /posts/{externalId}/publish` | Alleen de opgegeven actuele revisie; runtimepublicatie, gevolgd door route-/sitemaprevalidatie. |

Idempotentiesleutels accepteren 1–240 tekens uit `A–Z a–z 0–9 _ : / . -`, inclusief de bestaande SocialHero-werksleutels. Scope: site, omgeving, principal, operatie en sleutel. Fingerprint, mutatie en resultaat worden atomair vastgelegd onder een advisory lock. Herhaling wordt vóór veranderlijke revisieprecondities afgehandeld; gewijzigde invoer met dezelfde sleutel geeft 409. Er worden geen tokens, requestheaders met geheimen of private conceptteksten gelogd.

Publieke HTML bevat canonical, JSON-LD, Open Graph, Twitter Card en `socialhero:external-id` / `socialhero:revision` voor de liveversie. Metadata wordt ook voor gewone HTTP-clients in de oorspronkelijke HTML-kop weergegeven. Een onbekend artikel geeft HTTP 404; een alias HTTP 308. SocialHero verifieert canonical, externe ID en revisie vóór afhankelijke socialpublicatie. De bestaande SocialHero-client, planning, durable workqueue en goedkeuringsregels zijn uitgebreid; zie de afzonderlijke overdracht `socialhero/docs/DARTSPOINT-BLOG-KOPPELING.md`.

## Omgevingen en configuratie

| Instelling | Betekenis |
| --- | --- |
| `APP_ENV` | Bestaande `development`, `staging` of `production`; harde grens voor tokens, artikelen, media en receipts. |
| `NEXT_PUBLIC_APP_URL` | Bestaande siteconfiguratie. Lokaal wordt de loopback-origin gebruikt; EN-artikelen gebruiken `/en/blog/[slug]`. |
| `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `REDIS_URL` | Bestaande afzonderlijke runtime-, migratie- en limietverbindingen. |
| `BLOG_SITE_ID` | Optioneel, standaard `dartspoint`; stabiel houden na koppeling. |
| `BLOG_CANONICAL_NL_ORIGIN`, `BLOG_CANONICAL_EN_ORIGIN` | Optionele serverconfiguratie. Standaard de bestaande NL/EN-origins per omgeving; geen override nodig voor DartsPoint. |

Productie gebruikt `https://dartspoint.nl` en `https://dartspoint.app`; staging `https://staging.dartspoint.nl` en `https://staging.dartspoint.app`. SocialHero krijgt expliciet beide toegestane origins per verbinding. De API-credential blijft op de API-basisorigin; publieke verificatie volgt alleen expliciet toegestane veilige origins en redirects. Productie is indexeerbaar; staging, beheer, preview en integratie-API's blijven noindex. Een stagingartikel heeft wel een canonical op de stagingorigin voor verificatie. Alleen productiecanonicals staan in de sitemap.

## Migratie en release

Nieuwe expand-only migratie: `supabase/migrations/20261113124820_blog_socialhero.sql`. Zij voegt private artikelen/revisies/slugreserveringen/tokens/receipts/media/referenties/vertalingsparen en de minimale `public.blog_live`-projectie toe. Private tabellen zijn niet toegankelijk voor anon/authenticated; alle nieuwe tabellen hebben RLS. De applicatierol kan oude revisies niet wijzigen. Er is geen backfill nodig.

De bestaande releaseketen blijft intact: CI, omgevingconfiguratie, vastgelegde images, migratierunner met advisory lock/checksums/transacties en daarna runtime. `npm run db:migrate` vereist `--expand-only` via de bestaande npm-scriptdefinitie. Zowel lokale controle als CI gebruikt dezelfde lexicografische migratievolgorde. Trek bij terugval credentials in of pauzeer de verbinding, zet de vorige applicatie-images terug via de bestaande releaseprocedure en behoud de nieuwe tabellen/revisies/receipts. Verwijder tabellen of migratiehistorie niet. Voor herstel gebruik de bestaande PostgreSQL/Restic-procedure; herhaal daarna statusuitlezing met dezelfde externe ID's en operatiesleutels.

## Uitgevoerde controles

De concrete resultaten en resterende stagingcontroles staan in `docs/BLOG-ACCEPTATIE.md`. Lokale bewijsbestanden staan in de genegeerde map `artifacts/blog/`. Private fixtures en mislukte conceptpayloads hebben mode 600 en worden niet gecommit. De bron voor reproduceerbare controles staat in `tests/` en `scripts/test-blog-fixture.ts`.

De werkelijke stagingkoppeling is nog geen geaccepteerde release: de huidige Nederlandse stagingblog geeft 404 en het Engelse stagingdomein geeft DNS `ENOTFOUND`. Er is geen productiepublicatie gedaan. Eerst de implementatie via de bestaande stagingrelease uitrollen, de Engelse origin bereikbaar maken en vervolgens SH-02/SEO/UI op die echte omgeving herhalen met een eigen testcredential.
