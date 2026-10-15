# Tijdelijke homepage tot de opening op 15 oktober 2026

De productiehomepage toont tot **15 oktober 2026 om 20:00 uur Europe/Amsterdam**
een aftelpagina in de stijl van de bestaande landingspagina. Dat tijdstip is
**18:00 UTC**. Het aanmeldveld maakt plaats voor uren, minuten en seconden.
Het bestaande premiumlogo en de bestaande lettertypen worden hergebruikt.

De server beslist per aanvraag of het openingstijdstip is bereikt. Vanaf dat
moment rendert dezelfde homepage de bestaande website. De pagina is dynamisch
en wordt niet als vaste HTML gecachet. Er is om 20:00 uur geen tweede deployment
of Caddy-wijziging nodig.

Een openstaande aftelpagina gebruikt de servertijd en een monotone browserklok.
De publieke, ongecachete `/api/opening-status` bevestigt het openingstijdstip;
zodra de server `open: true` geeft, wordt `/` volledig opnieuw geladen. Terugkeer
naar een slapend tabblad controleert de status opnieuw. Een netwerkstoring
verandert het openingstijdstip niet.

`/opening` toont vóór de deadline dezelfde pagina voor de gerichte lokale
weergavecontrole en verwijst vanaf de deadline naar `/`. De productiehomepage
kiest de countdown vóór het ophalen van de gewone publieke platformprojectie.
De oorspronkelijke landingspagina op `binnenkort.dartspoint.nl` blijft een
afzonderlijke pagina met haar eigen bestaande aanmeldflow.

De gewone releaseprocedure wacht lopende wedstrijden af. Het automatisch
omschakelen van de homepage om 20:00 uur start geen services opnieuw.
