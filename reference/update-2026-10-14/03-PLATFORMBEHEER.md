# 03 — Platformbeheer, lobbywidgets en toernooiafbeeldingen

Dit document beschrijft de UI/UX die moet worden overgenomen en de productievoorzieningen die daarvoor nodig zijn. De gecontroleerde prototypebron is commit `6d473a3de23835494e238b6428cd3d5c15f240dd` van DartsPoint — V1. Bronpaden hieronder zijn relatief aan de root van die prototypebron.

**De bestaande componenten en stijlen zijn het grafische contract.** Neem ze over en verbind ze met de echte applicatie. De productiecontracten in dit document zijn **voorstellen**, geen bevestiging dat deze tabellen, endpoints of rechten al in de productierepo bestaan. Sluit ze aan op de bestaande database, authenticatie, autorisatie, mediavoorziening en realtime infrastructuur; introduceer daarvoor geen tweede platform.

De prototypegegevens komen uit lokale demostores. Een melding “opgeslagen” of “gepubliceerd” betekent daar opslag op hetzelfde apparaat. De vaste demobeheerder Nick, browseropslag, voorbeeldstemmen, demotoernooien en voorbeeldreacties zijn geen productie-implementatie.

## 1. Het functionele uitgangspunt

Er is één centraal beheerde lobby-inrichting. Die bestaat uit een begroeting, een bovenregel, een geordende verzameling widgets en centrale artikelen. Een beheerder hoeft geen aparte volledige pagina per kamer te onderhouden.

Iedere widget kiest zelf tussen:

- **Alle kamers**: hetzelfde widgetexemplaar verschijnt overal waar een speler toegang heeft tot een kamer.
- **Geselecteerde kamers**: dat exemplaar verschijnt alleen bij de gekozen stabiele kamer-id’s.

Sommige widgets lezen daarnaast de **huidige kamercontext**. De knop naar spelers opent bijvoorbeeld de spelerslijst van de kamer waarin de bezoeker zich bevindt. De titel van de pagina en de online spelers volgen eveneens de actuele kamer. Dit vereist geen kopie van de inrichting per kamer.

De centrale volgorde blijft gelden nadat niet-passende widgets zijn weggefilterd. Twee exemplaren van hetzelfde type mogen naast elkaar bestaan. Een kamerspecifiek exemplaar vervangt niet automatisch een algemeen exemplaar van dat type. Wie twee verschillende varianten wil, maakt twee widgets en kiest hun scopes expliciet.

Een kamer hernoemen verandert geen widgetselecties. Gebruik daarvoor bestaande primaire kamer-id’s, nooit de kamernaam. Kamerrechten blijven leidend: een geselecteerde privékamer geeft een gebruiker niet automatisch toegang tot die kamer of de inhoud ervan.

## 2. Broncomponenten die samen moeten worden overgenomen

| Onderdeel | Bron |
| --- | --- |
| Centrale lobby-editor, nieuwsbeheer, preview, concept- en publicatiebalk | `components/admin/darts-lobby-content.tsx` en `.css` |
| Beheernavigatie, contextlinks en geïntegreerd actielogboek | `components/admin/darts-admin.tsx`, `components/admin/darts-operations.tsx` |
| Schema, validatie, publicatiesnapshot en lokale lobby-opslag | `lib/darts-lobby-content.ts` |
| Werkelijke lobbyweergave en widgetinteracties | `components/darts-room-feed.tsx` en `.css` |
| Doorgeven van huidige kamer-id en openen vanuit de kamer | `components/darts-app.tsx` |
| Gedeelde afbeeldingskiezer | `components/admin/darts-hero-editor.tsx` en `.css` |
| Gedeeld afbeeldingstype en validatie | `lib/darts-hero-image.ts` |
| Gedeelde fotoweergave, uitsnede, contrast en fallback | `components/darts-hero-background.tsx` en `.css` |
| Toernooiwizard en aparte tab Uitstraling | `components/admin/darts-tournaments.tsx` en `.css` |
| Toernooimodel en opslag van de hero | `lib/darts-tournament-model.ts`, `lib/darts-tournament-store.ts` |
| Hero op de toernooipagina | `components/darts-tournament-room.tsx` en `.css` |
| Gerichte controles voor dit onderdeel | `scripts/check-lobby-content.mjs`, `scripts/check-hero-images.mjs`, `scripts/check-tournaments.mjs` |

`/beheer?tab=lobby` opent het lobbybeheer. De contextparameter `kamer=<stabiele-id>` kiest de betreffende kamer in het voorbeeld. Het prototype heeft daarnaast `/demo/beheer` als demonstratie-ingang. **Neem die demonstratie-ingang niet als bypass voor productieautorisatie over.** Een productiebeheerroute moet de echte ingelogde gebruiker en diens rechten controleren.

## 3. Exact over te nemen beheerervaring

### 3.1 Widgets

Behoud de tab **Widgets**, met de centrale bovenregel en begroeting boven het overzicht. De lijst toont per widget positie, type, breedte, titel en kamerselectie. Vanuit die lijst kan de beheerder:

