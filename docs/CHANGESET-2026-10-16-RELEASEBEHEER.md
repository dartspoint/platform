# Releasebeheer en ideeën van spelers

Releasebeheer verbindt het centrale kanbanbord met ideeën van spelers en de lobbywidget Laatste toevoegingen. De vormgeving volgt het Sites-prototype van broncommit `3ab5c477a8f038aca40ef320e6028ea9e88ae844`; de oorspronkelijke bestanden en checksums staan in `reference/release-management-2026-10-16`. De applicatie gebruikt gedeelde PostgreSQL-opslag en bestaande sessies.

## Beheren en publiceren

Het bord op `/beheer?tab=releases` heeft vier statussen: Ideeën, In overweging, In uitvoering en Toegevoegd. Zoeken werkt op titel, referentienummer en indiener. Slepen op desktop en de statuskeuze op mobiel of met toetsenbord gebruiken dezelfde revisiecontrole.

De bestaande platformrollen `admin` (Platformbeheerder) en `owner` mogen kaarten beheren. Support-, kamer-, chat- en toernooirollen geven geen toegang. De bestaande eigenaarbeperking voor het inrichten en publiceren van lobbywidgets blijft gelden.

Toegevoegd maakt een kaart niet openbaar. Publiceren in lobby slaat een afzonderlijke momentopname op van openbare titel, samenvatting, categorie, versielabel, datum en technische verwijzingen. Persoonsgegevens, de oorspronkelijke inzending, interne notities en historie ontbreken in de openbare projectie. Wijzigingen worden pas zichtbaar na opnieuw publiceren. Terugplaatsen van een gepubliceerde kaart vereist bevestiging en trekt de publicatie in dezelfde transactie in. Het versielabel start geen deployment.

## Spelers en de lobbywidget

Idee inbrengen, Mijn ideeën, Alle toevoegingen en details openen in de kamer. De kamer- en chatsessie blijven actief. `/updates` biedt hetzelfde overzicht voor ingelogde spelers en krijgt `noindex`.

Inzendingen gebruiken de identiteit uit de gecontroleerde serversessie. Een speler krijgt uitsluitend diens eigen ideeën te zien. Dubbele verzending en opnieuw proberen na een verloren antwoord gebruiken dezelfde verzoekreferentie. Een fout of revisieconflict bewaart de invoer; sluiten met een concept vraagt om verder schrijven of wissen.

De widget ondersteunt één tot vijf toevoegingen, standaard drie, een instelbare titel en introductie en een optionele ideeknop. Bestaande breedte, volgorde, zichtbaarheid en kamerselectie blijven beschikbaar. De beheerpreview kan niets insturen. De widgeteditor en het releasebord verwijzen naar elkaar.

## Database en beveiliging

Migratie `20261016014629_release_management.sql` voegt private tabellen voor bordrevisie, kaarten, publicaties en historie toe, met RLS, beperkte applicatierechten, indexen en referentiële controles. Mutaties controleren actuele sessie en rol, een verwachte kaartrevisie en een idempotentiesleutel. Beheerhandelingen verschijnen ook in het bestaande actielogboek. Overzichten vernieuwen na wijzigingen, bij terugkeer naar het venster en iedere dertig seconden zolang het scherm zichtbaar is.

De migratie breidt het bestaande concept en de bestaande publicatie van de lobby onafhankelijk uit. Ze bewaart plaatsing en kamerselecties, slaat bestaande releasewidgets over en overschrijdt de limiet van dertig widgets niet. Een bewust verwijderde widget wordt later niet automatisch teruggezet. Accountverwijdering verwijdert eigen spelerinzendingen en bijbehorende momentopnamen; gedeeltelijke chatverwijdering doet dat niet. De eigen ideeën zijn opgenomen in de privacy-export.

Er zijn geen nieuwe secrets, environmentvariabelen of hosthelpers nodig. Deze opdracht wordt uitsluitend naar staging uitgerold.

## Verificatie

- Gerichte database-integratie: 32 scenario's met echte migraties en de beperkte applicatierol, waaronder rechten, idempotentie, gelijktijdig wijzigen, publicatiemomentopnamen, privacy en behoud van lobbyconfiguraties. De normale feed houdt de widgetlimiet aan; het leesvoorbeeld bevat de volledige openbare geschiedenis zonder gegevens te wijzigen.
- Twee unittests voor widgetdefaults en grenswaarden, opgenomen in de bestaande suite.
- TypeScript, de deploymentbuild, 86 unittests, 49 deploymentcontroles, oorspronkelijke spelregelcontroles en bronpariteit slagen lokaal. De Supabase-beveiligingscontrole vraagt expliciete JSON-uitvoer; onbekende of misvormde controleverslagen worden afgewezen. De databasecontrole slaagt ook met de CI-omgeving ingeschakeld.
- De releasebrowsercontrole slaagt voor 18 controles met echte lokale Auth en opslag: inzenden, verloren antwoorden, beheer, publicatie, revisieconflicten, behoud van de kamer en het chatconcept, mobiel- en toetsenbordgebruik en het sluiten van geneste bevestigingen. Schermafbeeldingen zijn visueel gecontroleerd. Beide bestaande acceptatiescripts voeren de nieuwe controles uit.
- De oorspronkelijke assets en beschermde stijlen blijven onder de bestaande broncontrole vallen.

Staging gebruikt `/beheer?tab=releases`, `/beheer?tab=lobby&widget=releases` en `/updates`. Productie vereist een afzonderlijke opdracht.
