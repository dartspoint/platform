# Timing van getekende samples

Nieuwe wedstrijden en oefensessies gebruiken `render-sample-v3`. Bestaande
partijen behouden `receive-v1` of `bounded-latency-v2`, inclusief hun eerdere
ontvangsttijdbeleid. Er worden geen historische worpen of scores herschreven.

De browser schrijft de indicator in zijn RAF rechtstreeks naar de DOM en
bewaart daarbij de servergerelateerde sampletijd, fractie en fase. Primary
pointerdown of een enkele Enter/Spatie bewaart precies deze sample. De handler
bemonstert de beweging niet opnieuw. Een synchrone pending guard blokkeert
pointer/click/repeat-dubbelingen; volgende frames behouden de lokale lock.
Motion verzorgt de dartanimatie, maar schrijft de timingindicator niet via een
tweede RAF-renderer. Dat onderscheid voorkomt een vooruitlopende MotionValue.

De SVG-pijlpunt gebruikt het gezaghebbende raakpunt en één vlucht per dart-ID.
Een nieuwe snapshot met gelijke hitcoördinaten herstart de vlucht niet. Zodra
de server de dart als geland presenteert, stopt de bestaande animatie in het
layout-effect en staat de tip vóór de eerste grounded paint exact op dat
raakpunt. De regressiecontrole dupliceert een werkelijk ontvangen flight-snapshot,
meet de eerste grounded RAF en bewaart drie volgende frames: pixelafstand tot
het serverdoel maximaal 1, met een ongewijzigde gelande SVG-transform. Zo kan
een latere meting na een opnieuw afgespeelde animatie de fout niet verbergen.

Een actieve fase heeft één vaste mapping van `performance.now()` naar
servertijd. Pas na drie klokmetingen én drie serverchallenges wordt invoer
actief. Snelle aanvankelijke challenges vermijden een verplichte wachttijd van
zes seconden. Betere pings veranderen de mapping van een volgende fase, nooit
die van een actieve fase. Er is geen monotone `Math.max`-pauze of inhaalplateau.
HTTP-pings voor oefenen leveren server-receive/send-tijden; authenticatie- en
Redisverwerking worden van de client-RTT afgetrokken.

Voor v3 kiest de fase de hoogste gemeten ondergrens
`serverSendAt - clientReceiveAt` uit de drie beste RTT-metingen. Een gewone
RTT/2-mapping kan bij een langzamere heenweg in de toekomst liggen: de eerste
echte browsertest vond een sample 13,10 ms in de toekomst ten opzichte van de
serveringress. De ondergrens
neemt geen symmetrische heen-/terugweg aan en blijft conservatief achter de
werkelijke servertijd met de gemeten terugweg. De indicator en server gebruiken
nog steeds exact dezelfde sample. Tot die mapping de serverstart van de fase
heeft bereikt, wordt geen nieuwe sample getekend of als stop geaccepteerd.
Verbeterde metingen gelden pas voor een volgende fase of expliciet herstel na
een afwijzing. Legacy v1/v2 behouden hun midpoint-mapping en ontvangstbeleid.

V3 rondt de gemapte sampletijd vóór het tekenen naar beneden af op hele
milliseconden, dezelfde resolutie als de serveringress. Zonder die stap kan
een fractie van een milliseconde bij een zeer snelle verbinding onterecht
na de afgeronde ontvangsttijd vallen. De getekende en verstuurde sample blijven
identiek; het acceptatievenster en de afwijzing van toekomstige claims blijven
ongewijzigd. De oudere timingversies behouden hun oorspronkelijke precisie.

Een stop draagt naast UUID, stateVersion en phaseToken een **onvertrouwde**
`renderSample: {sampleAt, connectionId, dartNumber}`. Alleen de server kent de
gemeten verbinding en bepaalt het venster. Voor minstens drie geldige
serverchallenges geldt:

```
latencyMs = min(90, floor(onderste-kwartiel-RTT / 2))
netwerkvenster = min(90, max(20, latencyMs * 3))
renderleeftijd = 34 ms
samplevenster = netwerkvenster + renderleeftijd  // maximaal 124 ms
ingress - samplevenster <= sampleAt <= ingress
sampleAt >= phaseStartedAt && sampleAt >= lastAcceptedAt
```

De bestaande **90 ms compensatiegrens blijft behouden**. De afzonderlijke
34 ms is het budget voor de laatst getekende frame, geen aanvullende
netwerkcompensatie. Het netwerkvenster biedt maximaal driemaal de gemeten
onderste-kwartielschatting, binnen diezelfde 90 ms. Onder zeer grote jitter of
een lang geblokkeerde hoofdthread kan een stop dus worden afgewezen.

De server controleert bovendien actor, sessie, beurt, lifecycle, stateVersion,
phaseToken, dartnummer en oorspronkelijke verbinding. Een geldige sample wordt
ook alleen vóór de bestaande serverdeadline van de beurt toegelaten (normaal
30 seconden, of de ingestelde wedstrijdlimiet). De oorspronkelijke ingress
beslist hierover; databasewachttijd verruimt de limiet niet. Een geldige sample
wordt exact gebruikt door de gedeelde driehoeksfunctie; score en x/y komen uitsluitend
van de server. Een oude of toekomstige sample geeft `invalid_render_sample`
zonder score of statewijziging. De client toont de fout en haalt de bestaande
fase opnieuw op. Een sample wordt nooit stilzwijgend naar een andere positie
gekneld. Alleen na deze expliciete afwijzing wordt de vaste mapping voor die
fase opnieuw opgebouwd uit de recentere kalibratie. Dat gecontroleerde herstel
voorkomt dat een inmiddels betere verbinding permanent toekomstige samples
blijft produceren; het wijzigt geen reeds toegelaten worp.

De oorspronkelijke UUID, geparste payloadhash, ingress, timingversie,
serververbinding en gemeten venster worden vóór de autoritatieve wachtrij in
`private.command_ingress` vastgelegd. Reconnect/retry gebruikt dezelfde payload
en haalt dezelfde ontvangstregistratie en receipt op. Een andere payload bij
dezelfde UUID wordt afgewezen. Receipts bevatten de commandId; de browser
controleert daarnaast de actuele socketgeneratie. Een oude receipt mag geen
nieuwe pending stop vrijgeven. Oefenen past hetzelfde contract toe, met een
serverchallenge per geverifieerde sessie en logisch HTTP-timingkanaal.

Ontvangstregistraties krijgen een afzonderlijke, begrensde wachtrij. Realtime
reserveert de volgorde direct in de socket-handler. HTTP-oefenen reserveert bij
POST-entry, vóór body parsing, authenticatie en Redis, met een hash van het
aangeboden sessiecredential als volgordesleutel. Die hash geeft geen rechten;
normale authenticatie blijft verplicht. Een sneller geauthenticeerde retry kan
de eerste ontvangst daarom niet inhalen. Alleen de korte ingressregistratie
loopt in deze wachtrij; snapshots, klokmetingen en de autoritatieve verwerking
lopen er buiten. Parse-, auth-, Redis- en databasefouten ruimen de reservering
altijd op. Volle wachtrijen geven `command_busy` zonder nieuwe registratie.

Een clienttijdclaim bewijst geen fysieke menselijke klik. Een aangepaste client
kan binnen het toegestane venster kiezen. Dit is begrensd vertrouwen voor
visuele overeenstemming, geen volledige anti-cheatgarantie.

## Bewijs en grenzen

De pure oorspronkelijke code gaf bij warmup en 60 ms uitgaande jitter
`-18,182 CSS px` op een 500 px balk. Een betere pingsample veroorzaakte een
klokstap van `-95 ms`, oftewel `-19 px` op een 220 px balk.
Een daadwerkelijk gemeten browser op de oude lokale build gaf bij twee
horizontale stops een initiële hersampling van `-1,663` en `+7,470 px`, gevolgd
door een totale bevestigingsverschuiving van `+36,609` en `-14,078 px`. Het tweede
geval gebruikte 60 ms geïnjecteerde HTTP-heenweg; dit is geen fysieke
netwerkmeting van de gebruiker.

