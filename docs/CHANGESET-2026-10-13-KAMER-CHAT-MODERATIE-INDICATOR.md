# Kamer, chat, moderatie en getekende timing — 13 oktober 2026

Dit is de samenhangende aanvulling op de eerdere landing/mobile-release. De
geautoriseerde bronopdrachten zijn `DartsPoint-Codex-Aanvulling-Kamer-Chat-Moderatie.txt`
en `DartsPoint-Indicator-Analyse-en-Codex-opdracht.txt`. Startpunt is main
`72b25c91664dbe01475ea4d6f85f822237c116c7`; de voorafgaande actieve stagingrelease
is `4a23cf6f4f3b1ea4861556702d9b276ee8b00031`.

## Gedrag en implementatie

Vanaf 1024 CSS-pixels delen overzicht, partij en oefenen dezelfde werkruimte.
Links staat de inhoud op 50% breedte; rechts blijven kamerleden/vrienden boven
en één chat onder, met gelijke helften en interne scroll. Zonder lidmaatschap
blijft kamerinformatie leeg; vrienden en eigen DM blijven bereikbaar. Mobiel
behoudt de volledige kamerflow en tijdens een partij de 60%-panelen. Een
chatupdate remount geen spel. `darts-workspace.tsx`, `darts-community.tsx` en
`darts-desktop.css` delen deze indeling.

De dichte werkruimtecontrole reproduceerde een werkelijk buiten beeld geraakt
invoerveld bij 200% CSS-zoom. De viewportvariabelen normaliseren hoogte en offset
nu met uitsluitend de CSS-zoomfactor. De korte-viewportindeling gebruikt dezelfde
hoogte. Er komt geen device-pixelratio-correctie bovenop de CSS-viewport die
native browserzoom al rapporteert.

Dezelfde zoomcontrole vond een te ver naar rechts geplaatst dropdownmenu.
Floating UI levert clientcoördinaten; de overgeërfde rootzoom vergrootte de
portaltranslatie nogmaals. De portallaag compenseert die schaal, waarna de
menu-inhoud de oorspronkelijke vergroting voor tekst en klikdoelen terugkrijgt.
Beschikbare hoogte en breedte gebruiken dezelfde schaal; langere actielijsten
scrollen binnen het menu.

De mobiele controle reproduceerde ook een verloren menutrigger bij Escape:
de afzonderlijk gebundelde Radix-laagcontexten sloten zowel dropdown als Sheet.
Het spelersmenu sluit nu expliciet bij die toets; het Sheet bewaart zichzelf
voor dat geneste event. De bestaande autofocus herstelt de naamknop. Een
volgende Escape buiten het menu sluit het Sheet normaal.

Het algemene spelersoverzicht blijft begrensd op 2.000 actieve, ingeschreven
accounts. De persoonlijke projectie voegt de actor, actuele kamerleden,
vrienden en relevante persoonlijke contacten afzonderlijk toe. Een lage
rating of positie buiten de algemene directory laat daarmee geen echt
kamerlid of eigen contact uit het paneel verdwijnen. De publieke projectie
blijft haar bestaande algemene subset gebruiken.

Een echte kamerbezoeksovergang schrijft samen met het lidmaatschap één duurzaam
`room.member_joined`-event met unieke bezoek-ID. Heartbeat, refresh, retry en
tweede tab schrijven niets extra. Access/capacity worden vóór opslag en push
gecontroleerd. Systeemberichten geven geen unread of geluid. `community.ts` en
de projecties behandelen menselijke en systeemregels expliciet.
De serverlimiet is **10 echte kamerbezoeken per account per 60 seconden**.
Het elfde bezoek geeft 429 `room_join_rate` met `retryAfter`; dezelfde geldige
join, heartbeat en korte reconnect verbruiken geen nieuw bezoekbudget.

De browser maakt vóór een await één optimistic intent met UUID. Dubbel Enter,
Enter plus click, keyrepeat en IME maken geen extra verzoek. Retry behoudt de
UUID; opgeslagen echo en HTTP-antwoord voegen samen op bericht-ID. Een laat
antwoord overschrijft geen nieuw concept. Accountbrede nieuwe-berichtlimieten
zijn transactioneel: standaard 30/minuut, 3/2 seconden en gelijk genormaliseerde
tekst in hetzelfde kanaal niet opnieuw binnen 2 seconden. Endpointmisbruik
heeft een afzonderlijk budget. De owner kan burst/duplicate/slowmode wijzigen.
Een actieve slowmode toont bij de composer de ingestelde accountbrede limiet,
ook wanneer compacte schermen de gewone voetnoot verbergen. Een afwijzing
laat het concept bewerkbaar; de melding voegt geen vertraging aan sends toe.