1. Een widget van een van de acht ondersteunde types toevoegen.
2. De zichtbaarheid aan- of uitzetten.
3. De widget een plaats omhoog of omlaag verplaatsen.
4. De widget selecteren en rechts de inhoud aanpassen.
5. Een kopie met een nieuwe widget-id direct achter het origineel invoegen.
6. Verwijderen na de bestaande bevestiging.

De editor bevat titel, omschrijving, **Halve rij / Volledige rij** en **Alle kamers / Geselecteerde kamers**. Toon bij een kamerselectie bestaande kamers met hun huidige naam en status. Een verwijderde kamer mag geen onbedoelde verbreding naar alle kamers veroorzaken. Het prototype signaleert onbekende id’s en biedt “Selectie opschonen”. Behoud die herstelmogelijkheid.

Uitgeschakelde widgets blijven bewaard en bewerkbaar. Publiceren mag een uitgeschakelde widget met nog onvolledige inhoud toestaan, zolang de structuur, links, verwijzingen en media geldig zijn.

### 3.2 Nieuws & updates

Behoud de afzonderlijke tab **Nieuws & updates**. Artikelen zijn centraal beheerd en kunnen in meerdere nieuws-widgets worden geselecteerd. Velden: titel, soort bericht, zichtbaarheid, korte introductie, volledig artikel, optionele knoptekst en interne bestemming.

De artikelsoorten zijn `news`, `update` en `guide`, met de labels Nieuws, Productupdate en Uitleg & tips. De lobby gebruikt bij `guide` het label Voor nieuwe spelers. De body is gewone tekst met alinea’s, geen vrij HTML-document.

Een zichtbaar artikel wordt pas voor spelers bijgewerkt na publicatie van de lobby. “Zichtbaar” in een concept is dus geen onmiddellijke live-publicatie. Een nieuws-widget met een lege artikelselectie toont alle zichtbare artikelen uit die publicatie. Met een expliciete selectie toont hij uitsluitend de zichtbare artikelen uit die selectie, in de volgorde van de geselecteerde id’s.

De keuzelijst toont ook verborgen artikelen met een duidelijke status, zodat de beheerder ze uit een bestaande selectie kan halen. Een artikel verwijderen verwijdert zijn id uit alle conceptwidgets. **Als het de enige expliciete selectie van een nieuws-widget was, wordt die widget uitgeschakeld.** Er mag niet stilzwijgend `[]` ontstaan en daarmee ineens al het andere nieuws verschijnen. De verwijderbevestiging meldt dit gevolg.

### 3.3 Voorbeeld

Behoud de tab **Voorbeeld** met:

- Een kamerkeuze op stabiele kamer-id.
- **Huidig concept / Gepubliceerd**.
- Desktopbreedte en een mobiele weergave van ongeveer 410 px.
- Het werkelijke `RoomLobbyFeed`-component, geen afzonderlijke nagebouwde preview.
- De melding hoeveel widgets voor de gekozen kamer zijn ingesteld. Dit is geen garantie dat elke kaart op dat moment inhoud heeft: broninstellingen en beschikbaarheid kunnen dat beïnvloeden.

De preview gebruikt dezelfde selectie, bronnen, uitsnede, contrastlaag, lege toestanden en responsive regels als de gebruikersweergave. Concepttekst en conceptartikelen verschijnen uitsluitend in een geautoriseerde preview.

Previewinteracties mogen geen echte mutaties veroorzaken: niet inschrijven, geen kamerwissel, geen echte stem, geen applaus opslaan en geen gewijzigde persoonlijke voortgang. Navigatieknoppen tonen een toelichting. Artikelen mogen binnen de preview worden geopend. Stem- en applausinteractie mag tijdelijk worden gedemonstreerd zonder de productiedata te veranderen.

### 3.4 Opslaan, navigeren en publiceren

Behoud drie duidelijk verschillende toestanden:

| Toestand | Betekenis |
| --- | --- |
| Wijzigingen nog niet opgeslagen | De editor bevat wijzigingen die nog niet in het opgeslagen concept staan. |
| Concept opgeslagen · nog niet gepubliceerd | Het opgeslagen concept wijkt af van de gepubliceerde inrichting. |
| Lobby is bijgewerkt | Het huidige concept en de gepubliceerde inrichting zijn gelijk. |

“Concept opslaan” wijzigt nooit de live-inrichting. “Publiceren” valideert de volledige publiceerbare inrichting en maakt die als één geheel actief. De publicatieknop moet ook het huidige, nog niet afzonderlijk opgeslagen concept kunnen publiceren.

**Werkelijk prototypegedrag:** bij vertrek via de beheernavigatie of een bronlink wordt een gewijzigd concept eerst opgeslagen. Bij een opslagfout blijft de gebruiker op de pagina met een foutmelding. Refresh/sluiten met onopgeslagen wijzigingen gebruikt een browserwaarschuwing. Er is geen periodieke achtergrond-autosave. Schrijf die dus niet als reeds aanwezige functie op.

**Voorstel voor productie-autosave:** behoud bovenstaande interactie, voeg eventueel een korte debounce toe voor herstelbaarheid en toon altijd opslaan/opgeslagen/fout. Gebruik versiecontrole per verzoek. Bij een conflict mag een ouder concept geen nieuwere wijzigingen van een andere beheerder overschrijven. Bij navigatie eerst eventuele lopende conceptopslag afhandelen; een mislukte opslag blokkeert het vertrek of biedt een expliciete keuze de lokale wijzigingen weg te gooien. Publiceren is altijd een bewuste beheeractie, nooit een gevolg van autosave.