`tests/unit/render-sample-timing.test.ts` controleert exacte gedeelde posities,
beide assen/richtingen/omslagen, afwijzing in plaats van clamp, faseklokcontinuïteit
en HTTP-verwerkingstijden. `tests/integration/render-sample-timing.ts` controleert
de echte lokale database, oorspronkelijke ingress bij retry, actorrechten,
ongeldige claims, eenmaal toegepaste impact, oefenen en v2-compatibiliteit.
`tests/e2e/render-sample-timing.ts` meet echte DOM-geometrie op desktop en mobiel,
eerste frozen frame, pending, bevestiging, asymmetrische HTTP-vertraging en een
te oude sample na een drukke hoofdthread. `tests/e2e/game-timing.ts` gebruikt echte
Colyseus-wedstrijden met uitgaande/inkomende injectie, oude receipt en verlies
van een bevestiging. Geldige stops hebben een harde grens van 1 CSS px; kleine
verschillen door CSS-subpixelafronding blijven zichtbaar in de resultaten.

De afzonderlijke native timingrun na de DartVisual-fix doorstond beide browsertests. Oefenen
mat 16 stops op desktop en mobiel: maximale verschuiving bij freeze en receipt
was `0 CSS px` (`0` van de balkbreedte/-hoogte), de lokale input-p95 was `0,6 ms` en het maximale verschil van
de gelande pijlpunt met het serverraakpunt was minder dan `0,000014 CSS px`. De echte
wedstrijd mat zes stops: freeze en receipt versprongen maximaal `0 CSS px`,
de handler nam maximaal `0,5 ms` en de eerstvolgende frozen frame kwam binnen
`30,9 ms`, op beide assen. De eerste grounded pijlpunt week minder dan `0,000014 CSS px` af en bleef drie volgende frames op dezelfde transform. Bevestigingen werden
100/325/1050 ms vertraagd met 0/10/20 ms uitgaande stopvertraging. Gelijktijdige
kamerchat, replay van een oude receipt en verlies/herstel van een echte
bevestiging slaagden; de oorspronkelijke UUID werd hersteld zonder extra pijl.
Deze meetwaarden staan in
`artifacts/local-final-proof/final-combined-render-sample-timing-result.json`
en `final-combined-game-timing-result.json`; de actuele stagingmeting staat
afzonderlijk bij de exacte gedeployde release in de changeset.
Deze waarden betreffen de lokale build en staan los van de afzonderlijke VPS-metingen.

De latere native wedstrijdcontrole bewaart acht echte stoppogingen, alle acht
exact geaccepteerd: beide assen bij ieder cohort van 100/300/1000 ms vertraagde
inkomende bevestigingen, plus werkelijk verlies/herstel van een receipt.
Handlermaximum is 0,5 ms; eerste frozen frame p95 en maximum zijn 26,2 ms.
Freeze en ACK verschuiven 0 CSS px. De vier daadwerkelijke impactcontroles,
inclusief de pijl na reconnect, behouden de eerste grounded SVG-tip en drie
volgende transforms; maximale tipafwijking is 0,00001199 CSS px. Iedere poging
blijft behouden en ieder cohort vereist minstens één exacte acceptatie.
Bewijs: `artifacts/local-final-proof/outcome-aware-game-timing-{result,progress,private.log}`.

