# DartsPoint AI-clubspelers — Codex-bronpakket

Lees eerst `01-CODEX-OPDRACHT.md`. Deze opdracht is gebaseerd op de native repository `dartspoint/platform` op `d2d95b7e2954eb99dc911cd61e70150f6360e89d`. Vergelijk vóór uitvoering met de actuele checkout. De auditnotities zijn onderzoeksnotities; de hoofdprompt is het leidende implementatiebesluit.

## Inhoud

- `01-CODEX-OPDRACHT.md`: volledige zelfstandige overdracht, inclusief alle 25 persona's.
- `data/npc-roster.json`: dezelfde persona's als machineleesbare data, met schrijfstijlen.
- `prototype-reference/`: gecommitteerde Sites-bron en assets als UI-/gedragsreferentie.
- `audit/`: analyse van native UI, runtime en sleutelbeheer.
- `VERIFICATION.json`: daadwerkelijk uitgevoerde prototypecontroles.
- `MANIFEST.json` en `verify-package.py`: bestanden en SHA-256-controle.

## Bronrollen

De bestaande native Next.js/Supabase/Colyseus-app is de productiebasis. De Sites-bron gebruikt lokale demostaat en mag niet over de live stores, auth of spelautoriteit worden gekopieerd. De Sites-hostingidentiteit, dependencies, buildoutput, caches en omgevingsbestanden zijn niet meegeleverd. De bronmap is dus een presentatie-/gedragsreferentie, geen zelfstandig productie-installatiepakket. Dependency- en configuratiebestanden die wel zijn meegeleverd helpen de herkomst te begrijpen.

De OpenAI-kaart in het prototype is een veilige lokale formuliersimulatie. Zij slaat geen API-key op en doet geen providercall. De volledige productievariant staat in de opdracht: aparte private secret-opslag, authenticated encryption, owner/capabilitycontrole, versionering, herauthenticatie en geïsoleerde generatie.

Open voorbeeld: https://dartspoint-afterhours-studio.dgwebserv.chatgpt.site/npc
Regisseur: https://dartspoint-afterhours-studio.dgwebserv.chatgpt.site/npc?tab=director
Platforminstellingen: https://dartspoint-afterhours-studio.dgwebserv.chatgpt.site/beheer?tab=platform#openai

## Controle

Pak de ZIP volledig uit en voer in de uitgepakte map `python3 verify-package.py` uit. Daarvoor zijn geen extra packages nodig. De vijf prototypeharnesses staan onder `prototype-reference/scripts/`; zij gebruiken de bijbehorende prototypebron en TypeScript-dependency, niet de native productietestomgeving. Native tests en stagingacceptatie moeten tijdens de uitvoering nog worden uitgevoerd.

## Revisie 1.1 — contextbewaking

Een begroeting kan geen persona-voorbeeld over een gespeelde partij meer kiezen. Feitelijke spelreacties vereisen een exact recent event; onduidelijke verwijzingen krijgen verduidelijking. Geplande reacties vervallen bij een nieuw bronbericht of lifecyclewijziging. Zie sectie 8.4 van de hoofdprompt en `audit/npc-grounding-fix.md`. De bron bevat 77 geslaagde prototypechecks, waaronder 750 NL/EN-begroetingscombinaties.

## Revisie 1.2 — slaapstand zonder bezoekers

Zonder menselijke bezoekers slaapt de regisseur; een lege kamer blijft ook stil als elders wel mensen zijn. Geen gesprekken, nieuwe uitnodigingen of NPC-games; lopende onderlinge partijen staan stil. Oude reacties vervallen definitief en bij terugkomst wordt niets ingehaald. Probeer Simuleer lege kamer en Eerste bezoeker bij Regisseur. De regelaar is lokale demonstratie; voor productie vereist sectie 7.1 echte geauthenticeerde live presence en controle vóór iedere API-aanroep. Zie `audit/npc-audience-sleep.md`. Er zijn 93 geslaagde prototypechecks.