Tijdens upload of controle van een afbeelding zijn opslaan/publiceren uitgeschakeld. Een oud uploadresultaat mag na een bronwissel, widgetwissel of unmount niet alsnog de nieuwe keuze overschrijven. Een geannuleerde upload mag evenmin een blijvende “bezig”-toestand veroorzaken.

## 4. Widgetgedrag en gekoppelde bronnen

| Type | Instelbaar in lobbybeheer | Bron en gedrag |
| --- | --- | --- |
| `announcement` | Titel, tekst, bron `platform` of `custom`, scope, breedte | Bij `platform` wordt de actieve platformaankondiging gebruikt. Staat die uit of is de tekst leeg, dan is de widget verborgen. Bij `custom` wordt de eigen widgettekst gebruikt. Een algemene onderhoudsmelding staat los van de widgetvolgorde. |
| `tournament` | Automatisch of specifiek toernooi, optionele eigen titel/omschrijving, knoptekst, beeldmodus, scope, breedte | Toont alleen een gepubliceerd toernooi in inschrijving, check-in of live. Deelnemersaantal, capaciteit, datum, status en regels komen uit het bestaande toernooi. Een lege titel/omschrijving volgt de toernooigegevens. |
| `players` | Titel, omschrijving, knoptekst, scope, breedte | Opent de spelerslijst van de huidige kamer. De kamercontext komt uit de echte room state. |
| `challenge` | Titel, omschrijving, knoptekst, scope, breedte | Koppelt aan de bestaande weekchallenge en de persoonlijke voortgang van de bezoeker. Geen globale of handmatig gekopieerde voortgang. |
| `moment` | Titel, omschrijving, speler, score, scorelabel, voorbeeldapplaus, scope, breedte | Het prototype heeft handmatig ingevulde prestaties en lokale applausreacties. Productie moet de speler identificeren via een gebruikers-id en reacties serverzijdig tellen. |
| `news` | Titel, omschrijving, artikelselectie, scope, breedte | Leest alleen zichtbare artikelen uit dezelfde gepubliceerde lobbyversie. Lege selectie betekent alle zichtbare artikelen. |
| `poll` | Vraag als titel, toelichting, twee tot vijf antwoorden, scope, breedte | Het prototype bewaart één lokale keuze per widget-id en antwoordset. De gebruiker kan wijzigen en intrekken. Productie gebruikt echte stemmen, geen demostartwaarden. |
| `divisions` | Titel, omschrijving, knoptekst, scope, breedte | Opent het bestaande divisieoverzicht; indeling en seizoenen blijven in het bestaande seizoensbeheer. |

Behoud de bronlinks vanuit de editor naar Platforminstellingen, Toernooibeheer, Oefenruimte, Nieuws & updates en Seizoenen & divisies. Maak geen tweede toernooibeheer of tweede divisieconfiguratie in de lobby-editor.

De filters in de lobby blijven Ontdekken, Toernooien, Community en Nieuws. Aankondigingen en nieuws vallen onder Nieuws; toernooiwidgets onder Toernooien; de overige types onder Community. Ontdekken toont alle passende widgets. Een lege selectie toont de bestaande rustige lege toestand met een optie terug te gaan naar alles.

**Toernooiselectie in de gecontroleerde bron:** bij automatische selectie wordt eerst het eerste beschikbare toernooi met open inschrijving gekozen, anders het eerste beschikbare toernooi. Dat is de volgorde van de aangeleverde toernooilijst, geen expliciete datum-sortering. Bij een specifiek id dat niet meer beschikbaar is, toont de kaart de lege toernooitoestand met kalenderknop; er wordt niet heimelijk een ander toernooi gekozen. **Voorstel:** leg voor de productiequery een deterministische volgorde vast, bijvoorbeeld eerst inschrijfbaar, daarna startdatum en id. Zorg dat beheerpreview en lobby dezelfde resolver gebruiken en vermijd een UI-belofte “eerstvolgend” zonder bijbehorende sortering.

## 5. Exacte prototypevelden en validatie

Deze grenzen zijn vastgesteld in de bron. Handhaaf ze ten minste serverzijdig en stem de formulieren daarop af. Het prototype gebruikt JavaScript-stringlengte; bepaal expliciet hoe de server Unicode telt zodat client en server dezelfde grens hanteren.

### 5.1 Layout, widget en artikel