De browsercontrole vond daarnaast een dubbele providerverificatie per
cookie-aanvraag en een tweede HTTP-aanvraag vóór weergave bij de ontvanger.
De login blijft per aanvraag eenmaal door Auth geverifieerd, met actuele
databasechecks. Redis draagt uitsluitend bericht-ID's; de persoonlijke
realtime-inbox projecteert het opgeslagen bericht na een verse, gezamenlijke
controle van sessie, account, toegang, mute en block. De browser voegt deze
projectie direct samen. Alleen echte history-responses schuiven de ophaalcursor
door; polling/reconnect herstellen daardoor eerdere gemiste berichten en
redactions. Chatregels worden afzonderlijk gememoiseerd en een conceptwijziging
bouwt geen volledige inbox-/beheerprojectie opnieuw op.

De hosted controles van release `467c5d7` maten vervolgens een echte
chatvertraging: p95 410,9 en 422,6 ms bij de ontvanger. De verzendroute groepeert
daarom actuele PostgreSQL-reads: een nieuw bericht, UUID-retry en retry van een
verwijderd bericht gebruiken elk negen databasecalls inclusief persoonlijke
projectie, met nog steeds één ongecachete Auth-providerverificatie. De
gebruikerslock staat vóór de snapshot voor toegang, filter en quota. Na een
eventuele wachttijd op membership- of cursorlocks volgt een afzonderlijke verse
canonieke projectie; gelijktijdige naamsanering of redaction kan daardoor geen
oude naam of verwijderde body in een ontvangstbevestiging laten verschijnen.
`chat-send-batching.ts` controleert deze twee echte row-lockraces, ingetrokken
sessies en rollen, actuele accountsancties, idempotentie en foutvolgorde. Redis
blijft uitsluitend identifiers dragen; er is geen rechten- of bodycache.

Bootstrap voor inbox- en gelezenmetadata wordt samengevoegd: na 500 ms zonder
nieuwe refreshaanleiding volgt één aanvraag; bij voortdurende activiteit is de
wachttijd maximaal 1 seconde vanaf de eerste aanleiding. De 3-secondenpoll wijkt
bij recente chatactiviteit voor deze gezamenlijke refresh. Berichtinhoud wordt
direct uit de persoonlijke realtimeprojectie weergegeven. Expliciete mutaties
en actuele capabilitychecks behouden hun eigen servercontrole.

Alle chattypen, snelle zinnen, onboarding en naamwijzigingen gebruiken het
actuele serverfilter in `content-filter.ts`. NFKC, zero-width, eenvoudige
leetvormen en gestippelde woorden krijgen gecontroleerde normalisatie.
Woord-/phrase-/prefix-/exactregels zijn begrensd; uitzonderingen zoals Essex
blijven mogelijk. Owner beheert categorie, scope, aliassen, uitzondering,
activiteit en reden/version in **Chat & moderatie**, test regels en beoordeelt
bestaande namen. Een verplichte rename bewaart account-ID, vrienden, historie
en DP; publieke projecties gebruiken consequent een tijdelijk label. Er worden
geen accounts of historische worpen verwijderd. Rejected tekst komt niet in
events of operationele logs. Seeds overschrijven latere ownerwijzigingen niet.

Naam en avatar gebruiken hetzelfde menu met echte resource-ID's en verse
servercapabilities. Kamerbevoegdheid wordt geen platform- of DM-bevoegdheid;
ingetrokken bevoegdheid faalt ook bij een al open menu. Maatregelen, intrekken,
filter-/limietwijzigingen en rename hebben leesbare audits met reden/version.
Uitnodigingen controleren afzender én ontvanger bij verzenden, workerbezorging
en acceptatie, ook bij gepauzeerde partijen en gelijktijdige acceptatie.

Nieuwe partijen en oefensessies gebruiken `render-sample-v3`. De inputhandler
bewaart de laatste werkelijk geschreven DOM-sample en bevriest die synchroon,
zonder hersampling. De faseklok blijft vast; drie clientmetingen en drie echte
serverchallenges zijn vereist. Serveringress, UUID, payloadhash, versie,
verbinding en venster worden duurzaam vastgelegd vóór de commandowachtrij.
Een geldige claim gaat exact door de gedeelde golf; buiten het venster volgt
een expliciete afwijzing. De 90 ms netwerkgrens plus afzonderlijk 34 ms
renderleeftijd zijn toegelicht in [het timingcontract](TIMING-RENDER-SAMPLE-V3.md).
V3 tekent en verstuurt hele milliseconden, gelijk aan de resolutie van de
serveringress. De regressie voor een snelle verbinding reproduceert de
vroegere afwijzing van een sample die slechts 0,75 ms na de afgeronde
ontvangsttijd leek te liggen; het toelatingsvenster blijft strikt behouden.
Score, beurt, raakpunt en impact blijven serverbesluiten. Bestaande partijen
behouden hun eerdere timingversie.

De nieuwe wedstrijdcontrole vond ook een vluchtfout: een nieuwe hit-objectkopie
kon de animatie herstarten, en een impactsnapshot kon dezelfde animatie opnieuw
starten nadat de scorechip al een gelande pijl toonde. De vlucht gebruikt nu
stabiele coördinaten en een actuele callback zonder herstart door objectidentiteit.
Bij gezaghebbend landen wordt de animatie synchroon gestopt en de native
SVG-tip vóór de eerste paint op hetzelfde serverraakpunt gezet. De
560-ms-servervlucht, scoremomenten en spelregels blijven behouden.

