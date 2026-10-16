# Releasebeheer — UI/UX en gedrag

Deze toevoeging is onderdeel van het DartsPoint Sites-prototype. Het beheerbord, de idee-invoer en de lobbywidget gebruiken dezelfde lokale gegevens. Ze demonstreren de volledige gebruikersflow; er wordt geen productierelease gedeployd en er worden geen echte gebruikersberichten verstuurd.

## Ingangen

- `/demo/beheer?tab=releases`: directe prototype-ingang voor het releasebord.
- `/beheer?tab=releases`: releasebeheer vanuit de bestaande beheernavigatie.
- `/beheer?tab=lobby&widget=releases`: de gekoppelde lobbywidget instellen.
- `/updates`: alle gepubliceerde toevoegingen, idee-invoer en eigen ideeën.
- Kamerlobby: widget **Laatste toevoegingen**. De speler blijft in de kamer bij openen van details of insturen van een idee.

## Eén bord met vier stappen

| Kolom | Betekenis | Zichtbaar voor spelers |
|---|---|---|
| Ideeën | Binnengekomen voorstellen van spelers en het team | De indiener kan de status van het eigen idee volgen. |
| In overweging | Het team onderzoekt het voorstel | Eigen status; dit is nog geen toezegging. |
| In uitvoering | Er wordt aan de verbetering gewerkt | Eigen status; er wordt geen opleverdatum beloofd. |
| Toegevoegd | Het werk is afgerond | Pas na afzonderlijke publicatie verschijnt de releasetekst in de lobby. |

Desktop biedt slepen tussen kolommen. Statuskeuze en kaartdetails maken dezelfde handelingen beschikbaar met toetsenbord en op mobiel. Zoeken en categorieën beperken het bord; mobiele statuskeuzes houden kaarten leesbaar.

## Idee naar toevoeging

Een speler vult een titel, categorie en toelichting in. De bevestiging toont een herkenbaar nummer. Het idee verschijnt in **Ideeën** en in het overzicht van de eigen inzendingen. Andere spelers krijgen geen inzage in nieuwe ideeën of interne notities.

Platformbeheer kan een kaart openen, tekst en prioriteit aanpassen, een versielabel invullen en interne notities bewaren. Wijzigingen krijgen een historie en komen in het bestaande actielogboek. Een nieuwer bewerkt item wordt niet stilzwijgend met een oud formulier overschreven.

Voor de lobby heeft iedere kaart een afzonderlijke titel en korte releasetekst. **Publiceren in lobby** maakt na controle een openbare momentopname. Het aanpassen van een intern concept wijzigt een bestaand lobbybericht pas na opnieuw publiceren. Een bericht kan worden ingetrokken. Terugplaatsen uit **Toegevoegd** trekt de openbare toevoeging ook in; de UI licht dit toe.

## Lobby & widgets

De centrale widgetbron is Releasebeheer. Per widget kan beheer instellen:

- titel en introductie;
- één tot vijf recente toevoegingen;
- de knop **Idee inbrengen** tonen of verbergen in deze widget;
- halve of volle breedte, volgorde en zichtbaarheid;
- alle kamers of een selectie van kamer-ID's.

De widget toont alleen gepubliceerde toevoegingen, nieuwste eerst. Details en alle toevoegingen openen in een dialoog. De preview in lobbybeheer laat geen nieuwe ideeën opslaan. Concept-/publicatiegedrag en kamerselecties van het bestaande lobbybeheer blijven gelden.

Een eenmalige migratie voegt de widget toe aan bestaande lokale indelingen, met behoud van hun titels, volgorde, kamerselecties en onafgemaakte concepten. Een later bewust verwijderde widget komt niet automatisch terug. Een inrichting die al de limiet van 30 widgets heeft, wordt behouden; daar kan beheer eerst ruimte maken.

## Broncode en overname

- `lib/darts-releases.ts`: gedeelde state, validatie, statusovergangen, historie, revisies en openbare projectie.
- `components/admin/darts-releases.tsx`: kanban, kaartdetails, publicatie en intrekken.
- `components/darts-release-updates.tsx`: lobby-inhoud, toevoegingsdetails, ideeformulier en eigen inzendingen.
- `lib/darts-lobby-content.ts`: widgetdefinitie en migratie.
- `components/admin/darts-lobby-content.tsx`: widgetinstellingen en verwijzing naar releasebeheer.
- `scripts/check-releases.mjs` en `scripts/check-lobby-content.mjs`: gerichte regressiecontroles.

Bij overname naar het echte platform: gebruik serveridentiteit voor de indiener, platformbeheerrechten voor beheerhandelingen, gecontroleerde revisies voor updates en een afzonderlijke openbare projectie die geen interne notities, historie of persoonsgegevens bevat. Bestaande lobbypublicatie bepaalt de plaatsing; de releasepublicatie bepaalt welke toevoegingen mogen worden getoond. Bewaar de prototypefixtures niet als echte gebruikersinzendingen.

De lokale browseropslag synchroniseert de demonstratie tussen tabbladen. Dit vervangt geen gedeelde productie-API of servertransactie. De 50 voorstellen uit de eerdere review blijven een afzonderlijke backlog; enkele representatieve voorbeelden maken de nieuwe flow direct te bekijken.