| Veld | Prototypevalidatie |
| --- | --- |
| `LobbyLayout.headline` | String, maximaal 100 tekens; niet leeg bij publicatie. |
| `LobbyLayout.eyebrow` | String, maximaal 80 tekens. |
| `widgets` | Array, maximaal 30 widgets. |
| `articles` | Array, maximaal 60 artikelen. |
| Widget- en artikel-id | Uniek binnen de eigen array; patroon `^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$`. Productie mag bestaande UUID’s gebruiken en via een adapter dezelfde stabiele identiteit leveren. |
| `widget.type` | Een van de acht hierboven genoemde types. |
| `widget.enabled` | Boolean. |
| `widget.size` | `half` of `wide`. |
| `widget.title` | String, maximaal 140 tekens; verplicht bij publicatie voor ingeschakelde widgets, behalve `tournament`. |
| `widget.description` | String, maximaal 800 tekens. |
| `audience.mode` | `all` of `rooms`. |
| `audience.roomIds` | Maximaal 100 unieke geldige id’s; bij publicatie van een ingeschakelde `rooms`-widget minimaal één. De lokale validator controleert id-formaat, niet of de kamer werkelijk bestaat. Productie moet referentiële controle toevoegen. |
| `article.category` | `news`, `update` of `guide`. |
| `article.published` | Boolean; bepaalt beschikbaarheid binnen de uiteindelijke lobbypublicatie. |
| `article.title` | Maximaal 140 tekens; verplicht bij publicatie wanneer het artikel zichtbaar is. |
| `article.summary` | Maximaal 400 tekens; onder dezelfde voorwaarde verplicht. |
| `article.body` | Maximaal 12.000 tekens; onder dezelfde voorwaarde verplicht. |
| `article.ctaLabel` | Optioneel, maximaal 60 tekens. |
| `article.ctaHref` | Optionele interne link, maximaal 500 tekens in de validator; de huidige invoer beperkt dit tot 200. |

### 5.2 Widgetinstellingen

| Veld | Prototypevalidatie en betekenis |
| --- | --- |
| `announcementSource` | Optioneel `platform` of `custom`; de renderer behandelt ontbrekend als platformbron. Voor een actieve eigen aankondiging moet de beschrijving tekst bevatten. |
| `tournamentId` | Optioneel, maximaal 160 tekens. Leeg betekent automatische selectie. |
| `tournamentImageMode` | Optioneel `inherit`, `custom` of `none`; ontbrekend betekent overnemen. |
| `heroImage` | Optioneel `HeroImage`; indien aanwezig altijd valideren, ook wanneer het widget uitstaat. Bij publicatie van een actieve toernooiwidget met `custom` is een niet-lege afbeeldingsbron vereist. |
| `articleIds` | Optioneel, maximaal 20 unieke bestaande artikel-id’s uit dezelfde layout. Een lege array betekent alle zichtbare artikelen. |
| `playerName`, `score`, `scoreLabel`, `ctaLabel` | Optionele strings, elk maximaal 80 tekens in de store. De UI beperkt speler tot 40, score tot 20 en knoptekst tot 60. Voor een gepubliceerd actief communitymoment is een niet-lege speler vereist. |
| `seedApplause` | Optioneel geheel getal 0–1.000.000. Alleen prototype-voorbeeldwaarde; de UI gebruikt maximaal 999.999. Niet als echte communityreacties migreren. |
| `pollOptions` | Maximaal vijf strings van maximaal 160 tekens in de store; UI maximaal 100 per antwoord. Bij publicatie van een actieve poll twee tot vijf niet-lege antwoorden, uniek na trimmen en hoofdletterongevoelige vergelijking. |
| `pollVotes` | Optioneel maximaal vijf gehele aantallen 0–1.000.000; bij een actieve gepubliceerde poll precies één aantal per antwoord. Dit zijn prototypevoorbeeldstemmen, geen productievelden voor handmatige aantallen. |
| `ctaHref` | Optionele interne link, maximaal 500 tekens. Alleen same-site paden; geen protocol-relative links, backslashes, witruimte, controletekens of gecodeerde varianten daarvan. |

De validatie van een concept staat onvolledige inhoud toe, maar geen ongeldige types, onveilige links, dubbele id’s, ontbrekende artikelreferenties of ongeldig beeldmateriaal. Gebruik bij productie typegebonden payloadvalidatie: instellingen die niet bij het gekozen widgettype horen hoeven niet te worden opgeslagen.

## 6. Toernooihero en overerving

### 6.1 Instellingen op het toernooi

Het toernooi heeft een optioneel veld `hero: HeroImage`. De toernooiwizard bevat de vierde stap **Uitstraling**. Het detailbeheer heeft een zelfstandige tab **Uitstraling**, met afbeelding, uitsnede, contrast, opslaan en terugzetten.

Een wijziging via die tab patcht alleen de hero. Deze wijziging moet ook bij een live of afgerond toernooi mogelijk zijn voor een bevoegde beheerder. De wijziging mag geen deelnemers, bracket, uitslagen, winnaar, bordplanning, gereedmeldingen, Elo of spelregels resetten. Een gekloond toernooi neemt de hero mee.

De toernooipagina en de lobbykaart gebruiken dezelfde `DartsHeroBackground`. Een ontbrekende hero op oudere toernooien volgt de standaard DartsPoint-foto. Een expliciete lege bron betekent bewust geen foto en geeft de bestaande grafische stijl. Bij een niet-laadbare foto blijft die grafische fallback bruikbaar. De beheereditor geeft bij een kapotte bron een zichtbare foutmelding.

### 6.2 Keuze per toernooiwidget

