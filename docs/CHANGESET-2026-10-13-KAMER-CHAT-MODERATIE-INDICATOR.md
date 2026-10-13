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
| Desktop/mobile/één chat | `workspace-chat.ts`, bestaande visual/interface/update-tests | Laatste native browseracceptatie geslaagd: 21 checks en 15 chatsamples; bestaande visual/interface/update-regressies ook geslaagd |
| Volle panelen/zoom/menu/toetsenbord | `workspace-density.ts` | Tien controles geslaagd op de definitieve portalbuild; drie desktopmaten, drie mobiele maten en 200% CSS-zoom |
| Bezoeken/quota/filter/rechten/invites | `chat-moderation.ts`, bestaande services/update-tests | Echte lokale Auth/PostgreSQL/Redis; doeltests en bestaande services/update-tests geslaagd |
| Ownerbeheer/rename/slowmode | `chat-moderation-ui.ts` | Geslaagd: 12 checks met echte development-owner en afzonderlijk playerfixture; oorspronkelijke instellingen hersteld |
| Spelers buiten directorylimiet | `player-visibility.ts` | Acht echte databasecontroles geslaagd met 2.020 eigen Auth-profielen; alle fixtures verwijderd |
| Leesbevestigingen/unread | `chat-read.ts` | Native browser geslaagd: maximaal één lopende kamerwrite, hoogste zichtbare cursor, onafhankelijk privégesprek, fout/retry en verborgen chat |
| Timingcontract/retry/legacy | unit `render-sample-timing.test.ts`, integration `render-sample-timing.ts` | Unit en echte databasechecks geslaagd |
| Werkelijke DOM/flight/reconnect | `render-sample-timing.ts`, `game-timing.ts` | Native en hosted geslaagd; live pre-finale staging op `a74fbf5`: acht exacte wedstrijdstops en zestien exacte oefenstops |
| Bron/operations | source parity, 39 operationele checks | Geslaagd; oorspronkelijke publieke assets/fonts behouden |
| Stagingidentiteit | `tests/staging/browser-fixture.ts`, `acceptance.ts` | Pre-finale smoke, wedstrijd, oefenen en chat op exacte release `a74fbf5` geslaagd voor twee afzonderlijke niet-staff QA-accounts; finale web/realtime-readiness geeft HTTP 200 en dezelfde SHA |

De stagingfixture wordt eenmalig als beheerder op de VPS uitgevoerd: echte
Auth-identiteiten en sessies blijven servergegenereerd; alleen een RSA/AES-GCM
versleutelde overdracht verlaat de VPS. Applicatiecredentials blijven daar.
Sessies, sleutel, private logs en screenshots blijven in genegeerde artifacts
met private rechten. De acceptatierunner verbindt via een tijdelijke lokale
CONNECT-proxy over Tailscale en controleert de exacte actieve release-SHA.
Hij heeft geen publieke loginbypass, productierol of runtimebeheerendpoint.

### Definitieve lokale workspace- en moderatiebrowseracceptatie

`workspace-chat.ts` is geslaagd tegen de gebouwde native web/realtime/worker
met echte lokale Auth, PostgreSQL en Redis. De 21 checks omvatten de vaste
desktopindeling op 1280×720, 1366×768 en 1920×1080 in lobby, kamer, oefenen en
wedstrijd, het breakpoint aan beide zijden van 1024 pixels en één bereikbare
mobiele chat/composer op 320×568 en 390×844. Ook geslaagd: één join per bezoek,
dubbel Enter/klik en IME/repeat, late en verloren ontvangstbevestiging, behouden
concepten, geweigerde tekst, behouden berichtvolgorde bij een oudere historyresponse, beide menutriggers
en focusherstel, gesloten profiel zonder pointerlock, stabiele DM-identiteit bij
hernoemen en hergebruik van de oude naam, herstel na persoonlijke mute,
geautoriseerde realtimeprojecties, tabvolgorde en blijvende selectie,
gezaghebbende bezetstatus, een geopend uitnodigingsdialoog dat op een werkelijk
bezette ontvanger reageert, echte pointer-/toetsenbordstops tijdens een geweigerde
flood zonder bordremount en de spectator-handoff vanuit oefenen. De QA-partij is via een geautoriseerde opgave
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
| Eigen optimistic bericht zichtbaar | 24,7 ms | ≤50 ms, gerapporteerd streefdoel |
| HTTP-responseheaders ontvangen | 219,2 ms | Afzonderlijk gemeten |
| HTTP-ontvangstbevestiging van het opgeslagen bericht | 226,4 ms | Afzonderlijk gemeten |
| Persoonlijke realtimepush ontvangen | 229,0 ms | Afzonderlijk gemeten |
| Bericht zichtbaar bij geautoriseerde ontvanger | 237,1 ms | ≤250 ms, gerapporteerd streefdoel |