## Schema en release

De uitbreidende CLI-migraties bewaren toegepaste checksums en bestaande data:

- `20261013101355_render_sample_timing.sql`: v3-ingressmetadata.
- `20261013101533_chat_visits_filter.sql`: getypeerde bezoeken, filters, limieten en renameflag.
- `20261013102910_filter_name_boundaries.sql`: begrensde samengestelde naamregels zonder owneredits te resetten.
- `20261013104758_chat_redaction_cursor.sql`: afzonderlijke editcursor voor duurzame redaction-catchup.

Nieuwe interne tabellen krijgen expliciete backendgrants/RLS. De bestaande
hosted CI, immutable images en stagingrunner behouden backup/restore, veilige
drain, expand-only migratie, readiness en publieke signup-persistencegate.
Er zijn voor deze sprint geen nieuwe GitHub Environment secrets of variabelen.

## Redirects en beheeractie

De afzonderlijk gevraagde tijdelijke Caddy-redirect is al op de VPS geïnstalleerd:
`dartspoint.nl` en `www.dartspoint.nl` geven 302 naar
`https://binnenkort.dartspoint.nl/`. De landing geeft 200 met geldig TLS.
`ops/redirect-landing.py` bewaart het bestand, wijzigt alleen de twee exacte
hosts, valideert vóór vervanging en reloadt met rollback bij fouten. De
bevestigde private backup is
`/var/backups/dartspoint-caddy-20261013T101723026293Z/Caddyfile`.
De production-app en productiedatabase worden niet gedeployd of gemigreerd.

## Acceptatie en bewijs

| Gebied | Gerichte verificatie | Uitvoering |
|---|---|---|
| Desktop/mobile/één chat | `workspace-chat.ts`, bestaande visual/interface/update-tests | Nieuwe native browseracceptatie geslaagd: 19 checks en 15 chatsamples; bestaande visual/interface/update-regressies ook geslaagd |
| Volle panelen/zoom/menu/toetsenbord | `workspace-density.ts` | Tien controles geslaagd op de definitieve portalbuild; drie desktopmaten, drie mobiele maten en 200% CSS-zoom |
| Bezoeken/quota/filter/rechten/invites | `chat-moderation.ts`, bestaande services/update-tests | Echte lokale Auth/PostgreSQL/Redis; doeltests en bestaande services/update-tests geslaagd |
| Ownerbeheer/rename/slowmode | `chat-moderation-ui.ts` | Geslaagd: 12 checks met echte development-owner en afzonderlijk playerfixture; oorspronkelijke instellingen hersteld |
| Spelers buiten directorylimiet | `player-visibility.ts` | Acht echte databasecontroles geslaagd met 2.020 eigen Auth-profielen; alle fixtures verwijderd |
| Leesbevestigingen/unread | `chat-read.ts` | Native browser geslaagd: maximaal één lopende kamerwrite, hoogste zichtbare cursor, onafhankelijk privégesprek, fout/retry en verborgen chat |
| Timingcontract/retry/legacy | unit `render-sample-timing.test.ts`, integration `render-sample-timing.ts` | Unit en echte databasechecks geslaagd |
| Werkelijke DOM/flight/reconnect | `render-sample-timing.ts`, `game-timing.ts` | Lokale native build geslaagd: 16 oefenstops en zes wedstrijdstops, beide assen; staging volgt afzonderlijk |
| Bron/operations | source parity, 39 operationele checks | Geslaagd; oorspronkelijke publieke assets/fonts behouden |
| Stagingidentiteit | `tests/staging/browser-fixture.ts`, `acceptance.ts` | Twee afzonderlijke niet-staff QA-accounts met echte providerverificatie; TLS smoke tegen voorafgaande release geslaagd |

De stagingfixture wordt eenmalig als beheerder op de VPS uitgevoerd: echte
Auth-identiteiten en sessies blijven servergegenereerd; alleen een RSA/AES-GCM
versleutelde overdracht verlaat de VPS. Applicatiecredentials blijven daar.
Sessies, sleutel, private logs en screenshots blijven in genegeerde artifacts
met private rechten. De acceptatierunner verbindt via een tijdelijke lokale
CONNECT-proxy over Tailscale en controleert de exacte actieve release-SHA.
Hij heeft geen publieke loginbypass, productierol of runtimebeheerendpoint.

### Definitieve lokale workspace- en moderatiebrowseracceptatie

`workspace-chat.ts` is geslaagd tegen de gebouwde native web/realtime/worker
met echte lokale Auth, PostgreSQL en Redis. De 19 checks omvatten de vaste
desktopindeling op 1280×720, 1366×768 en 1920×1080 in lobby, kamer, oefenen en
wedstrijd, het breakpoint aan beide zijden van 1024 pixels en één bereikbare
mobiele chat/composer op 320×568 en 390×844. Ook geslaagd: één join per bezoek,
dubbel Enter/klik en IME/repeat, late en verloren ontvangstbevestiging, behouden
concepten, geweigerde tekst, behouden berichtvolgorde bij een oudere historyresponse, beide menutriggers
en focusherstel, gesloten profiel zonder pointerlock, stabiele DM-identiteit bij
hernoemen en hergebruik van de oude naam, herstel na persoonlijke mute,
geautoriseerde realtimeprojecties, tabvolgorde en blijvende selectie,
gezaghebbende bezetstatus, een geweigerde flood zonder bordremount en de echte
spectator-handoff vanuit oefenen. De QA-partij is via een geautoriseerde opgave
beëindigd; er bleef geen actieve spelerreservering achter.