| Widgetkeuze | Resolved afbeelding | Gevolg van aanpassen van de toernooihero |
| --- | --- | --- |
| `inherit` | Afbeelding, X/Y-positie en overlay van het gekozen of automatisch geselecteerde toernooi | Wordt automatisch overgenomen zonder opnieuw de lobby te publiceren. |
| `custom` | `widget.settings.heroImage` uit de lobbypublicatie | Blijft de eigen afbeelding gebruiken; de toernooipagina verandert hierdoor niet. |
| `none` | Geen foto; grafische toernooikaart | Blijft zonder foto; de toernooipagina houdt zijn eigen keuze. |

De beeldmodus geldt voor dat widgetexemplaar in alle kamers die het exemplaar selecteert. Er is geen onzichtbare extra afwijking per kamer. Voor een andere foto in één kamer maak je een apart exemplaar met eigen beeldinstelling en passende kamerselectie.

Bij omschakelen naar `custom` initialiseert het prototype de editor met de geërfde afbeelding, of met de standaardfoto wanneer de geërfde instelling geen foto heeft. Daarna is het een zelfstandige widgetkeuze. Terugschakelen naar `inherit` gebruikt weer het toernooi; een bewaarde custom keuze mag pas weer effect krijgen wanneer custom expliciet wordt geselecteerd.

### 6.3 `HeroImage` en afbeeldingskiezer

```ts
type HeroImage = {
  src: string;
  positionX: number;
  positionY: number;
  overlay: number;
};
```

| Eigenschap | Exact prototypecontract |
| --- | --- |
| Standaard | `/marketing/afterhours-hero.webp`, X 70, Y 50, overlay 45. |
| Geen foto | `src: ""`; standaard X/Y 50 en overlay 45. |
| X/Y | Eindige getallen 0–100; sliders in stappen van 1; `object-fit: cover` met dezelfde `object-position`. |
| Overlay | Eindig getal 25–85; donkere laag `#06150d` met opacity `overlay / 100`, plus de gedeelde contrastgradient uit `darts-hero-background.css`. Kopieer de gedeelde CSS, geen afwijkende gradient in de editor. |
| Bronnen | Veilige lokale paden, credential-vrije HTTPS-links of PNG/JPEG/WebP base64-data. Geen SVG-, HTML-, JavaScript- of andere data-typen. |
| Bronlengte | Maximaal 300.000 tekens totaal. Voor URL/pad bovendien maximaal 4096; de URL-invoer beperkt tot 2000. |
| Upload | PNG, JPG of WebP; bestand groter dan 0 en maximaal 8 MiB; maximaal 50 miljoen gedecodeerde pixels. |
| Optimalisatie | Binnen 1600 × 900, met behoud van verhouding en zonder vergroten; zo nodig extra verkleinen en kwaliteitsreductie, WebP en zo nodig JPEG-fallback, binnen bovengenoemde bronlengte. |
| Controle | Directe HTTPS-afbeelding eerst laden; timeout 12 seconden. Verkeerd type, te groot, onbereikbaar of niet te verwerken geeft een concrete fout. |
| Interactie | Bronwissel en unmount annuleren de toepassing van oude async resultaten. X/Y worden bij een nieuwe eigen bron 50/50; de gekozen overlay blijft behouden. |

De 300.000-tekenlimiet en base64-opslag bestaan vanwege de lokale prototypeopslag. Ze zijn geen aanbevolen productie-opslagstrategie.

## 7. Snapshots, actuele bronnen en audit

De lokale `LobbyContentState` heeft `draft`, `published`, `revision`, `savedAt`, `publishedAt` en `audit`. Concept en publicatie zijn diepe kopieën; objecten worden bevroren. Een conceptwijziging mag de publicatie niet via gedeelde objectreferenties veranderen.

`saveLobbyDraft` valideert structureel, slaat alleen het concept op en schrijft bij een echte wijziging een auditregel. Een identieke conceptsave doet niets. `publishLobbyLayout` valideert strenger, kopieert de opgegeven layout naar zowel concept als publicatie, verhoogt de publicatierevisie en zet beide tijdstempels. Publicatie is dus één samenhangende layout inclusief de artikelinhoud.

**Let op het onderscheid:** de layout is een publicatiesnapshot, maar platformaankondigingen, onderhoudsstatus, toernooi-informatie, een geërfde toernooihero, kamerbezetting en persoonlijke challengevoortgang worden actueel uit hun eigen bron gelezen. Een snapshotsysteem mag die dynamische bronnen niet per ongeluk bevriezen. Omgekeerd mag het lezen van live artikelen uit een centrale tabel geen ongepubliceerde artikelwijzigingen door een oude lobbypublicatie laten lekken.

Het prototype bewaart maximaal 250 lobby-auditregels met `id`, `at`, `actor`, `action`, `subject`, `detail`; de actor is daarin de vaste demo-identiteit. De lobbylog wordt in het algemene actielogboek samengevoegd. Prototypeopslag gebruikt `dartspoint-lobby-content-v1`, maximaal 2.000.000 geserialiseerde tekens, en meldt opslagfouten voordat de in-memory staat wordt vastgelegd. Andere browsertabs krijgen geldige wijzigingen via `storage`-events. Dit is geen multi-user concurrencyprotocol.

## 8. Voorstel — productiedatamodel

