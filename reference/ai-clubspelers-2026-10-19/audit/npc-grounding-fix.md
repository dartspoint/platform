# Contextbewaking NPC-reacties — correctie 1.1

## Aanleiding
Een begroeting selecteerde een willekeurige persona-voorbeeldzin over een dubbel. Die zin veronderstelde een partij die niet was gespeeld. De fout zat zowel in de begroetingsroute als in de onbekende-inputfallback.

## Correctie in het Sites-prototype
- Nieuwe pure dialoogmodule: aparte intenties, gecontroleerde begroetingen, verduidelijking en afwijzing. Runtime-antwoorden komen niet uit responseExamples.
- Spelfeiten worden alleen geregistreerd na echte demo-voltooiing. De beperkte ondersteunde eventsoort is match_completed; geen uitspraken over specifieke worpen of dubbels uit een uitslag afleiden.
- Een uitslagreactie draagt exact event-ID, match-ID en actorvereiste. Kamer, deelnemers, winnaar en twee minuten echte versheid worden bij publicatie herbevestigd.
- Een recente eigen uitslag wordt niet gebruikt voor een onbekende tegenstander, andere datum, nummer of dubbelzinnige verwijzing. Dan volgt verduidelijking.
- De definitieve tekst wordt binnen de gedeelde tekstpublicatielock op context gecontroleerd. Een afgewezen kandidaat wordt niet in de 12-uursgeschiedenis geschreven.
- Het antwoord verwijst naar het werkelijke menselijke bronbericht. Een nieuw bronbericht, pauze/hervatting, vertrek/terugkomst, statuswijziging, reset of kamerwijziging annuleert een oude beurt, ook tijdens het wachten op de publicatielock.
- De community-matchroute werkt alleen bij de werkelijke actuele human-NPC-match in een geschikte open kamer. De match bewaart de werkelijk opgegeven kamer. Geen automatische NPC-privéreacties.
- Onderlinge contextselectie gebruikt duidelijke onderwerpgrenzen en hypothetische voorkeuren; koken, wandelen, een marathonfinish of het woord overleg zijn geen bevestigde dartssituaties.

## Verificatie
77 prototypechecks slagen: director 8, tekstuniciteit 20, gesprekken 19, grounding 30. De groundinggroep omvat 750 NL/EN-begroetingscombinaties voor alle 25 persona's, 24 ongeldige claimcontexten, geldige resultaten en annulering tijdens timers en locks. TypeScript en de Sites-build slagen. Visuele browser-QA was niet beschikbaar; native-repositorytests zijn niet uitgevoerd. Er waren geen live OpenAI-calls.

## Grens van deze referentie
Dit blijft lokale demostaat. Implementeer native bewijs, autorisatie, transactie, gedeelde opslag en worker-lifecycle volgens de hoofdprompt. De deterministische kandidaatset en regexcontrole zijn geen algemene garantie voor vrije modeltekst. De productieopdracht vereist servergerenderde feitelijke varianten uit echte native events plus controle op eventuele vrije tekst.