De definitieve geslaagde meetreeks op de gegroepeerde verzendroute met
samengevoegde leesbevestigingen bevat 15
berichten tussen twee geauthenticeerde Chromiumgebruikers, zonder geïnjecteerde
netwerkvertraging. De afzender heeft aantoonbaar focus; beide afzonderlijke
headless browsercontexts melden in deze run feitelijk focus en zichtbaarheid.
Deze reeks bewijst daardoor geen achtergrondontvanger. DOM-tijden komen uit
daadwerkelijke berichtmutaties; push is onafhankelijk waargenomen via de
persoonlijke Colyseus-inbox.

| Meetpunt vanaf verzenden | p95 | Projectdoel |
|---|---:|---:|
| Eigen optimistic bericht zichtbaar | 9,2 ms | ≤50 ms |
| HTTP-responseheaders ontvangen | 190,5 ms | Afzonderlijk gemeten |
| HTTP-ontvangstbevestiging van het opgeslagen bericht | 204,4 ms | Afzonderlijk gemeten |
| Persoonlijke realtimepush ontvangen | 200,4 ms | Afzonderlijk gemeten |
| Bericht zichtbaar bij geautoriseerde ontvanger | 209,0 ms | ≤250 ms |

De HTTP-waarde meet het ontvangen antwoord na het uitlezen van JSON; dit is
geen afzonderlijk geïnstrumenteerde databasecommittijd. Beide zichtbaarheiddoelen
zijn in deze beschreven lokale omgeving gehaald. Bewijs en ruwe samples staan
in `artifacts/local-final-proof/workspace-chat-read-singleflight-result.json` en
`workspace-chat-read-singleflight-latency.json`; de log is
`artifacts/local-final-proof/workspace-chat-read-singleflight-run.log` (exit 0).
Alle 15 sends hebben HTTP 200 en een onafhankelijk waargenomen canonieke
SDK-push. Geen sample is opnieuw geprobeerd, verwijderd of als warmup uitgesloten.
HTTP-, push-, DOM-, focus- en zichtbaarheidmetingen worden ook bij een
overschrijding vóór de performanceassertions bewaard. De oudere lokale
248,1- en 248,5-ms-reeksen blijven historisch bewijs; de mislukte hosted metingen worden
daarmee niet vervangen. Nieuwe hosted CI en acceptatie op de werkelijk actieve
stagingrelease moeten nog afzonderlijk slagen.

De voorafgaande volledige run op de gezamenlijke portalbuild faalde echt op
het ontvangerdoel: lokale p95 12,0 ms, ontvanger-p95 256,3 ms. Alle vijftien sends
kregen HTTP 200 en een onafhankelijke canonieke SDK-push; de veertien functionele
checks vóór de performanceassertion slaagden. De vijf daaropvolgende spelchecks
zijn in deze mislukte run niet uitgevoerd. Bij sample 1 waren de responseheaders
na 240,455 ms beschikbaar, de SDK-push na 248,692 ms en de ontvanger-DOM na
256,300 ms. Beide contexts behielden aantoonbaar focus en zichtbaarheid.
De beperkte marge van de eerdere 248,5-ms-run is daarmee geen definitief bewijs
voor deze build. Alle pogingen blijven bewaard in
`artifacts/local-final-proof/workspace-chat-final-latency.json`,
`workspace-chat-final-result.json`, `workspace-chat-final-failure.png` en
`workspace-chat-final-run.log` (exit 1); geen sample is opnieuw geprobeerd of
als warmup verwijderd.

Een afzonderlijke diagnose op dezelfde applicatiebron mat 56 leesbevestigings-
POSTs naast de 15 sends, vier conceptwrites en acht bootstraps. De verse
Auth-providercontrole duurde mediaan 138,2 ms en p95 157,1 ms; het verkrijgen
van databaseverbindingen op de verzendroute duurde opgeteld maximaal 0,223 ms,
zonder poolwachtrij. De huidige client dedupliceerde leesbevestigingen pas na
het antwoord, zodat nieuwe renders dezelfde zichtbare cursor opnieuw konden
versturen terwijl de eerste aanvraag nog liep. De diagnose wijst daarmee op
onnodige gelijktijdige aanvragen als gerichte verbetering. De afzonderlijke
diagnoserun met ontvanger-p95 214,2 ms vervangt de eerdere mislukking niet.
De private meetprobe wijzigde geen applicatiebron; query-uitvoering in de
gebundelde PostgreSQL-client kon niet afzonderlijk worden geïnstrumenteerd.
De vijftien serveraanvragen zijn op volgorde aan de clientreeks gekoppeld;
de browserharness bewaart geen client-UUID voor een afzonderlijke UUID-join.
Het metadataoverzicht staat in
`artifacts/local-final-proof/workspace-chat-diagnostic-metadata-summary.json`.