De nieuwe workspace-floodcontrole gebruikt dezelfde harde werpgates. Een
hosted fixture kon haar chatverzoek afronden vóór de native input; deze
daadwerkelijke test-overlapfout is opgelost door een echte browserfetch in de
capturefase van diezelfde pointer-/Enter-input te starten. De gewone
werphandler volgt zonder await, routehold, responsevertraging of klokaanpassing.
De latency begint vóór die fetch; het extra capturewerk wordt dus meegemeten.
Drie echte nieuwe chatberichten vullen de bestaande 3/2-secondenlimiet; het
vierde verzoek geeft daadwerkelijk 429 en overlapt de echte werphandler.
De volledige native regressie accepteerde beide eerste stops exact: handler
1,0/1,9 ms, eerste frozen frame 21,3/23,2 ms, freeze en ACK 0 CSS px, dezelfde
indicator- en bordnodes. Originele sampleleeftijden zijn 13/19 ms binnen 54 ms.
Dit bewijs staat in
`artifacts/local-final-proof/workspace-chat-native-input-flood-20261013T175726Z/results.json`.
Er is geen werpvenster verruimd en er zijn geen pogingen opnieuw gemeten of verwijderd.

De volledig geslaagde hosted stagingpipeline
[38439425675](https://github.com/dartspoint/platform/actions/runs/38439425675)
van `a74fbf556b9428841bf7e381593d2719bd27e4fb` bevat elf wedstrijdpogingen tegen
geïsoleerde hosted infrastructuur. Acht stops zijn exact geaccepteerd; drie
claims van 71/81/88 ms oud vallen aantoonbaar buiten hun originele venster van
54 ms. Zij geven expliciet `invalid_render_sample`, een zichtbare fout,
volledig ongewijzigde state/version en gecontroleerd herstel. Iedere
axis/vertraging behoudt minstens één werkelijke acceptatie. Eerste-frame p95
en maximum over alle elf pogingen zijn 45,0 ms. Dit is geen live VPS-browsertest;
die heeft afzonderlijk bewijs tegen de exacte actieve staging-SHA.

De éénmalige volledige live wedstrijdcontrole op
`a74fbf556b9428841bf7e381593d2719bd27e4fb` accepteert 8/8 stops exact, met nul
afwijzingen of uitgesloten pogingen. Beide assen bij ieder 100/300/1000-ms-cohort
bevatten een echte acceptatie. Freeze en ACK verschuiven 0 CSS px; handlermaximum
is 0,6 ms en eerste frozen frame p95/maximum 29,4 ms. De vier eerste grounded
impacts wijken maximaal 0,00000544 CSS px af en behouden hun transform in drie
volgende frames na werkelijk gedupliceerde flightsnapshots. Het verlies en
herstel van de originele UUID maakt geen extra pijl; de normale opgave slaagt.
Web en realtime geven vóór de acceptatie dezelfde exacte release-SHA; het
oorspronkelijke bronmanifest matcht de gebruikte wedstrijdharness. Bewijs staat in
`artifacts/staging-a74-final/sequence-game-{result,progress,summary,acceptance}.json`
en de private modelog. De eerste smoke-401 blijft bewaard; de oorzaak is niet
vastgesteld. De latere gerichte identiteitscontrole en normale smoke slagen.
De eerste live oefenpoging geeft `409 invalid_render_sample`, zonder afgeronde
oefensamples of geslaagde acceptance. Een latere beperkte read-only
operatorcontrole vindt de oorspronkelijke ingress van exact die eigen actor,
UUID en a74-release: sampleleeftijd **138 ms**, gemeten latency **45 ms** en
venster **124 ms**. Alleen de old-grens is overschreden, met **14 ms**; fase-start,
phaseToken, fase en overige tijdgrenzen kloppen. De read-only query controleert
geen connection-ID. De afwijzing was correct en de
oorspronkelijke failure blijft behouden. Bewijs:
`artifacts/staging-a74-final/operator-original-practice-ingress-proof.json`.
Er is afzonderlijk een fixturetransportverschil vastgesteld: `route.fetch`
verstuurde de stop via een nieuwe Node HTTPS/proxy/CONNECT/TLS-verbinding,
terwijl de via `route.continue` gekalibreerde ping de Chromiumverbinding
gebruikte. Dat bewijst niet alle oorzaken van de extra transportleeftijd. Een geautoriseerde
nieuwe oefenfixture gebruikt native browserfetch met dezelfde originele UUID
en echte response, zonder de werpgrenzen te wijzigen. Haar bronhash en bewijs
worden afzonderlijk van het oorspronkelijke release-manifest vastgelegd.
De éénmalige live controle met deze gewijzigde oefenfixture slaagt op dezelfde
actieve `a74fbf5`-app: zestien stops met echte HTTP 200, acht desktop en acht
mobiel, zonder uitgesloten pogingen. Freeze, pending, ACK en fractie verschuiven
0 CSS px. Handler-p95/maximum zijn 0,5 ms; eerste frozen frame p95/maximum zijn
15,1 ms. Acht grounded pijlen wijken maximaal 0,000016005 CSS px af. De
cold-readyguard vóór drie challenges slaagt. Een aparte geïnjecteerde
160-ms-hoofdthreadpauze levert 409, de exacte timingfout, volledig ongewijzigde
authoritative state, een zichtbare fout en gecontroleerd herstel op; zij
vervangt of verwijdert geen gewone sample.

Bewijs: `artifacts/staging-a74-final/native-practice-{result,progress,summary,acceptance}.json`.
Het nieuwe `native-practice-source-manifest.json` onderscheidt de gewijzigde
oefenfixture (SHA-256 `b750e103ef6871e005b7b389bb4a9fd398a1faccea40a534484bffd884521791`)
van de oorspronkelijke release: de wrapper en wedstrijdfixture matchen a74,
en alle applicatiebronnen zijn ongewijzigd. De preflight bevestigt dezelfde
exacte release op web en realtime. De eerste oefen-409 is afzonderlijk
bewezen correct via de oorspronkelijke ingress; de nieuwe meting verwijdert
die oude failure niet. De afsluitende controle van de volledige pre-finale reeks bevestigt
web en realtime met HTTP 200 en exact dezelfde a74-release, ongewijzigde
applicatiebroncode en nog overeenkomende gebruikte manifesthashes. Het
gecombineerde bewijs staat in
`artifacts/staging-a74-final/final-stage-proof.json`. Deze browsermetingen
bewijzen geen fysieke schermfrequentie, telefoontoetsenbord of menselijke touchlatency.

De aanvullende updatebrowser bewaart alle 30 native invoerpogingen met
100/300/1000 ms vertraging van uitsluitend de ontvangen response. Iedere
poging wordt onafhankelijk getoetst aan de oorspronkelijke database-ingress.
Geldige stops moeten exact worden bevestigd; ongeldige stops moeten HTTP 409,
een zichtbare timingfout, volledig ongewijzigde spelstate en gecontroleerd
herstel geven. Iedere delay/invoer-combinatie vereist een echte geldige stop.
De lokale run had 30/30 geldige stops, eerste-frame p95 `12,8 ms` en maximum
`15,0 ms`. Een afzonderlijke 160 ms hoofdthreadpauze bewees de afwijzingscontrole
met een 185 ms oude sample bij een 54 ms venster. Deze geïnjecteerde controle
staat apart van de verdeling; natuurlijke weigeringen worden daarin behouden.

Traces bevatten commandId, match/session UUID, dart/fase/version, sampletijd en
fractie, geometrie vóór input, inputtijd, lokale lock/clockoffset, serveringress,
gemeten venster/latency, admittedAt, receipt en definitieve lock/raakpunt. Er
staan geen tokens, e-mailadressen of spelersnamen in timingtraces.

Werkelijke resultaten staan in genegeerde `artifacts/*timing*result.json` en het
sprintbewijsdocument. Lokale en staging-resultaten moeten afzonderlijk worden
gerapporteerd, met de actieve release-SHA. Headless Chromium en geïnjecteerde
vertraging zijn geen fysieke 60/120/144 Hz-beeldschermtests; dergelijke hardware
is hier niet beschikbaar. Een stagingfix is pas geverifieerd na browsermetingen
tegen de actieve stagingrelease.

De opvolgende commit `5e19b05e641ac62b9084621956a253a6cd618e97` is niet deployed;
actief blijft a74. Haar staging-CI bewaart vijftien oorspronkelijke chatsamples
met lokale p95 **56,3 ms** en ontvanger-p95 **389 ms**, waarna de toen harde
lokale chatgate faalt. Publicatie/deployment zijn overgeslagen. De eerder
uitgevoerde updategate accepteert alle dertig werppogingen, met eerste-frame
p95 **14,6 ms** en maximum **17,8 ms**; nieuwe flood-, wedstrijd- en
oefencontroles zijn niet bereikt. De afzonderlijke main-CI faalt op een
verticale floodmeting van **479,8 ms** tot de eerste frozen geometrie, bij een
handler van **6,4 ms**. Die failure blijft een niet geslaagde harde werpgate.
Beide volledige private CI-logs en veilige samenvattingen staan onder
`artifacts/staging-final-proof/5e19*`.

Volgens de expliciete gebruikersprioriteit zijn voortaan **beide**
chatlatenties informatief: `targets: {localMs: 50, recipientMs: 250}`,
`localTargetMet` en `recipientTargetMet`, met voor beide gates
`reported-only-user-priority-2026-10-13`. Alle vijftien echte regels,
canonieke aflevering, autorisatie, idempotency en documentfocus/zichtbaarheid
blijven verplicht. Playwright emuleert documentfocus; fysieke OS-focus is niet
bewezen. Er worden geen samples verwijderd of opnieuw gemeten. Alle werphandler- en
eerste-framegrenzen van **50 ms**, getekende freeze/pending/ACK/impactgrenzen
van **1 CSS px**, oorspronkelijke **90 + 34 ms** admissiongrenzen en volledige
state-/versiebehoudcontroles blijven hard. De applicatiebronnen in apps,
packages, Supabase en ops zijn gelijk aan actieve a74; CI-uitvoering,
fixtures, rapportage en documentatie zijn gewijzigd.

De aanvullende flooddiagnostiek onderscheidt RAF-entry van afgeronde
DOM-geometrie; de harde 50-ms-grens blijft op de laatste meting gelden.
Long-task-, long-animation-frame- en focus/zichtbaarheidmetadata zijn begrensd
tot 64 entries per type, met support-/dropped-tellers en zonder attributie,
scripts, URL's of requestinhoud. CI voert de onafhankelijke wedstrijd- en
oefenwerpproeven eerder uit en bewaart de beschikbare gesaneerde meet-JSON
met voorbereiding en upload onder `if: always()`; credentials, cookies,
berichtinhoud en private joblogs worden niet geüpload.

De eenmalige lokale native controle van deze gemeten fixture slaagt met
21/21 functionele checks en 15/15 chatsamples; lokale/ontvanger-chat-p95 zijn
13,1/206,9 ms en beide informatief. Horizontale handler/geometrie meten
0,8/19,5 ms, verticale 2,1/23,7 ms. RAF-entry is 19,5/23,7 ms; synchrone
layoutduur is bij beide 0 ms. Beide eerste stops worden exact bevestigd,
freeze/ACK verschuiven 0 CSS px en behouden de DOM-nodes tijdens werkelijke
overlap met de afgewezen floodrequest. Sampleleeftijden 19/22 ms passen binnen
54 ms. Ondersteunde performance-observers melden geen long tasks of lange
animation frames; state-events en dropped-tellers zijn nul. De oorspronkelijke
479,8-ms-failure is niet gereproduceerd en haar oorzaak is niet vastgesteld.
Private bewijsbestanden en het bronhashmanifest met
`measuredFixtureUnchanged: true` staan in
`artifacts/local-final-proof/workspace-flood-diagnostics-20261013T185535Z/`.
Dit is lokaal headless bewijs; staging en fysieke apparaten blijven apart.