Behoud de bestaande relationele database en bestaande gebruikers-, kamer- en toernooientiteiten. Raadpleeg `05-REPO-INTEGRATIE.md` voor de gecontroleerde aansluitpunten in de productierepo; de bestaande `private.system_settings`, versiecontrole en `private.audit_events` kunnen hiervoor worden hergebruikt waar hun contract dat toelaat. Onderstaande namen zijn een **voorstel**; pas namen en migratiestijl aan de repo aan. De UI mag via adapters dezelfde `LobbyLayout`-vorm ontvangen.

| Entiteit | Voorgestelde verantwoordelijkheid |
| --- | --- |
| `lobby_configuration` | Eén centraal record per bestaand platformbereik: id, `draft_version`, `published_revision_id`, `updated_by`, `updated_at`. Geen verplicht record per kamer. |
| `lobby_draft` | Valideerbare documentpayload met huidige widgetvolgorde, artikelconcepten en configuratie; `schema_version`, `version`, `updated_by`, `updated_at`. Database-JSON is bruikbaar mits de server het volledige schema valideert. |
| `lobby_revision` | Onveranderlijke publicaties: config-id, oplopend revisienummer, volledig layoutdocument, schema-versie, maker, publicatietijd en optionele herkomst bij herstel van een oude versie. |
| `lobby_revision_room_reference` | Optionele relationele index van expliciete kamerreferenties per revisie/widget, voor referentiële controle en beheerimpact. Niet nodig als dezelfde garanties via de bestaande datalaag worden geleverd. |
| `media_asset` | Id, eigenaar/platformbereik, veilige object-key, MIME, bytes, breedte/hoogte, checksum, status `processing/ready/failed`, auteur, tijdstempels en beschikbare afbeeldingsvarianten. Geen data-URL in iedere widgetrij. |
| Bestaand toernooi | Hero-instelling met media-id of toegestane standaardasset, focal X/Y, overlay, beeldmodus/geen-foto, eigen versie of bestaande `updated_at`-concurrency. |
| `content_audit_event` of bestaand auditlog | Serverbepaalde actor, actie, entiteit, revisie, tijd, request-id en compacte wijzigingssamenvatting. Voor-/na-referenties waar nodig. |
| Poll en pollopties | Een pollidentiteit plus versie van de antwoordset; stabiele optie-id’s. Een nieuwe antwoordset maakt een nieuwe stemversie. |
| Pollstem / applausreactie | Relatie met echte gebruiker en pollversie of communitymoment; unieke constraint verhindert dubbele reacties van dezelfde gebruiker. |

Artikelen mogen als centrale entiteiten worden beheerd, maar neem hun **gepubliceerde inhoud of onveranderlijke artikelrevisie** op in een lobbypublicatie. Het prototype bundelt ze in één layout; behoud het resultaat dat een conceptartikel geen bestaande publicatie verandert.

Voor productiemedia is het voorstel een presentatieobject als `{ assetId, positionX, positionY, overlay }`. Een serveradapter levert de bestaande componenten een vertrouwde `src` naar de juiste beeldvariant. `inherit/custom/none` blijft apart op de widget staan. Bewaar geen willekeurige uitvoerbare HTML of CSS in dit object.

Een algemene widget gebruikt dezelfde identiteit in alle passende kamers. Daarmee is een poll standaard dezelfde poll, met dezelfde echte stemtellingen, over die kamers heen. Als afzonderlijke polls per kamer nodig zijn, maak aparte expliciete poll-/widgetidentiteiten. Laat dit niet onbedoeld afhangen van de huidige room-id of van de renderpositie.

## 9. Voorstel — API-contracten

Gebruik de bestaande API-conventies van de productierepo. Onderstaande paden en payloadnamen zijn een **voorstel**.

| Methode en pad | Bedoeling en belangrijke respons/controle |
| --- | --- |
| `GET /api/admin/lobby` | Concept, conceptversie/ETag, gepubliceerde revisie, tijdstempels en beheerrechten. Alleen geautoriseerd beheer. |
| `PUT /api/admin/lobby/draft` | Volledige conceptpayload met `If-Match` of `expectedDraftVersion`. Structureel valideren; atomair opslaan; retourneert nieuwe versie en server-tijd. |
| `POST /api/admin/lobby/preview` | Gewenste conceptpayload of opgeslagen conceptversie plus `roomId`; servercontrole van scope en bronreferenties; retourneert dezelfde geresolveerde inhoudsvorm als de publieke feed, zonder mutaties. |
| `POST /api/admin/lobby/publish` | `expectedDraftVersion` plus eventueel expliciete huidige layout; server valideert volledige publicatie, maakt immutable revisie, werkt concept en actieve pointer in één transactie bij en schrijft audit. |
| `GET /api/admin/lobby/revisions` | Publicatiehistorie. Optioneel voor de eerste UI, maar opslag moet revisies niet onnodig overschrijven. |
| `POST /api/admin/lobby/revisions/{id}/restore` | Optionele herstelactie: oude inhoud als nieuw concept; geen stilzwijgende livewijziging. Publiceren maakt daarna een nieuwe revisie. |
| `GET /api/rooms/{roomId}/lobby` | Geautoriseerde, voor deze kamer gefilterde gepubliceerde feed met revisie/sourceversies. Geen draft, audit of niet-toegankelijke kamerinhoud teruggeven. |
| `POST /api/admin/media/uploads` | Begin een gecontroleerde upload of gebruik bestaand multipart-uploadendpoint; retourneert upload-id, voorwaarden en bestemming. |
| `POST /api/admin/media/uploads/{id}/complete` | Valideer werkelijk bestand, verwerk beeldvarianten en markeer asset gereed. Een nog verwerkte/afgekeurde asset is niet publiceerbaar. |
| `PATCH /api/admin/tournaments/{id}/hero` | Alleen hero-presentatie wijzigen met concurrencycontrole en toernooirechten. Geen impliciete call naar bracketreset of herplanning. |
| `PUT /api/polls/{id}/vote` | Stem voor een bestaande optie in de huidige pollversie; één keuze per gebruiker, wijzigen toegestaan. |
| `DELETE /api/polls/{id}/vote` | Eigen stem intrekken. |
| `PUT/DELETE /api/community-moments/{id}/applause` | Eigen applausreactie zetten of intrekken; teller uit echte records. |

