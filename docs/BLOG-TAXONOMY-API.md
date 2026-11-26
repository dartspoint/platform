# Blogtaxonomie en gepagineerde lijsten

Auteurs en categorieën zijn records in `private.blog_taxonomy`, gescheiden per stabiele site-ID en omgeving. De oorspronkelijke ID's `redactie`, `speltips`, `online-darten` en `community` worden eenmaal als beginwaarden toegevoegd. Een herstart of herdeploy overschrijft geen aangepaste naam of archiefstatus.

`GET /api/blog-admin/taxonomy` geeft `{authors:[{id,name,active}],categories:[{id,name,active}]}`. De bestaande eigenaar- en beheerdersrechten zijn verplicht. `POST` gebruikt dezelfde sessie-, Origin- en requestlimietcontroles en accepteert:

- `{kind:"author"|"category",action:"create",name,id?}`; zonder ID maakt de server een stabiele ID aan.
- `{kind,action:"update",id,name?,active?}`; minstens één wijziging is verplicht. `active:true` herstelt een gearchiveerd record.
- `{kind,action:"archive",id}`; verwijdert geen artikel of revisie.

Een wijziging retourneert beide actuele lijsten. Dubbele ID of naam geeft `TAXONOMY_CONFLICT`; een ontbrekend record `TAXONOMY_NOT_FOUND`; ongeldige invoer `INVALID_TAXONOMY`. Er zijn maximaal 200 records per soort. Iedere wijziging bewaart beheerder en tijdstip en maakt een auditgebeurtenis.

De editor, SocialHero-capabilities en servervalidatie lezen dezelfde records. Nieuwe selecties vereisen actieve records. Een bestaande artikelrevisie mag haar eigen gearchiveerde auteur/categorie behouden. Aangeleverde weergavenamen worden door de databasewaarden vervangen. Gepubliceerde artikelen behouden de namen van hun gepubliceerde revisie tot de gewone publicatieflow een nieuwe versie activeert; HTML en JSON-LD gebruiken diezelfde publicatiegegevens.

`GET /api/blog-admin` retourneert `{entries,total,page,pageSize,hasMore}`. Parameters zijn `page` (vanaf 1), `pageSize` (1–50, standaard 20), `q` (maximaal 120 tekens), `categoryId`, `authorId`, `locale` (`nl-NL` of `en-GB`) en `state` (`all`, `draft`, `revision`, `published`, `publishing`). Zoek- en filterwerk vindt in PostgreSQL plaats. `GET /api/blog-admin?id=<uuid>` leest één bevoegd artikel onafhankelijk van de huidige pagina.

De openbare blogpagina gebruikt dezelfde paginering met twaalf artikelen per pagina en parameters `page`, `q` en `categorie`. Categorie-ID's zijn stabiel; oude links met een categorienaam blijven leesbaar. Gearchiveerde categorieën met bestaande live artikelen behouden hun publieke filter. Concepten blijven buiten de publieke query.

Voor een volgende website: neem de generieke ID-validatie, recordservice en beheerroute over, migreer de private tabel met RLS en beperkte applicatierechten, vervang de beginwaarden en sluit de bestaande CMS-autorisatie aan. Gebruik de taxonomie-resolver bij iedere nieuwe conceptrevisie en bied alleen actieve records aan als nieuwe keuze. `tests/integration/blog-taxonomy.ts` controleert echte databaseopslag, autorisatie, archiveren, servervalidatie, capabilities, filters en paginagrenzen in een tijdelijke lokale database.