De HTTP-waarde meet het ontvangen antwoord na het uitlezen van JSON; dit is
geen afzonderlijk geïnstrumenteerde databasecommittijd. Beide zichtbaarheiddoelen
zijn in deze beschreven lokale omgeving gehaald. Bewijs en ruwe samples staan
in `artifacts/local-final-proof/workspace-chat-native-input-flood-20261013T175726Z/`
als `results.json`, `latency.json` en `run.log` (exit 0). De eerdere
single-flightreeks met 9,2/209,0 ms blijft afzonderlijk bewaard in
`artifacts/local-final-proof/workspace-chat-read-singleflight-{result,latency}.json`.
Alle 15 sends hebben HTTP 200 en een onafhankelijk waargenomen canonieke
SDK-push. Geen sample is opnieuw geprobeerd, verwijderd of als warmup uitgesloten.
HTTP-, push-, DOM-, focus- en zichtbaarheidmetingen worden ook bij een
overschrijding vóór de performanceassertions bewaard. De oudere lokale
248,1- en 248,5-ms-reeksen blijven historisch bewijs; de mislukte hosted metingen worden
daarmee niet vervangen. De geslaagde hosted stagingpipeline en acceptatie op de
werkelijk actieve stagingrelease worden afzonderlijk hieronder vastgelegd.

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
zonder poolwachtrij. De toenmalige client dedupliceerde leesbevestigingen pas na
het antwoord, zodat nieuwe renders dezelfde zichtbare cursor opnieuw konden
versturen terwijl de eerste aanvraag nog liep. De diagnose wijst daarmee op
onnodige gelijktijdige aanvragen als gerichte verbetering. De afzonderlijke
diagnoserun met ontvanger-p95 214,2 ms vervangt de eerdere mislukking niet.
De private meetprobe wijzigde geen applicatiebron; query-uitvoering in de
gebundelde PostgreSQL-client kon niet afzonderlijk worden geïnstrumenteerd.
De vijftien serveraanvragen zijn op volgorde aan de clientreeks gekoppeld;
de toenmalige browserharness bewaarde geen client-UUID voor een afzonderlijke UUID-join.
De huidige workspaceharness bewaart de echte opgeslagen `client_message_id`
wel bij ieder van haar vijftien raw samples.
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
van de daadwerkelijk gedeployde stagingrelease staat afzonderlijk hieronder;
de live wedstrijdcontrole slaagt, oefenen en chat moeten nog volgen.

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
werphandler en eerste frozen frame blijven maximaal 50 ms. Beide chatlatenties
behouden gerapporteerde doelen: lokaal 50 ms en bij de ontvanger 250 ms.
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