Stuur validatiefouten terug met een bruikbaar veldpad, bijvoorbeeld `widgets[3].audience.roomIds` of `articles[1].body`, en een Nederlandse boodschap. Richtlijn: `400/422` voor ongeldige inhoud, `401/403` voor ontbreken van rechten, `409` voor versieverlies en `413` voor te grote uploads. Dit zijn voorstellen; gebruik bestaande foutconventies als die al consistent zijn.

Publicatie en mediasave mogen bij netwerkproblemen opnieuw geprobeerd kunnen worden zonder dubbele audit/publicaties. Gebruik de bestaande idempotencyvoorziening of een request-id per publicatie. Toon “opgeslagen/gepubliceerd” pas na een bevestigde servercommit.

## 10. Voorstel — mediaopslag en afbeeldingverwerking

Behoud de gebruikservaring van de kiezer, maar upload naar de bestaande media/objectopslag. De browseroptimalisatie is een gebruiksvriendelijke voorbewerking, geen vervanging voor servercontrole. Verifieer serverzijdig daadwerkelijke bestandssignatuur, decodering, dimensies en limieten; verwerk de afbeelding opnieuw naar bekende formaten en sla beeldmetadata apart op. Maak geen scriptbare bestanden uitvoerbaar onder een applicatieroute.

Bewaar originals en varianten volgens het bestaande opslagbeleid. Genereer een passende mobiele en brede variant, bijvoorbeeld binnen de huidige 1600 × 900-doos, en lever breedte/hoogte zodat layoutverschuiving wordt voorkomen. Behoud de X/Y-uitsnede als presentatie-instelling; snijd het origineel niet destructief bij elke sliderbeweging.

**Voorstel voor HTTPS-afbeeldingen:** behoud “Afbeeldingslink” in de UI, maar kies één duidelijke productieaanpak. Gebruik bij voorkeur een gecontroleerde import naar eigen mediaopslag. Als de server een externe URL ophaalt, valideer protocol, bestemming en iedere redirect; blokkeer interne/loopback/link-local adressen, stel byte-/tijdlimieten in en controleer het opgehaalde bestand. De prototypefunctie die een URL in de browser kan laden is onvoldoende bescherming voor server-side ophalen. Een tweede mogelijkheid is alleen expliciet toegestane externe afbeeldingshosts leveren; maak deze beperking duidelijk in de editor.

Een asset die nog door een actieve publicatie, bewaarde revisie of toernooi wordt gebruikt, mag niet direct worden verwijderd. Gebruik referentiecontrole en het bestaande bewaarbeleid. Ongebruikte afgebroken uploads kunnen later worden opgeruimd. De standaardfoto moet als versievaste meegeleverde asset of medierecord beschikbaar blijven.

## 11. Voorstel — rechten en publicatieproces

Koppel handelingen aan echte bestaande rollen of capabilities. Volgens de repoanalyse in `05-REPO-INTEGRATIE.md` is toegang tot `/beheer` beschikbaar voor owner/admin, maar het bestaande opslaan van platforminstellingen owner-only. Behoud die bestaande grens voor centrale publicatie tenzij er expliciet een nieuw, getest contentrecht wordt ingevoerd. Een zichtbaar beheermenu is geen schrijfbevoegdheid. Onderstaande verdeling is een **voorstel**, geen nieuw te omzeilen rollenstelsel.

| Recht | Mogelijke bestaande rol | Reikwijdte |
| --- | --- | --- |
| Lobby lezen/bewerken/preview | Platformbeheerder; eventueel expliciete contentredacteur | Centrale conceptinhoud en widgetscopes. |
| Lobby publiceren/herstellen | Platformeigenaar of beheerder met publicatierecht | Bewuste livewijzigingen, met audit. |
| Media uploaden/selecteren | Dezelfde redactierechten binnen eigen platformbereik | Geen toegang tot willekeurige assets van anderen. |
| Toernooihero wijzigen | Platformbeheer of bestaande toernooibeheerder voor dat toernooi | Alleen uitstraling; dit verleent geen recht spelregels of uitslagen te wijzigen. |
| Kamer modereren | Bestaande kamermoderator | Niet automatisch bevoegd om de centrale lobby te publiceren. |
| Feed lezen en reageren | Bestaande toegelaten speler/gebruiker | Alleen toegankelijke kamers en eigen reacties. |

