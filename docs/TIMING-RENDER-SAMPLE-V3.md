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

De uiteindelijke lokale native build doorstond beide browsertests. Oefenen
mat 16 stops op desktop en mobiel: maximale verschuiving bij freeze en receipt
was `0 CSS px`, de lokale input-p95 was `1,4 ms` en het maximale verschil van
de gelande pijlpunt met het serverraakpunt was `0,000014 CSS px`. De echte
wedstrijd mat zes stops: freeze en receipt versprongen maximaal `0 CSS px`,
de handler nam maximaal `0,5 ms` en de eerstvolgende frozen frame kwam binnen
`18,0 ms`, op beide assen. De pijlpunt week maximaal `0,000010 CSS px` af. Bevestigingen werden
100/325/1050 ms vertraagd met 0/10/20 ms uitgaande stopvertraging. Gelijktijdige
kamerchat, replay van een oude receipt en verlies/herstel van een echte
bevestiging slaagden; de oorspronkelijke UUID werd hersteld zonder extra pijl.
Deze waarden betreffen de lokale build, niet de nog te meten stagingrelease.

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