De eerdere hosted controles van `ee5db493c21a3013e51f18ee254a24e1fb62edb6`
mislukten. [Main-run 38433432900](https://github.com/dartspoint/platform/actions/runs/38433432900)
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
actieve stagingrelease bleef toen `4a23cf6f4f3b1ea4861556702d9b276ee8b00031`.
De oorspronkelijke oorzaak van de eerste meterbeweging is niet vastgesteld. De lokale geslaagde
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

De opdrachtgever geeft daarna expliciet voorrang aan het gooien en vraagt
zich geen zorgen te maken over chat. Daarom zijn beide chatlatenties
gerapporteerde doelen: lokaal 50 ms en bij de ontvanger 250 ms, zonder
deploymentblokkade op die meetwaarden. Alle vijftien echte samples blijven in
het rapport; overschrijdingen worden zichtbaar gemeld. Functionele chat,
autorisatie, filters, exacte berichtidentiteit, alle vijftien zichtbare lokale
regels, canonieke aflevering en focus blijven verplichte controles. Alle
werpgates blijven hard: echte foreground-invoer, maximaal
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

### Laatste native floodcontrole en hosted stagingpipeline

De main-CI van `a74fbf556b9428841bf7e381593d2719bd27e4fb`,
[run 38439425208](https://github.com/dartspoint/platform/actions/runs/38439425208),
faalde op een werkelijk ontbrekende overlap in de nieuwe floodfixture: het
chatverzoek was al afgerond voordat Playwright de werpinput uitvoerde.
Dat bewijst geen werpfout in de applicatie. Alleen de workspacefixture is
gecorrigeerd: drie echte berichten van de werpende actor vullen de bestaande
3/2-secondenlimiet. De vierde echte cookie-geauthenticeerde browserfetch start
synchroon in de capturefase van dezelfde pointer-/Enter-input, vóór de gewone
React-werphandler. Er is geen routehold, vertraagde response of aangepaste klok.
De oorspronkelijke capturetijd blijft het begin van de handler-/framemeting,
zodat het werk voor fetch ook meetelt. De echte `trace.inputAt` en start/einde
van fetch gebruiken dezelfde browserklok en bewijzen de overlap.

De éénmalige volledige native regressie van die fix slaagt: **21/21 checks**,
alle vijftien oorspronkelijke chatsamples en beide eerste floodstops. De
pointerhandler duurt **1,0 ms**, de Enter-handler **1,9 ms**; de eerste frozen
frames verschijnen na **21,3/23,2 ms**. Freeze en ACK verschuiven **0 CSS px**,
met dezelfde indicator- en bordnodes. De onveranderlijke originele ingress
bevestigt sampleleeftijden van **13/19 ms** binnen **54 ms**. Beide echte
chatverzoeken geven `429 chat_burst_limited` en lopen tijdens hun werphandler
nog; hun duur is 168,1/172,2 ms. Er is geen herstelpoging of extra testrun
gebruikt. Normale opgave en SDK-cleanup zijn geslaagd. Alle ruwe samples,
werkelijke UUID's en vroege floodtijdstippen staan in
`artifacts/local-final-proof/workspace-chat-native-input-flood-20261013T175726Z/`.

De afzonderlijke
[stagingpipeline 38439425675](https://github.com/dartspoint/platform/actions/runs/38439425675)
van `a74fbf556b9428841bf7e381593d2719bd27e4fb` is volledig geslaagd, inclusief
image-publicatie en gecontroleerde deployment. De hosted wedstrijdcontrole
tegen haar geïsoleerde infrastructuur bewaart **11 pogingen: acht exact
geaccepteerd en drie expliciet afgewezen**. Hun originele sampleleeftijden
zijn 71/81/88 ms bij een venster van 54 ms. Iedere afwijzing bewaart de volledige
state en versie en toont de fout met gecontroleerd herstel; iedere axis en
vertraging bevat een echte acceptatie. Eerste-frame p95 en maximum zijn
**45,0 ms**. Deze hosted controle is afzonderlijk van een browsermeting tegen
de actieve VPS. De toenmalige opvolgende fixturecommit op main en staging
bevatte browserfixtures en deze documentatie; de applicatiebroncode was in
die fixturecommit ongewijzigd ten opzichte van `a74fbf5`.
De metingen hieronder bewijzen de pre-finale release `a74fbf5`; een opvolgende
release-SHA krijgt eigen verse release- en browseracceptatie in de private
artifacts. Deze metingen worden niet als bewijs voor een nog ongecontroleerde
opvolgende release aangemerkt.

### Werkelijke staging-VPS: pre-finale volledige acceptatie

De live acceptatie gebruikt exact
`a74fbf556b9428841bf7e381593d2719bd27e4fb` op web én realtime, via geverifieerd
TLS en de tijdelijke Tailscale CONNECT-proxy. De oorspronkelijke drie
harnessbronhashes voor smoke en wedstrijd matchen deze release. De eerste smoke-aanvraag faalde met 401 vóór bootstrap en vóór
een werptest; de oorspronkelijke oorzaak is niet vastgesteld en deze failure
blijft behouden. De afzonderlijke gerichte diagnose controleerde beide echte
spelers met provider, cookie en bearer en gaf succesvolle antwoorden, zonder
databasewijziging of sessierefresh in die diagnose. Daarna slaagt de normale
smokecontrole met beide eigen spelers. Bewijs:
`artifacts/staging-a74-final/source-manifest.json`, `sequence-preflight.json`,
`smoke-failure.json`, `auth-diagnostic-result.json` en
`sequence-smoke-acceptance.json`, met hun private logs.

De éénmalige volledige live wedstrijdcontrole slaagt met **8/8 exact
geaccepteerde stops**, nul afwijzingen en nul uitgesloten pogingen. Alle zes
axis-/vertragingcohorten van 100/300/1000 ms bevatten een echte acceptatie.
Freeze en ACK verschuiven **0 CSS px**; handlermaximum is **0,6 ms** en de
eerste frozen frame p95/maximum **29,4 ms**. Alle vier grounded impacts hebben
maximaal **0,00000544 CSS px** afwijking en behouden hun SVG-transform in drie
volgende frames na werkelijk gedupliceerde flightsnapshots. Verlies/herstel
van de originele command-UUID geeft geen extra pijl; de fixture eindigt via
normale opgave. Bewijs: `sequence-game-result.json`,
`sequence-game-progress.json`, `sequence-game-summary.json` en
`sequence-game-acceptance.json` onder `artifacts/staging-a74-final/`, plus
`sequence-game-private.log`. De acceptance koppelt de geslaagde childtest aan
de gecontroleerde actieve SHA.

De eerste live oefencontrole stopte bij haar eerste horizontale poging met
`409 invalid_render_sample`; er zijn nul afgeronde oefensamples en geen
geslaagd acceptancebestand. De latere beperkte operatorcontrole bevestigt de
oorspronkelijke onveranderlijke ingress van die eigen speler en command-UUID
op exact a74: sampleleeftijd **138 ms**, latency **45 ms**, samplevenster
**124 ms**. Alleen de old-grens is overschreden, met **14 ms**; fase-start,
phaseToken, fase, toekomstgrens en lastAcceptedAt-controle kloppen. De query
controleert geen connection-ID. De afwijzing was dus correct.
Bewijs: `operator-original-practice-ingress-proof.json`. De failure blijft behouden in
`sequence-practice-rejected.json`, `sequence-practice-failure-summary.json` en
de private modelog. De lokale Playwright-stack toont wel een concreet verschil
in de fixturetransporten: `route.fetch` verstuurt de stop opnieuw via Node HTTPS
met een nieuwe proxyverbinding, CONNECT en TLS, terwijl de kalibratieping via
`route.continue` de Chromiumverbinding gebruikt. Dat verschil bewijst niet
alle oorzaken van de gemeten transportleeftijd. Een afzonderlijk
geautoriseerde fixturecorrectie gebruikt
de echte browserfetch voor uitgaande vertraging en behoudt de originele UUID,
response en alle werpgrenzen. De actieve applicatie blijft dezelfde release.

De éénmalige volledige live controle met die gecorrigeerde oefenfixture slaagt:
**16/16 stops met HTTP 200**, acht op 1366×768 en acht op 390×844, zonder
uitgesloten pogingen. Freeze, pending, ACK en genormaliseerde fractie verschuiven
**0 CSS px**. Handler-p95 en maximum zijn **0,5 ms**; eerste-frame-p95 en maximum
zijn **15,1 ms**. Acht echte grounded pijlen wijken maximaal **0,000016005 CSS px**
af. De cold-readyguard vóór drie challenges slaagt. Een afzonderlijke
geïnjecteerde hoofdthreadpauze van 160 ms geeft `409 invalid_render_sample`,
volledig ongewijzigde authoritative state, een zichtbare fout en gecontroleerd
herstel naar een bewegende meter. Deze controle staat apart van de zestien
gewone samples. Alle gewone samples gebruiken de echte browserresponse en
blijven pending tot de werkelijk uitgestelde levering aan de app.

Bewijs: `native-practice-{result,progress,summary,acceptance}.json` en de private
modelog onder `artifacts/staging-a74-final/`. Het afzonderlijke
`native-practice-source-manifest.json` markeert de oefenfixture terecht als
gewijzigd ten opzichte van de release (`practiceHarnessMatchesRelease: false`),
met SHA-256 `b750e103ef6871e005b7b389bb4a9fd398a1faccea40a534484bffd884521791`.
De wrapper en wedstrijdfixture matchen nog de oorspronkelijke release;
applicatie-, package-, migratie-, ops- en scriptbronnen zijn ongewijzigd.
`native-practice-preflight.json` bevestigt voor web en realtime HTTP 200 en
exacte release `a74fbf5`. Dit nieuwe transportbewijs verwijdert de oorspronkelijke
mislukte poging niet; haar correcte old-afwijzing is afzonderlijk vastgesteld
via de oorspronkelijke serveringress.

De volledige live chatcontrole slaagt met **15/15 oorspronkelijke berichten**,
allemaal echte HTTP 200 en een correcte canonieke persoonlijke SDK-push.
Eigen optimistic DOM-p95 is **8,4 ms**, binnen het gerapporteerde doel van 50 ms.
Ontvanger-DOM-p95 is **693,8 ms**: het gerapporteerde 250-ms-streefdoel is
hier **niet gehaald**. Dit blijft volgens de expliciete gebruikersprioriteit
een informatieve meting; er is geen hogere limiet ingesteld, optimalisatieronde,
herhaling of sampleverwijdering gebruikt. Beide headless browsercontexts
melden feitelijk focus en zichtbaarheid, zodat ook deze meting geen
achtergrondontvanger bewijst. Tracing en screenshots staan tijdens de meting
uit. Alle ruwe samples en hun werkelijke canonieke UUID's staan in
`final-chat-latency.json`, met `final-chat-summary.json`,
`final-chat-acceptance.json` en de private modelog onder dezelfde bewijsmap.

De afsluitende readinesscontrole geeft voor web én realtime HTTP 200 en exact
dezelfde actieve release `a74fbf5`; de gebruikte manifesthashes zijn nog
gelijk en de applicatiebroncode is nog ongewijzigd ten opzichte van die release.
`artifacts/staging-a74-final/final-stage-proof.json` koppelt de geslaagde
smoke-, wedstrijd-, oefen- en chatacceptatie aan hun afzonderlijke meetwaarden
en afsluitende controle. De eerste smoke-401 blijft bewaard met onbekende
oorspronkelijke oorzaak; de bewaarde oefen-409 is een bewezen correcte afwijzing
van een 138 ms oude sample buiten 124 ms. Deze volledige reeks bewijst de pre-finale
release a74 en geen fysieke apparaten.

De opvolgende release krijgt opnieuw eigen geverifieerde release- en
browseracceptatie. Haar gereserveerde private eindlocatie is
`artifacts/staging-final-proof/release-result.json`; die toekomstige release
wordt hier niet als geslaagd aangemerkt. Ongewijzigde applicatiebroncode bewijst
geen byte-identieke Dockerimages: een nieuwe release-SHA en build-ID kunnen
de gebouwde uitvoer wijzigen.

### Latere CI en gebruikersprioriteit

Commit `5e19b05e641ac62b9084621956a253a6cd618e97` is nog **niet deployed**.
De [stagingpipeline 38446406866](https://github.com/dartspoint/platform/actions/runs/38446406866)
faalde onder de toen geldende lokale chatgate met alle **15/15** samples:
lokale p95 **56,3 ms**, ontvanger-p95 **389 ms**. De ontvangerwaarde was al
informatief. Images en gecontroleerde deployment zijn overgeslagen; actief
blijft exact `a74fbf556b9428841bf7e381593d2719bd27e4fb`. De eerdere updategate in
die CI accepteerde alle dertig werppogingen, met eerste-frame-p95 **14,6 ms**
en maximum **17,8 ms**. Nieuwe wedstrijd-, oefen- en floodwerpcontroles zijn
in die run niet bereikt. Ruwe log en veilige samenvatting blijven bewaard in
`artifacts/staging-final-proof/5e19-staging-ci-{failure-private.log,safe-proof.json,status.json}`.

De [main-CI 38446405884](https://github.com/dartspoint/platform/actions/runs/38446405884)
faalde afzonderlijk op de harde floodwerpgate: de verticale handler duurde
**6,4 ms**, maar de eerste frozen geometrie werd na **479,8 ms** gemeten,
boven 50 ms. De horizontale meting was **1,1/18,4 ms**. Beide echte
chatverzoeken gaven `429 chat_burst_limited`. Deze failure blijft behouden in
`5e19b05-main-ci-failure-summary.json` en de private joblog onder dezelfde map;
zij wordt niet door de chatprioriteit tot een geslaagde werptest verklaard.

De expliciete gebruikersprioriteit geldt nu consequent voor **beide**
chatlatenties. Rapporten bewaren `targets: {localMs: 50, recipientMs: 250}`,
afzonderlijke `localTargetMet`/`recipientTargetMet` en voor beide gates
`reported-only-user-priority-2026-10-13`. Alle vijftien functionele,
geautoriseerde, canonieke afleveringen en documentfocus/zichtbaarheid blijven
verplicht. Playwright emuleert documentfocus; fysieke OS-focus is niet bewezen.
Geen grens is verhoogd en geen sample gefilterd, verwijderd of opnieuw gemeten.
Alle werphandler-/framegrenzen van 50 ms, 1-CSS-pixelgrenzen en oorspronkelijke
admission-/statecontroles blijven hard. Op dit historische meetmoment was de applicatiebroncode in apps,
packages, Supabase en ops ongewijzigd ten opzichte van actieve a74;
CI-uitvoering, fixtures, rapportagebeleid en documentatie zijn gewijzigd.

De aanvullende flooddiagnostiek bewaart apart de RAF-callbacktijd en de tijd
tot de afgeronde DOM-geometriemeting. De harde 50-ms-gate blijft gelden tot
die afgeronde geometrie. Long-task-, long-animation-frame- en
focus/zichtbaarheidmetadata hebben elk maximaal 64 entries, met expliciete
support- en dropped-tellers; attributie, scripts, URL's en requestinhoud worden
niet gelezen. CI draait de wedstrijd- en oefenwerpproeven vóór de bredere
workspacecontrole. Voorbereiding en upload van de beperkte, gesaneerde
JSON-meetrapporten gebruiken `if: always()`, zodat een latere failure reeds
gegenereerd werpbewijs bewaart. Credentials, cookies, berichtinhoud en private
joblogs worden niet in dat artifact opgenomen.

Eén lokale native controle met de ongewijzigde gemeten fixture slaagt met
**21/21 functionele checks** en **15/15 chatsamples**. Chat-p95 is lokaal
**13,1 ms** en bij de ontvanger **206,9 ms**; beide blijven informatief.
De horizontale werphandler/geometrie zijn **0,8/19,5 ms**, de verticale
**2,1/23,7 ms**. RAF-entry is respectievelijk **19,5/23,7 ms**; gemeten
synchrone layoutduur is bij beide **0 ms**. Beide eerste pogingen zijn exact
geaccepteerd, met **0 CSS px** freeze/ACK, dezelfde DOM-nodes en werkelijke
overlap met een `429 chat_burst_limited`-response. Sampleleeftijden **19/22 ms**
vallen binnen hun **54 ms** venster. Ondersteunde long-task/animation-frame-
observers melden geen events; state-events en dropped-tellers zijn nul.
Dit reproduceert de oorspronkelijke **479,8 ms** niet en bewijst haar oorzaak
niet. Bewijs staat in
`artifacts/local-final-proof/workspace-flood-diagnostics-20261013T185535Z/`,
met private log, ruwe `generated-files`, samenvatting en bronhashmanifest
(`measuredFixtureUnchanged: true`). Dit is lokale headless browseracceptatie;
staging en fysieke apparaten blijven apart.

De [staging-CI voor `04eb3f3`, run 38451467991](https://github.com/dartspoint/platform/actions/runs/38451467991)
bewaart geslaagde wedstrijd- en oefenwerpproeven vóór een afzonderlijke
`HTTPS SDK fixture timed out` bij de 90-secondenlimiet. Wedstrijd: **9/9**
pogingen behouden, **8 geldig** en **1 correct geweigerd** wegens een sample
van **99 ms** buiten **54 ms**, met volledige state ongewijzigd, zichtbare
fout en herstel; geen uitgesloten pogingen. Alle zes as/delaycohorts bevatten
een geldige stop. Handlermaximum is **2 ms**, frame-p95/maximum **32 ms**,
freeze/ACK **0 CSS px**; vier grounded impacts wijken maximaal
**0,000005172 CSS px** af en blijven stabiel. Oefenen: **16/16 geldig**, nul
uitgesloten, handler-p95/maximum **0,4 ms**, frame-p95/maximum **13,6 ms** en
freeze/pending/ACK **0 CSS px**; acht grounded impacts maximaal
**0,000013579 CSS px**. Cold-readyguard en aparte oude-samplecontrole slagen.
De CI-upload bewaart deze veilige numerieke rapporten; private log en
samenvatting staan onder `artifacts/staging-final-proof/04eb-staging-ci-*`.
De HTTPS-timeoutoorzaak is niet vastgesteld; deze run bereikte de
workspace/floodsuite niet en verklaart de eerdere **479,8 ms** niet. Images en
deployment zijn overgeslagen: actieve staging blijft exact
`a74fbf556b9428841bf7e381593d2719bd27e4fb`. Dit bewijst hosted CI-werpgedrag,
geen nieuwe live stagingacceptatie of fysieke apparaten.

### Aanvullend latencyonderzoek vóór nieuwe commit

Drie toen nog niet gepushte appwijzigingen zetten pending/busy en exacte lokale
lock vóór direct socket-/native-fetchdispatch; geometrielezingen, logging en
React-updates volgen. Geselecteerd stop/send-werk is circa **0,3 ms**, maar
oorspronkelijke native-eventtijd tot afgeronde frozen geometrie blijft voor
**iedere poging ≤50 ms**, met **≤1 CSS px** en ongewijzigde sample-/UUID-/
ingress-/retryregels. Tijdelijk full Chromium 145.0.7632.6 verschilt van de
oorspronkelijke vaste Playwright-headless-shellpolicy: deze proeven blijven
apart; de oorspronkelijke policy is daarna hersteld.

Ongetraceerde wedstrijd faalt bij mobiele poging vijf: **54,8 ms** vóór
capture, **0,2 ms** commandwerk en **66,8 ms** tot frozen geometrie; alle vijf
pogingen behouden. Ongetraceerd oefenen faalt bij poging dertien met
**41,5/0,2/54,7 ms**. Alle dertien HTTP 200/exacte samples met 0-pixel-
freeze/pending/ACK blijven behouden; eerste twaalf maximum **31,1 ms**,
laatste ingress **51 ms binnen 106 ms**. Drie resterende samples en aparte
oude-samplecontrole zijn niet bereikt. De aparte wedstrijdtrace faalt met
**36,9/0,2/58,5 ms**, bij correcte acceptatie (**29 ms binnen 54 ms**).
Workspace/floodprofiel meet horizontaal/verticaal **31,7/32,7 ms** en slaagt
als diagnostische run, geen vervangende normale acceptatie.

De wedstrijdtrace meet **12,761 ms** opgenomen rendereractiviteit binnen
58,5 ms, layout **0,317 ms**, style **0,813 ms**, GC nul. Software-Viz is
vrijwel continu actief; layer-/filter- en kernel-schedulerattributie ontbreken.
De screencast zelf gebruikt **17,84 ms browser-main CPU**. Het expliciet
gekoppelde monotone hostinterval meet **95,96% CPU-bezetting**,
**48,97% CPU-pressure some** en load **15,82** op twaalf logische cores.
Dit ondersteunt onafhankelijke capaciteitsverificatie, geen bewezen oorzaak
voor hosted **349,9/479,8 ms** of ongetraceerde failures. Hosted CI-VM's waren
afzonderlijk; gemeten overlap verklaart 349,9 ms niet. Later stabiele
PNG-centra liggen binnen 1 CSS px; gecorrigeerde CDP-metadata is
metadata-aanmaaktijd, geen bewezen swap/presentatie binnen 50 ms of fysiek
schermbewijs. Geen gemeten boardrasteroorzaak rechtvaardigt een SVG-rewrite.

**138 > 124 ms** blijft een aparte correcte afwijzing: latency 45 is
begrensde halve onderste RTT-kwartielwaarde en geeft
`min(90,max(20,3*45))+34 = 124 ms`. Appreceive wordt vóór async auth
vastgelegd; latere pool-/rowlock-/transaction-/COMMITwachten verlengen die
sampleleeftijd niet. `processedAt`, `queueMs`, `dbMs` en send-calltijd zijn
geen volledige wire-/commit-/presentatietijdlijn; klok-/queuebeperkingen staan
in het timingdocument. Private failures/profielen blijven in de drie
proofmappen van **19:50:52, 19:53:49 en 20:03:51 UTC** onder
`artifacts/local-final-proof`. Tijdens die onderzoeksfase was Git nog
`04eb3f3` en live staging `a74fbf5`; de opvolgende commits en CI-uitkomsten
staan in de latere secties hieronder.


De nieuwe normale lokale policybundel gebruikt dezelfde gewijzigde app met
vastgepinde Chromium Headless Shell, native `event.timeStamp`, echte mobiele
touch-input en alle harde gates: wedstrijd 8/8 exact geldig, frame-p95/max
45,7 ms; oefenen 16/16 HTTP 200 exact, frame-p95/max 30,7 ms; originele
flood H/V 21,5/20,3 ms. Freeze/pending/ACK zijn 0 CSS px, 12 stabiele impacts
hebben maximaal 0,000015889 CSS px fout; geen uitgesloten pogingen. Alle zes
wedstrijdcohorts, lost-ACK/UUID/reconnect en de aparte 160-ms oude-sample-
afwijzing met volledig statebehoud slagen. Workspace: 21/21 checks en 15/15
canonieke chatregels; informatieve chat-p95 11,7/236 ms. Bewijs:
`artifacts/local-final-proof/native-policy-shell-acceptance-20261013T200853Z/`.
Dit vervangt geen full-Chromiumfailure of hosted/stagingmeting. CI is op
ubuntu-24.04 vastgezet en bewaart begrensde 1-Hz-capaciteitmetadata plus
HTTPS-fixturefasen; de 90-seconden-HTTPSgate blijft gelijk. SDK-operations en
cleanup hebben afzonderlijke harde grenzen; gesloten owned rooms wachten
niet op een toekomstige leave-event. Nieuwe CI/liveacceptatie volgen apart.

### Hosted failure van e579484 en gerichte beperking van bordrenders

De [main-CI van e579484](https://github.com/dartspoint/platform/actions/runs/38461550402)
faalde op wedstrijdpoging vijf met de vaste Chromium Headless Shell
145.0.7632.6: **57,7 ms** van native-eventtijd tot eerste frozen geometrie.
Daarvan lag **20,4 ms vóór de capturelistener**; het stop/send-commandwerk
was circa **0,2 ms**. De handler bleef met 20,8 ms binnen zijn grens, maar
de volledige lokale framegrens werd overschreden. De failurediagnostiek
bevatte een echte receipt met oorspronkelijke sampleouderdom **48 ms
binnen 54 ms** en geen admissionviolaties. De normale exacte-outcome-
classificatie werd door de eerdere harde frameassert niet bereikt; deze
receipt maakt de mislukte test geen PASS. Alle vijf pogingen bleven bewaard.
De grenzen **50 ms en 1 CSS px** zijn ongewijzigd.

De 1-Hz-hostmetadata liet op deze **2-CPU-VM** gedurende de laatste tien
seconden gemiddeld 91,52% CPU-bezetting zien, met een maximum van 100%.
De laatste CPU-PSI `some avg10` was **54,91%**, terwijl circa **5 GiB**
geheugen beschikbaar bleef, geheugen-PSI nul was en geen swap-I/O werd
gemeten. De waargenomen cgroup had geen expliciete CPU-quota, throttling
of OOM-events. De dichtstbijzijnde hostsample lag 81 ms vóór de oorspronkelijke
serverontvangst; de browser-time-origin was niet afzonderlijk vastgelegd.
Dit bewijst CPU-druk rond de test, geen oorzaak van de exacte framepauze.
Main en staging gebruikten afzonderlijke hosted runner-VM's, ondanks de
overlap van hun jobs. Bewijs: `artifacts/ci-e579-main/`.

De daaropvolgende gerichte appwijziging voegt standaard React-memoization
toe aan `Dartboard` en `PracticeBoard` en houdt de wedstrijd-darts-array
stabiel wanneer de bordgegevens gelijk blijven. Hiermee wordt onnodig
renderwerk voor de bestaande 80 wedstrijd- en 60 oefenbordsegmenten bij
alleen een wijziging van de verzendstatus beperkt. Bordvormgeving,
spelregels, scoreberekening, samplekeuze en het serveracceptatievenster
blijven gelijk. Dit is geen bewezen verklaring of oplossing voor de
57,7-ms-failure: nieuwe lokale metingen, de volledige nieuwe pipeline en
verse live stagingacceptatie zijn nog vereist. De eerdere geslaagde
lokale bundel blijft historisch bewijs voor de eerdere bronversie.

De [staging-CI van dezelfde e579484-bron](https://github.com/dartspoint/platform/actions/runs/38461549389)
faalde eveneens bij poging vijf: **60,4 ms**, waarvan **31,3 ms vóór de
capturelistener** en circa 0,2 ms stop/send-commandwerk. De failurediagnostiek
bevatte een receipt met **39 ms sampleouderdom binnen 54 ms**, zonder
admissionviolaties; ook hier werd de normale exacte-outcomeclassificatie
door de harde frameassert niet bereikt. Imagepublicatie en deployment zijn
overgeslagen. Beide CI-failures blijven apart bewaard; de memoization is
een daaropvolgende bronwijziging en vereist een nieuwe commit/pipeline.
Bewijs: `artifacts/ci-e579-staging/`.

De nieuwe ongeprofilede lokale bundel na deze bordwijziging staat in
`artifacts/local-final-proof/board-memo-acceptance-20261013T203710Z/`.
Met dezelfde vaste Headless Shell en één seriële uitvoering slaagt de
wedstrijd: **8/8 exact geaccepteerd, native eerste-geometrie p95/max 36,0 ms**,
alle zes ACK-delaycohorten, verloren ACK en reconnect, vier impacts met
maximaal **0,000014 CSS px** fout, nul freeze-/ACK-verspringing. Oefenen
slaagt met **16/16 HTTP 200, p95/max 31,6 ms**, acht impacts maximaal
**0,000014 CSS px**, nul freeze-/ACK-verspringing; koude calibratie en de
afzonderlijke bewust 160 ms oude claim blijven correct geblokkeerd.
De volledige workspacecontrole slaagt **21/21** en **15/15 canonieke
HTTP-200-chatberichten**. Tijdens exact drie floodseeds plus een echte
overlappende vierde HTTP-429-request stoppen beide assen binnen
**22,6/15,0 ms**, met nul freeze-/ACK-verspringing en oorspronkelijke
sampleouderdom **13/10 ms binnen 54 ms**. Chat-p95 11,2/236,1 ms blijft
informatief; alle werpgrenzen blijven hard. Iedere normale native poging
blijft in de resultaten. Bronhashes en 1-Hz-hostmetadata koppelen deze
bundel aan de gewijzigde build, niet aan e579484 of de oudere stagingrelease.
Typecheck, bestaande unittests, productiebuild en readiness zijn geslaagd.
Dit lokale resultaat bewijst geen oorzakelijke vergelijking van twee
verschillend geplande CI-interacties; nieuwe exacte-SHA-CI en verse live
stagingcontroles volgen nog.

### Afgeronde CI van 3faea753 en gerichte testomgevingwijziging

De [main-run](https://github.com/dartspoint/platform/actions/runs/38464754401)
van `3faea75394fae1c9b436f776372131f41e599937` faalt in de bestaande
verticale floodcontrole: native invoer tot commandhook **5,3 ms**, tot
eerste frozen geometrie **207,3 ms**, nul freeze-/ACK-afwijking. De echte
receipt bevat het oorspronkelijke sample van **28 ms binnen 54 ms**.
De gewone wedstrijdcontrole slaagde eerder in dezelfde run: acht samples,
p95/max **42,3 ms**. Oefenen slaagde met zestien HTTP-200-samples,
p95/max **32,1 ms**. Ook de echte HTTPS/SDK/reconnectcontrole slaagde;
de eindregressie en TLS/restoregate zijn door de floodfailure niet compleet.
Bewijs: `artifacts/ci-3faea-main/`.

De [staging-run](https://github.com/dartspoint/platform/actions/runs/38464752931)
van dezelfde commit faalt eerder, bij de vijfde mobiele wedstrijdpoging:
**65,6 ms**, waarvan **32,5 ms vóór de capturelistener**. De receipt bevat
**46 ms sampleouderdom binnen 54 ms**, nul freeze-/ACK-afwijking.
Imagepublicatie en deployment zijn overgeslagen. Staging web en realtime
toonden bij de nieuwe TLS-controle om 20:43:46 UTC nog de bestaande release
`a74fbf556b9428841bf7e381593d2719bd27e4fb`; dit is geen acceptatie van 3faea753.
Bewijs: `artifacts/ci-3faea-staging/` en `artifacts/staging-3faea-final/`.

De floodfailure heeft een **103,5 ms timerpauze** en **226,9 ms RAF-pauze**.
Timers hervatten vóór de eerste gemeten frozen geometrie, dus één continue
207-ms-JS-blokkade is niet aangetoond. De twee overlappende 1-Hz-hostintervallen
meten op twee cores **49,75/96,04% CPU** en **33,66/67,31% CPU-wachtdruk**.
Er is geen gemeten geheugen-, swap- of cgroupthrottlingtoename. Dit is
gecorreleerde capaciteitsdruk, geen volledige causale verklaring.

Een afzonderlijke Headless-Shell Performance-opname op de ongewijzigde build,
met alleen browser/test op twee lokale cores gepind, faalt op **93,8 ms**.
Daarvan zit **68 ms vóór capture**; de volledige Event-Timing-pointerhandler
duurt **5,965 ms**, de React-flush **4,383 ms wall/3,137 ms CPU**, layout
**0,326 ms** en paint **0,302 ms**. Er is geen SVG-bordpaint in dat kritieke
interval. Dit onderbouwt geen volgende bord- of indicatorherschrijving en
bewijst de oorzaak van de afzonderlijke CI-failures niet. Geen nieuwe fysieke
presentatieclaim: RAF/geometrie en Event Timing blijven beperkte waarnemingen.
Bewijs: `artifacts/local-final-proof/shell-performance-3faea-20261013T205344Z/`.

De volgende gerichte CI-aanpassing start realtime en worker rechtstreeks uit
hun bestaande `dist/deploy/*/server.js`-productiebundles, zoals de lokale
acceptatie en deploymentimages al doen. De TypeScript-loader is hierdoor
niet langer onderdeel van deze runtimes. Tevens worden de twee ongebruikte
Supabase-services `realtime` en `storage` uitgesloten; dit zijn de geldige
CLI-2.109.1-servicenamen. Applicatie en suite hebben geen API-consumenten van
die services. Auth, PostgreSQL, PostgREST, Kong en mail blijven aanwezig.
Alle **27 Node- en 2 Python-testcommando's**, vaste browser en harde
50-ms/1-CSS-px-/oorspronkelijke-samplegates blijven gelijk. Dit is een
testomgevingwijziging; CPU-winst of een geslaagde volgende pipeline is
hiermee nog niet bewezen. De failures blijven behouden en live deployment
vereist nieuwe succesvolle exacte-SHA-verificatie.

### Afzonderlijke QA-runner op de bestaande VPS

De nieuwe beheerderinventaris meet vier logische cores, circa 6,3 GiB
beschikbaar geheugen, 148,6 GB vrije schijf en 92,2–99,0% CPU-idle over vier
seconden. De twee deploymentrunners zijn idle; uitschakelen ervan levert
geen aangetoonde CPU-winst op. Er wordt een afzonderlijke `runner-qa` met
eigen rootless Docker ingericht. Alleen vertrouwde main/staging-pushes
kunnen na bevestigde installatie via de repositoryvariable
`DARTSPOINT_QA_ON_VPS=true` op de ene `dartspoint-qa`-runner terechtkomen;
die jobs draaien daardoor serieel. QA krijgt geen Environmentsecrets,
appgroepen of algemene sudo. [Beheer en uitschakelen](../ops/QA-RUNNER.md).

De eerste operatorinstallatie bereikte de gecontroleerde rootless-resourceproef
en registreerde `dartspoint-qa-01`, maar stopte vóór de servicestap. De
oorspronkelijke metadatareader faalt lokaal aantoonbaar op een UTF-8-BOM
in `.runner`; de officiële runnerwriter gebruikt `Encoding.UTF8`.
De gerichte leesfix bevestigt ook op de werkelijke VPS `utf8Bom: true`
en een passende identiteit. De hervatte installatie slaagt voor UID 1005,
met werkelijk gecontroleerde containerlimieten en ongewijzigde bestanden
en main-PID's van Caddy en beide deploymentrunners. GitHub bevestigt één
online, idle QA-runner. De opt-invariable is daarna geactiveerd. Bij de
voorbereiding van deze commit is er nog geen groene QA-pipeline of nieuwe
deployment; die volgen uitsluitend na nieuwe exacte-SHA-verificatie.
Bewijs: `artifacts/staging-3faea-final/qa-infrastructure-review.json` en
`qa-registration-bom-local-reproduction.json` in dezelfde private map.

De ongeprofilede lokale bundel met de gerichte runtimewijziging slaagt
eenmalig en serieel: wedstrijd **8/8**, native eerste-geometrie maximum
**41,6 ms**; oefenen **16/16 HTTP 200**, maximum **30,1 ms**; workspace
**21/21** en **15/15** canonieke berichten, flood H/V **19,2/19,2 ms**.
Die bundel bewijst de lokale applicatiecontrole; de nieuwe QA-account-,
Docker-, browserdependency- en cleanupcontroles vereisen echte CI.
Bewijs: `artifacts/local-final-proof/ci-runtime-parity-acceptance-20261013T211037Z/`.

De eerste echte QA-jobs van `cff567ba9f86197b92df2fe2372d18168b8142e4`
stoppen vóór dependencies of browsermetingen: [main](https://github.com/dartspoint/platform/actions/runs/38472291111)
en [staging](https://github.com/dartspoint/platform/actions/runs/38472291876)
weigeren `qa_socket_invalid`. Configuratie slaagt; publicatie/deployment zijn
overgeslagen. De oorspronkelijke controle vereiste alleen de primaire
socketgroep. De gerichte correctie erkent ook de eigen exclusieve subgid-range
voor rootless namespaces en weigert vreemde of overlappende toewijzingen.
Sockettype, eigenaar-UID, private parent en afwezige other-permissions blijven
verplicht. Alleen begrensde UID/GID/mode-/booleanmetadata wordt gelogd.
De daadwerkelijke afwijkende socketmetadata en oorzaak moeten door de
volgende CI bevestigd worden; er wordt nog geen succesvolle test geclaimd.

De volgende commit `9d243933a27c2e95b44970dbc2f5bd2fc7d6dcf5` bevestigt
de socketoorzaak werkelijk: UID **1005**, GID **428667** behoort tot de
exclusieve eigen subgid-range en verschilt van de primaire GID. Context-,
build-, ops- en browserdependencycontroles slagen. [Main](https://github.com/dartspoint/platform/actions/runs/38472972193)
stopt vervolgens bij `OTP message not received`; [staging](https://github.com/dartspoint/platform/actions/runs/38472972866)
stopt in preclean met `qa_test_port_occupied`. Beide zijn afzonderlijk
behouden; publicatie en deployment blijven overgeslagen. De main-EXIT en
de daaropvolgende stack-/workspacecleanup zijn aantoonbaar geslaagd.

De gerichte vervolgaanpassing maakt uitsluitend de publieke, HEAD-byte-identieke
OTP-template leesbaar voor de container en controleert beide werkelijke
Kong-template-endpoints vanuit de eigen Auth-container. De eerdere mailmelding
onderscheidde ontbrekende mail niet van ontbrekende OTP-tekst; alleen veilige
foutmetadata wordt toegevoegd. Alle **40 × 100 ms**, bestaande authflow,
stagingloginbranch en harde werpgates blijven gelijk. De werkelijke oude
templatepermissies en mailoorzaak zijn hiermee nog niet vastgesteld; de nieuwe
CI-preflight legt de permissies en geserveerde publieke inhoud vast.

Een echte lokale ephemeral-TCP-proef toont daarnaast dat een gesloten
verbinding in TIME_WAIT een gewone bindprobe nog kan weigeren. Met
`SO_REUSEADDR` slaagt die probe, terwijl een actieve LISTEN-socket nog
`EADDRINUSE` geeft. De QA-preclean gebruikt daarom die veilige bindoptie
en logt bij een echte weigering alleen het poortnummer. De oude stagingfailure
bevat geen poortnummer; haar exacte poortoorzaak blijft onbekend.
Achttien helper/componentcases, vier mailpollmocks, typecheck en **39/39**
ops-contracttests slagen. Alle **29** integrationtestcommando's blijven exact
gelijk. Bewijs staat in de private `ci-9d2439-*`- en `staging-3faea-final`-mappen;
nieuwe exacte-SHA-CI en verse live stagingacceptatie blijven vereist.