Leesbevestigingen worden nu vóór de eerste await geregistreerd en per account
en canoniek kanaal samengevoegd. Tijdens één lopende aanvraag blijft alleen de
hoogste expliciet aangeleverde, werkelijk zichtbare cursor over; die volgt na
een succesvolle bevestiging. Alleen succesvolle antwoorden schuiven de
bevestigde cursor op. Fouten starten geen eigen retryloop en wissen geen
ongelezen berichten. Een accountgeneratie en entry-identiteit voorkomen dat
een laat antwoord na een accountwissel, ook A→B→A, de nieuwe staat beïnvloedt.
Iedere daadwerkelijk verstuurde POST behoudt de verse servercontrole; rustige
beurten, achtergrond/verborgen chat, oude scrollposities en gesloten DM's
blijven door de bestaande zichtbaarheidvoorwaarden beschermd.

De gerichte echte browserregressie slaagt op dezelfde native build. Een
succesvolle, reeds door de server verwerkte leesbevestiging wordt vastgehouden;
herhaalde focus/scroll/render-events en twee nieuw bekeken berichten starten
geen dubbele aanvraag. Na vrijgave volgt precies één bevestiging van de
hoogste bekeken cursor. Een onafhankelijk privégesprek blijft ondertussen
leesbaar. Een vóór serveruitvoering geweigerd antwoord behoudt unread en
start geen eigen retry; een latere geldige zichtbaarheidgebeurtenis bevestigt
dezelfde cursor alsnog. Verborgen chat blijft ongelezen totdat hij echt wordt
getoond. De oorspronkelijke 6→4-controle, rustige beurt met een eigen later
bericht, gesloten DM/concept, andere kanalen en oudere scrollpositie slagen
eveneens. Bewijs: `artifacts/local-final-proof/chat-read-single-flight-result.json`
en `chat-read-single-flight-run.log` (exit 0). De fixturepartij is beëindigd.

`chat-moderation-ui.ts` is eveneens geslaagd (12 checks): regel toevoegen en
testen, uitschakelen zonder herdeploy, echte namenscan en verplichte hernoeming
met behoud van account-ID en DP, consequente publieke alias in reeds gecachte
menselijke en systeemregels, en de veilige huidige naam na de succesvolle
hernoeming. Het echte kamermenu verzendt de juiste target/room/channel/message-ID's
voor een waarschuwing. Live verwijdering overleeft een ouder vastgehouden antwoord;
een daadwerkelijk onderdrukte realtimeverwijdering wordt na reconnect via de
duurzame editcursor hersteld. Een gemodereerde optimistic UUID verdwijnt ook
wanneer alleen sequence 0 bekend is en het HTTP-antwoord nog wordt vastgehouden.
Een gewone speler krijgt 403 op ownerinstellingen. Een door de owner ingestelde
slowmode van vijf seconden is zichtbaar op 1280×640 en 390×844. De eerste send
slaagt; de volgende unieke send krijgt `chat_slow_mode` met een geldige retrytijd,
blijft als bewerkbaar concept beschikbaar en verschijnt niet bij de ontvanger.
De oorspronkelijke limieten zijn in de cleanup daadwerkelijk teruggelezen en
vergeleken. Bewijs staat in
`artifacts/local-final-proof/final-combined-chat-moderation-ui-result.json`,
`final-combined-chat-moderation-ui-owner-desktop.png` en
`final-combined-chat-moderation-ui.log` (exit 0).

`player-visibility.ts` plaatst 2.001 echte accounts boven negentien persoonlijke
contextfixtures. De oorspronkelijke algemene top-2.000 blijft exact gelijk;
negen geldige contacten buiten die grens verschijnen aanvullend. Inactieve,
niet-ingeschreven en ratingloze accounts, verlopen of vreemde kamerlidmaatschappen,
gesloten of geblokkeerde DM's en geannuleerde verzoeken voegen geen context toe.
Een verse rename of beëindigd contact wordt bij de volgende read verwerkt.
Bootstrap houdt canonieke namen voor vrienden, verzoeken, mutes en blocks;
de publieke subset blijft begrensd. Alle 2.020 Auth-profielen en hun eigen
resources zijn verwijderd en de databasecontrole bevestigt nul achterblijvers.
Bewijs: `artifacts/player-visibility-result.json` (acht controles, exit 0).

`workspace-density.ts` is geslaagd met 21 echte kamerleden, twintig vrienden met
de maximaal toegestane twintig tekens in hun naam en acht canonieke privétabs.
Op 1280×720, 1366×768 en 1920×1080 blijven beide kolommen en beide rechterrijen
50/50. Kamerleden, vrienden en geschiedenis scrollen intern; alle echte namen
en kanaal-ID's blijven aanwezig. Op 320×568, 390×844 en een verkleinde viewport
van 390×400 blijft één bereikbare composer zichtbaar. Die laatste maat bootst
minder beschikbare hoogte na en bewijst geen geopend fysiek telefoontoetsenbord.
De eerste Escape sluit alleen het menu en herstelt de vriendentrigger; de tweede
sluit het Sheet en herstelt een levende navigatieknop.

