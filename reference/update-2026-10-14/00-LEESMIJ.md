# DartsPoint — UI/UX-overdracht aan Codex

14 oktober 2026 · Lobbyruimte, platformbeheer, toernooibeelden en recente gebruiksverbeteringen.

## Zo gebruik je dit pakket

Pak de ZIP volledig uit. Geef Codex toegang tot deze map én de actuele `dartspoint/platform`-checkout. Laat Codex beginnen bij **`01-CODEX-OPDRACHT.md`**. Dat bestand is de complete implementatieopdracht; de overige documenten en bronbestanden zijn de onderbouwing.

Dit is een overdracht van het grafische prototype naar het bestaande platform. De exacte componenten, CSS en assets zijn meegeleverd. De productie-authenticatie, serverautoriteit, opslag en multiplayer moeten behouden blijven. De opdracht vraagt geen nieuwe ontwerpstijl of nieuwe infrastructuur.

## Inhoud

| Bestand/map | Gebruik |
| --- | --- |
| `01-CODEX-OPDRACHT.md` | Begin hier: implementatievolgorde, grenzen en oplevering. |
| `02-UIUX-INVENTARIS.md` | Zichtbaar gedrag, routes en bronpaden per wijziging. |
| `03-PLATFORMBEHEER.md` | Centrale inrichting, widgetselectie per kamer, publicatie, rechten, data en media. |
| `04-ACCEPTATIE-EN-QA.md` | Concrete testgevallen voor desktop, mobiel, beheer en regressies. |
| `05-REPO-INTEGRATIE.md` | Vergelijking met de gelezen platformcommit; bestaande koppelingen en ontbrekende onderdelen. |
| `source-sites/` | Versievastgelegde prototypebron, inclusief afbeeldingen en bronchecks. |
| `SOURCE-CHANGES.csv` | Bestanden die tussen de sessiebaseline en dit prototype zijn veranderd. |
| `source-export.json` | Broncommit, gelezen doelcommit en expliciet weggelaten bestanden. |
| `VERIFICATIE.json` | Uitgevoerde controles op deze bronversie, met uitslag. |
| `manifest.json` en `VERIFY-PACKAGE.py` | Bestandsgroottes en SHA-256-controle na uitpakken. |

Controleer het uitgepakte pakket met `python3 VERIFY-PACKAGE.py` vanuit de pakketmap. Op Windows kan `py -3 VERIFY-PACKAGE.py` worden gebruikt. Het script verandert niets.

## Vaste referentie

- Prototype: `6d473a3de23835494e238b6428cd3d5c15f240dd`.
- Platformrepo gelezen: `5817bd4ba4721195565b2cb87089ab6e1efcf545` op `main`.
- Sites-publicatie: `appgver_bea43ba96160819197f2ca21e187746c`.
- Preview: <https://dartspoint-afterhours-studio.dgwebserv.chatgpt.site/demo>.
- Lobbybeheer: <https://dartspoint-afterhours-studio.dgwebserv.chatgpt.site/demo/beheer?tab=lobby>.
- Toernooibeheer: <https://dartspoint-afterhours-studio.dgwebserv.chatgpt.site/demo/beheer?tab=tournaments>.

De preview is afgeschermd en vereist de bestaande eigenaarstoegang. De ZIP is zelfstandig leesbaar en bevat de beslissende bronversie; de live preview kan later veranderen. Gebruik `/demo`, kies een kamer en bekijk het clubhuis links. De gewone login is een afzonderlijke demoflow.

## Belangrijkste ontwerpbesluiten

1. Eén centrale lobby-inrichting in platformbeheer. Ieder widget kan overal of alleen in geselecteerde kamers verschijnen. Kamers krijgen geen eigen volledige lay-outeditor.
2. De linkerhelft van de kamer toont aankondigingen, een toernooi, nieuws en communitywidgets. Bij een partij maakt die ruimte plaats voor het spel; de community rechts blijft beschikbaar.
3. Mobiele bottomnav-panelen **Kamer, Chat en Ladder** openen in de kamerlobby tot **90%** van de zichtbare viewport; tijdens gameplay tot **60%**. Desktop blijft zijn bestaande verdeling houden.
4. Toernooien krijgen een instelbare header-/heroafbeelding. Een lobbywidget kiest **overnemen van het toernooi**, **eigen afbeelding** of **geen afbeelding**. Uitsnede en donkere overlay zijn instelbaar.
5. Chat, headerdichtheid, beurtmeldingen, toeschouwen en captcha-gating volgen de aangeleverde UI. Een aanzienlijk deel van die gedragswijzigingen bestaat al in de platformrepo: eerst vergelijken, bestaande werkende code behouden.

## Bronpakket en grenzen

`source-sites/` is een referentie-export van de getrackte prototypebestanden. Alleen de Sites-projectidentiteit en een gegenereerde TypeScript-cache zijn weggelaten; zie `source-export.json`. De UI-bestanden zijn bytegelijk aan de vastgelegde commit. Dependencies, gitgeschiedenis, runtimecaches en omgevingsbestanden zijn niet meegeleverd.

De meegeleverde `source-sites/README.md`, packagebestanden en buildhelpers beschrijven de oorspronkelijke Sites-runtime. Ze zijn context, geen opdracht om de bestaande Next.js-monorepo om te bouwen. Het pakket is geen zelfstandig productie-deploymentarchief. Voor integratie gelden de actuele instructies en installatie-/buildcommando's van `dartspoint/platform`.

De demo gebruikt onder andere localStorage, voorbeeldspelers, een lokale verificatiestap, lokaal stemmen en ingebedde uploadafbeeldingen. Codex moet deze vervangen door de bestaande productieadapters en de expliciet beschreven uitbreidingen. Neem demo-beheerbypasses niet over.

De documenten 01–05 beschrijven deze overdracht. Oudere documenten in `source-sites/docs/` blijven historische context; ze geven geen opdracht om eerder vervangen gedrag terug te brengen. Aanbevolen backendcontracten in dit pakket zijn voorstellen, geen claim dat die endpoints of tabellen al bestaan.

De bronchecks en de gepubliceerde build zijn gecontroleerd. Er is voor deze overdracht geen nieuwe browserscreenshot- of stagingacceptatie uitgevoerd. De QA-matrix is de opdracht voor de integratieomgeving. Deze overdracht heeft de platformrepo en zijn deployments niet gewijzigd.