Verberg onbevoegde acties in de UI én controleer ze serverzijdig bij iedere aanvraag. Vertrouw niet op `localStorage`, een queryparameter, de naam Nick of het feit dat iemand de beheerpaginacomponent kan openen. Gebruik de bestaande sessie-, CSRF- en rate-limitvoorzieningen.

Voorgestelde publicatietransactie:

1. Controleer actor, bevoegdheid en verwachte conceptversie.
2. Valideer structuur, inhoud, actieve scopes, bestaande kamer-/artikel-/toernooiverwijzingen en gereed beeldmateriaal.
3. Leg een complete onveranderlijke layout-/artikelrevisie vast.
4. Werk de actieve publicatiepointer en eventueel het tegelijk opgeslagen concept atomair bij.
5. Schrijf de audit met de echte actor en server-tijd.
6. Maak na commit caches ongeldig en stuur via de bestaande realtimevoorziening een revisiebericht.
7. Clients laden de nieuwe gepubliceerde configuratie en behouden hun chat/game state. Een lobbypublicatie mag geen lopende partij onderbreken of opnieuw initialiseren.

Een platformaankondiging of geërfde toernooihero is bewust een actuele bron. Een wijziging daar heeft effect op alle inheriting widgets. Toon dat bereik bij de betreffende beheeractie en laat een eigen widgetoverride ongemoeid. Leg de wijziging vast in het auditlog van die bron; noem een bronwijziging niet ten onrechte een nieuwe lobbypublicatie.

Cache algemene layout-/artikelinhoud per revisie en kamerscope. Persoonlijke challengevoortgang, eigen stemstatus en eigen applausstatus zijn gebruikersdata: niet via een publiek gedeelde cache aan anderen leveren. Een cachekey alleen op lobbyrevisie is onvoldoende wanneer toernooi- of platformbronnen daarnaast actueel veranderen.

## 12. Implementatievolgorde en acceptatie

1. Neem componenten, CSS en beeldasset over en behoud de bestaande responsive indeling. Verander geen gameplay- of chatlayout voor dit beheeronderdeel.
2. Implementeer schema/migraties, bronresolvers en rechten in de bestaande backend.
3. Vervang lokale lobby- en hero-opslag via adapters door serveropslag; houd concept/publicatie en bronovererving intact.
4. Koppel publicatie, audit, preview en cache-/realtimeverversing.
5. Vervang demo-reacties, voorbeeldstemmen, kamerbezetting, spelersnamen en persoonlijke voortgang door echte domeingegevens. Seed alleen herkenbare voorbeeldinhoud in een expliciete testomgeving.
6. Voer gerichte regressies uit op scope, snapshotisolatie, artikelverwijdering, hero-overerving, mediafouten, bevoegdheden en gelijktijdig beheer. Bewijs dat hero-opslag een bestaande livewedstrijd en bracket ongewijzigd laat.

Minimale controlegevallen:

- Een algemene widget verschijnt in twee toegankelijke kamers; een geselecteerde widget uitsluitend in de gekozen kamer.
- Kamer hernoemen behoudt de selectie. Kamer verwijderen maakt de widget nooit algemeen zichtbaar.
- Volgorde, half/wide, uitschakelen, kopiëren en verwijderen blijven na opslaan en opnieuw openen behouden.
- Een conceptartikel of conceptafbeelding verschijnt niet in de gepubliceerde feed voordat de lobby wordt gepubliceerd.
- Verwijderen van het enige expliciet gekoppelde artikel schakelt de betrokken nieuws-widget uit; een al bestaande “alle artikelen”-widget blijft geldig.
- Dezelfde preview en echte feed resolver geven voor dezelfde publicatie en kamer dezelfde inhoud; previewstemmen tellen nergens mee.
- Toernooidata en geërfde hero veranderen mee met het toernooi. Custom hero en none blijven onaangetast.
- Een hero wijzigen bij een live toernooi bewaart uitslagen, deelnemers, winnaar en bordplanning byte-voor-byte of semantisch aantoonbaar gelijk, afgezien van de bedoelde hero/audit/tijdvelden.
- Kapotte links, ongeldige media, te grote bestanden, storagefouten en publicatievalidatiefouten tonen een herstelbare fout en geen valse succesmelding.
- Twee beheerders kunnen elkaar niet ongemerkt overschrijven; een stale versie geeft een conflict.
- Een normale speler en een kamermoderator zonder contentrecht kunnen concept, media of publicatie niet wijzigen via directe API-aanvragen.
- Publicatie verversen verandert de lobby-inhoud zonder chat, ingame state of mobiele overlayhoogte te resetten.

De bestaande scripts zijn nuttige broncontroles, maar bewijzen geen echte serverautorisatie, objectopslag, netwerkconcurrency of browserweergave. Voeg daarvoor gerichte integratie- en UI-controles toe in de bestaande testinfrastructuur van de productierepo.