Bij 200% CSS-zoom ligt de composeronderkant op 716 px in een viewport van
1366×768. Het menu past binnen die viewport. End focust de echte laatste actie,
`Speler melden`; de menuscroll gaat van 0 naar 159,5 terwijl de documentscroll
0/0 blijft. Tekst en klikdoelen blijven vergroot. De oorspronkelijke fouten in
composerhoogte, mobiele Escape en menuplaatsing zijn afzonderlijk bewaard.
Alle 21 fixture-identiteiten en eigen resources zijn verwijderd; de SQLcontrole
bevestigt nul achterblijvers. Bewijs:
`artifacts/local-final-proof/density-zoom3-final/results.json`, screenshots en
`run.log` (tien controles, exit 0). Dit is een CSS-zoomcontrole, geen bewijs van
een fysieke browserzoomtoets of OS-instelling.

Deze native browsermetingen en mobiele viewportemulatie zijn geen tests op
fysieke telefoons, een geopend iOS/Android-toetsenbord, OS-/browserzoom of echte
60/120/144 Hz-schermen. De lokale regressies zijn geslaagd; acceptatie
van de daadwerkelijk gedeployde stagingrelease is nog open;
hun resultaten en release-SHA worden afzonderlijk toegevoegd.

De lokale timingbrowser meet bij oefenen en wedstrijden maximaal **0 CSS px**
verschuiving bij stoppen en bevestigen, dus **0 van de balkbreedte/-hoogte**.
Oefeninvoer heeft op de definitieve gezamenlijke native build p95 **0,6 ms**;
wedstrijdhandlers duren maximaal **0,5 ms** en de eerste frozen frame verschijnt
binnen **30,9 ms** op beide assen. De maximale afwijking van de gelande SVG-pijlpunt
van het serverraakpunt is **0,000014 CSS px**. Vertraagde bevestigingen,
gelijktijdige chat, oude receipts en reconnect zonder extra pijl zijn geslaagd.
Drie daadwerkelijk ontvangen flight-snapshots zijn tijdens de vlucht gedupliceerd.
De eerste grounded frame heeft maximaal 0,000013252 px afwijking; alle drie
daaropvolgende frames behouden exact dezelfde native SVG-transform. De
vóór-fixrun op de oude bundle faalde juist op die harde stabiliteitscontrole:
de al gelande transform wijzigde opnieuw. Deze eerste-paintcontrole wacht
niet totdat een opnieuw afgespeelde animatie alsnog op het goede punt eindigt.
De 16 oefenstops en zes wedstrijdstops staan afzonderlijk in
`artifacts/local-final-proof/final-combined-render-sample-timing-result.json`
en `final-combined-game-timing-result.json`, met private logs in dezelfde map.
De oude volledige wedstrijdfixture is naar echte v3-klokkalibratie bijgewerkt:
27 echte pijlen, dubbel in/uit, spectator, typing guard, impact-only score,
reloadherstel en eenmalige nul-som-Elo slagen. Dit botbewijs staat los van
de echte DOM-metingen; er zijn geen servergrenzen voor de fixture verruimd.

De oorspronkelijke pure timingtest reproduceerde -18,182 CSS-px bij warmup en
60 ms heenweg; een offsetverbetering gaf -95 ms/-19 px. De oude echte native
browser gaf bij twee horizontale stops eerst -1,663/+7,470 px hersampling en
uiteindelijk +36,609/-14,078 px bevestigingsverschuiving. Nieuwe geldige stops
moeten op beide assen en bij impact binnen **1 CSS-pixel** blijven; lokaal
chat/input p95 blijft maximaal 50 ms; normale chatontvangst behoudt het
rapportagedoel van maximaal 250 ms.
Alle samples en eventuele weigeringen blijven zichtbaar in het meetrapport.

De 12 aanvullende lokale regressies slagen: domain, multiplayer, practice,
visual, auth, interface, update, chat-read, HTTPS-proxy, landing-proxy, drain
en load. De gerichte en brede backendintegraties slagen eveneens, inclusief
filter/rechten/naamprojecties, realtimeprivacy, timing, services, competities,
herstel, owner en mail. De productiebuild, typechecks, 32 units, oorspronkelijke
spelregels, 39 operationele checks en source parity zijn geslaagd. De
updatebrowser behield alle 30 foreground-stops: eerste-frame p95 12,8 ms,
maximum 15,0 ms en freeze/bevestiging 0 px; alle vier Chromiumvertragingen
20/80/180/350 ms accepteerden de exacte sample. CSS-zoom 200% en echte offline
oefening slagen. Grote beheerpagina's worden als echte boven-/midden-/onder-
viewports vastgelegd; de lokale QA-spelerslijst van circa 66.000 px overschrijdt
het praktische volledige screenshotformaat. Alle oorspronkelijke
beheerpagina's behouden navigation/title/overflow- en runtimefoutcontroles.

De vertraagde bevestigingstest houdt via Chromium uitsluitend een reeds
ontvangen response vast. Alle 30 echte responses zijn 100/300/1000 ms
vastgehouden; invoer en klokkalibratie blijven op de native browserverbinding.
Een eerdere testforwarder voegde een ongemeten heenweg toe: de server wees
een 59 ms oude sample terecht af bij een gemeten venster van 54 ms. De
test beoordeelt iedere poging onafhankelijk tegen de oorspronkelijke,
onveranderlijke serveringress: een geldige sample moet exact worden bevestigd;
een te oude, toekomstige of eerdere-fasesample moet expliciet worden geweigerd,
zonder wijziging van de volledige spelstate, en gecontroleerd herstellen.
Alle 30 pogingen blijven in de p95-verdeling; iedere combinatie van invoer en
vertraging moet bovendien minstens één geldige bevestiging bevatten. De
uiteindelijke lokale run accepteerde 30/30 stops. Een afzonderlijk geïnjecteerde
hoofdthreadpauze van 160 ms gaf een sampleleeftijd van 185 ms bij een venster
van 54 ms: HTTP 409 `invalid_render_sample`, zichtbare fout, ongewijzigde
state/version en hervatte meter. Deze negatieve controle staat apart van de
normale verdeling. Screenshots en snapshots worden tijdens de timingmeting
uitgeschakeld; de overige UI-controles houden hun trace. De touchfixture wacht
op drie echte ping/echo-paren en reset daarna via de gewone bediening.

De functionele toetsenbordfixture controleert ieder echt stopantwoord tegen de
oorspronkelijke ingress en bewaart alle nieuwe invoerpogingen. Een afzonderlijk
verlopen verticale stop moet de hele spelstate intact laten en zichtbaar
herstellen; daarna zijn geldige horizontale/verticale stops en precies één
gescoorde pijl vereist. Dit is geen p95-meetreeks. De chat-leesfixture wacht
vanaf een succesvol ontvangen antwoord, zodat haar gewone leescontroles binnen
de ongewijzigde serverlimiet van drie berichten per twee seconden blijven.
De geïsoleerde landingproxy wacht op een echte HTTPS 200-respons met body en
volledige certificaat-/hostnaamverificatie. Een aangemaakt CA-bestand alleen
bewijst geen gereed listener-/leafcertificaat. Daarna worden alle 22 bestaande
routecontroles éénmaal uitgevoerd; alleen de begrensde startupcontrole wacht.

Implementatie-SHA, CI-runs en actieve staging-SHA worden na deployment
en acceptatie hieronder vastgelegd. Chromiumemulatie,
geïnjecteerde vertraging en viewport/toetsenbordformaat zijn geen fysieke
60/120/144 Hz-, iOS-toetsenbord-, touch- of camerametingen; dergelijke hardware
is niet beschikbaar op deze VPS.

De hosted controles van `ee5db493c21a3013e51f18ee254a24e1fb62edb6` zijn nog
niet geslaagd. [Main-run 38433432900](https://github.com/dartspoint/platform/actions/runs/38433432900)
haalde chat-p95 15,8 ms lokaal en 227,8 ms bij de ontvanger, maar faalde daarna
op een wedstrijdmeter die tijdens de wachttest 5,656 CSS px bewoog. Die run
bevatte geen originele ingress of stopfoutcode; een te oude sample is daardoor
nog geen bewezen oorzaak. Een afzonderlijke native diagnoserun accepteerde
alle zes echte stops met sampleleeftijden 26–33 ms binnen het venster van
54 ms en reproduceerde de beweging niet. De oorspronkelijke mislukte run
blijft bewaard.

[Staging-run 38433433720](https://github.com/dartspoint/platform/actions/runs/38433433720)
faalde op chat-p95 537,5 ms bij de ontvanger; lokale p95 was 14,2 ms. Alle
vijftien berichten hadden HTTP 200, canonieke SDK-ontvangst en aantoonbare
focus/zichtbaarheid. Image-publicatie en deployment zijn overgeslagen: de
actieve stagingrelease is nog `4a23cf6f4f3b1ea4861556702d9b276ee8b00031`.
Deze twee hosted fouten worden afzonderlijk onderzocht. De lokale geslaagde
metingen vervangen geen hosted of gedeployde acceptatie, en geheugen- of
CPU-tekort is zonder gecorreleerde meting niet als oorzaak vastgesteld.

De aanvullende native workspace-run van 17:22 UTC slaagt met **21/21
functionele controles en alle 15 chatmetingen**: lokale p95 13,9001 ms,
ontvanger-p95 195,5 ms, met ongewijzigde grenzen van 50/250 ms. Een werkelijk
geopend uitnodigingsdialoog begint met een vrije ontvanger, wordt automatisch
uitgeschakeld wanneer die een andere uitnodiging accepteert, weigert ook een
direct stale verzoek met 409 zonder extra match/uitnodiging/notificatie, en
wordt na normale opgave weer actief.

Tijdens twee werkelijk overlappende `429 chat_burst_limited`-verzoeken wordt
de wedstrijdindicator gestopt: horizontaal via pointer en verticaal via Enter.
De oorspronkelijke database-ingress bevestigt sampleleeftijden van 8/11 ms
binnen het venster van 54 ms. Beide eerste pogingen worden exact geaccepteerd;
er is geen herstelpoging gebruikt. Eerste freeze en authoritative bevestiging
verschuiven beide **0 CSS px**. Handlerduur is maximaal 0,8 ms en de eerste
frozen frame maximaal 17,9 ms. Indicator- en bordnodes behouden hun identiteit.
Alle chatmetingen en beide floodpogingen staan in
`artifacts/local-final-proof/workspace-chat-final-coverage-20261013T172224Z/`.
De gewone opgave van beide fixturewedstrijden en SDK-cleanup zijn geslaagd.

De opdrachtgever geeft daarna expliciet voorrang aan het gooien. Daarom is
de ontvangstlatentie van chat vanaf deze aanvulling een gerapporteerd doel
van 250 ms, geen deploymentblokkade. Alle vijftien echte samples blijven in
het rapport; een overschrijding wordt zichtbaar gemeld. Functionele chat,
autorisatie, filters, exacte berichtidentiteit en lokale responsiviteit blijven
gecontroleerd. Alle werpgates blijven hard: echte foreground-invoer, maximaal
50 ms, maximaal 1 CSS px, exacte getekende sample binnen de oorspronkelijke
servergrenzen, onveranderde state bij weigering en geen extra pijl bij reconnect.
De tijdelijke uitgebreide chatprobe wordt privé behouden en niet in de
normale CI- of stagingservices geladen.

Een door de opdrachtgever uitgevoerde momentopname op `dartspoint-vps1` toont
7,6 GiB RAM waarvan 6,2 GiB beschikbaar, nul swap en 86–99% idle CPU in vijf
korte samples. Dit toont geen actueel RAM-tekort op staging; het bewijst geen
maximale belasting en zegt niets over resources van de aparte hosted runners.

De echte lokale joingrens- en concurrentie-integratie slaagt: tien verschillende
visits binnen één minuut, geen verbruik door dezelfde kamer/heartbeat, en de
elfde wissel geeft 429 zonder membership-, visit-, event- of cursorwijziging.
Twee acceptaties wachten aantoonbaar tegelijk op dezelfde admission-lock;
na vrijgave ontstaan exact één match en twee reserveringen. De andere invite
is cancelled, en uitgestelde notificatie-aflevering voegt niets toe. Eigen
fixtures worden volledig verwijderd. Een eerdere cleanup kreeg een deadlock
met de actieve worker; de test vergrendelt nu eerst de vier eigen profielen in
vaste volgorde vóór verwijdering van FK-childrows. Het herstel van alleen de
eigen vier achterblijvers is afzonderlijk met nulmetingen bevestigd. De
gewijzigde volledige integratie is éénmaal geslaagd; businesscode is hiervoor
niet aangepast. Bewijs: `chat-moderation-boundary-fixture-recovery.json`,
`chat-moderation-boundary-concurrent-lockorder-result.json` en bijbehorende log
onder `artifacts/local-final-proof/`; de oorspronkelijke failure blijft behouden.

De uitgebreidere native wedstrijdfixture slaagt daarna met **acht echte
stoppogingen**, alle acht geaccepteerd en nul uitgesloten. Beide assen bevatten
een exacte acceptatie bij ieder vertraagd inkomend cohort van 100/300/1000 ms;
de verticale bevestiging wordt nu ook werkelijk vertraagd. Handlermaximum is
0,5 ms; eerste frozen frame p95 en maximum zijn 26,2 ms. Eerste freeze en ACK
geven 0 CSS px verschuiving. Iedere acceptatie behoudt de oorspronkelijke
sample/connection en het admission-venster, verhoogt de stateversion precies
éénmaal, en wijzigt geen score of dart vóór impact. Alle vier werkelijke pijlen,
inclusief die na reconnect, behouden de exacte eerste grounded tip en drie
volgende native SVG-transforms bij een werkelijk gedupliceerd flight-snapshot.
Maximale tipafwijking is 0,00001199 CSS px. De verloren originele command-UUID
wordt hersteld zonder extra pijl en de fixture eindigt via normale opgave.
Bewijs: `artifacts/local-final-proof/outcome-aware-game-timing-{result,progress,private.log}`.
De test laat een onafhankelijke classificatie van de oorspronkelijke ingress
alleen een aantoonbaar ongeldige sample afwijzen: exacte foutcode, zichtbare
fout, volledige state/version/lifecycle intact en hervatte meter zijn vereist.
Iedere poging blijft in de meetreeks, iedere vertraging/axis moet minstens één
werkelijk geaccepteerde stop bevatten en alle werpgrenzen blijven hard. Een
stagingweigering zonder betrouwbare oorspronkelijke ingress wordt niet als
geslaagde boundarycontrole aangemerkt.
