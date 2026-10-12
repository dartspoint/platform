# DartsPoint — exact UI/UX-overdracht naar de development-VPS

Versie: 12 oktober 2026. Opdrachtgever: DG Webservices. Hoofddomein: **dartspoint.nl**; **dartspoint.app** volgt later.

Dit pakket bevat de volledige vastgelegde Sites-broncode, assets en mailtemplates, plus de opdracht om daarvan een echte multiplayerapplicatie te bouwen. Het is **geen al voltooide productiebackend**. De originele presentatie is leidend; lokale demo-opslag en gesimuleerde acties moeten door echte diensten worden vervangen.

## Direct beginnen

1. Pak de ZIP op de development-VPS uit in een aparte overdrachtsmap. Overschrijf geen bestaand project.
2. Voer `python3 verify-package.py` uit vanuit de uitgepakte map. De bron-SHA en controlesommen staan in `MANIFEST.json` en `SHA256SUMS.txt`.
3. Open Codex in de bedoelde development-repository en geef de volledige inhoud van `CODEX-STARTPROMPT.md`, met het absolute pad van dit pakket.
4. Laat Codex de productieapp bouwen, testen en visueel vergelijken. Pas na voltooiing gaat de gebouwde bron naar de juiste GitHub-repository, branch `main`.
5. Maak daarna `staging` en `production`, richt de aparte GitHub Environments en self-hosted runners in en vul de vereiste variabelen en secrets. Een geslaagde pipeline op een merge naar die branch publiceert naar de bijbehorende VPS.

**De aangeleverde bron is de ontwerpbron, niet een verzoek om opnieuw te ontwerpen.** Geen andere componentbibliotheek, andere indeling of alternatieve dartbordafbeelding introduceren. Een noodzakelijke runtimewijziging mag de vormgeving en bediening niet veranderen.

## Wat zit erin?

| Onderdeel | Doel |
|---|---|
| `source-sites/` | Volledige gevolgde bron van de gepubliceerde prototypeversie, inclusief lockfile, CSS, spelregels, SVG/PNG/WebP, PWA-bestanden en bestaande tests |
| `CODEX-STARTPROMPT.md` | De uitvoerbare hoofdopdracht voor Codex op de development-VPS |
| `docs/01-FUNCTIONEEL-CANON.md` | Alle functies, spelregels, rollen, beheerfuncties en aantoonbare productiehiaten |
| `docs/02-TECH-STACK-EN-DIENSTEN.md` | Stackbesluit, diensten en onderbouwing met officiële documentatie |
| `docs/03-AUTH-OTP-EN-OWNER.md` | E-mail/OTP, eerste gebruikersnaam, sessies en veilige eerste eigenaar |
| `docs/04-COLYSEUS-SPEL-EN-DATA.md` | Autoritatieve multiplayer, reconnects, toeschouwers, chat en wedstrijdafhandeling |
| `docs/05-DATABASE-API-EN-MIGRATIE.md` | Datamodel, transacties, toegangscontrole, RLS en adapters |
| `docs/06-UITVOERING-EN-RELEASEGATES.md` | Bouwvolgorde, transport van de exacte UI, concrete kwaliteits- en releasepoorten |
| `docs/07-VPS-GITHUB-EN-DEPLOY.md` | GitHub Environments, branchflow, VPS, runners, secrets, deploy, drain en herstel |
| `docs/08-UI-UX-EXACT-EN-ACCEPTATIE.md` | Bronbestanden, schermgedrag en visuele/functionele acceptatie |
| `ops/` | Startconfiguraties voor de doelarchitectuur; door Codex afmaken en toetsen tegen het daadwerkelijke productieproject |
| `source-sites/emails/` | Mailvoorbeelden en Supabase-authtemplate; lees ook `source-sites/docs/EMAIL-TEMPLATES.md` |
| `MANIFEST.json`, `SHA256SUMS.txt`, `verify-package.py` | Herkomst en controle op volledigheid/beschadiging van het pakket |

## Besloten architectuur

- **Next.js + React + TypeScript** op de VPS voor marketing, accountflow, lobby, spelinterface en platformbeheer; dezelfde Tailwind-, shadcn/Radix- en Motion-presentatie behouden.
- **Managed Supabase Auth + PostgreSQL** voor identiteit en duurzame data. Gescheiden projecten voor staging en productie. Lokale Supabase/mailopvang is bruikbaar op de development-VPS.
- **Colyseus** als aparte Node-spelserver voor echte wedstrijden, kamerstatus, toeschouwers en realtime gebeurtenissen. Supabase Realtime vervangt deze spelserver niet.
- **Redis** intern voor gedeelde coördinatie, rate limits en waar gekozen presence/queues. PostgreSQL blijft de duurzame bron van waarheid.
- **Resend** voor geverifieerde transactionele mail: eigen SMTP in Supabase voor OTP; overige mails via een server-side verzendservice en een duurzame outbox.
- **Caddy + Docker Compose + GitHub Actions** voor de aparte staging- en productieruntimes en HTTPS/WebSockets.

Deze keuze vermijdt het zelf bouwen van een identiteitssysteem en houdt het tijdkritische dartspel in een server die hiervoor geschikt is. De onderbouwde afwegingen, alternatieven en nog te controleren versies staan in document 02.

## Inlogflow

`E-mail → code per mail → code bevestigen → eerste keer gebruikersnaam kiezen → lobby`.

Een terugkerende speler slaat alleen de gebruikersnaamstap over. De OTP blijft iedere nieuwe authenticatie vereist zolang er geen geldige sessie bestaat. De gekozen gebruikersnaam is een uniek publiek label; de stabiele identiteit is de geverifieerde auth-UUID. E-mailadressen zijn niet zichtbaar voor andere spelers.

In het Sites-prototype worden codes en mails lokaal gedemonstreerd. Het echte versturen, verificatie, rate limits, sessies en reserveren van gebruikersnamen worden op de development-VPS geïmplementeerd volgens document 03. De oude vaste Nick-speler is voorbeelddata, geen echte nieuwe gebruiker en geen manier om eigenaar te worden.

## Jouw eerste owner-account

Geen automatisch eigenaarschap voor de eerste registrant. Na het bevestigen van het expliciet aangewezen e-mailadres wordt die exacte auth-gebruiker met een eenmalige server-side bootstrap eigenaar. De procedure controleert UUID, geverifieerde e-mail, omgeving en eenmalige uitvoering en schrijft een auditregel. Daarna worden de bootstraprechten/variabelen weer uitgeschakeld.

Het bedoelde owner-e-mailadres is nog **niet ingevuld**. Er is bewust geen e-mailadres uit een andere dienst of uit het prototype overgenomen. Ook de GitHub-repository-URL, VPS-adressen en echte secrets moeten in jouw omgeving worden ingevuld; er staan geen echte credentials in dit pakket.

## Branches en omgevingen

| Bron | Runner | Gevolg |
|---|---|---|
| Development-VPS → `main` | Lokale ontwikkelchecks en gewone CI | Bewaart de volledig gebouwde bron; geen automatische staging- of productiedeploy |
| Merge naar `staging` | Alleen staging-runner, Environment `staging` | Validatie, build, gecontroleerde migratie, deploy, healthchecks |
| Merge naar `production` | Alleen production-runner, Environment `production` | Dezelfde poorten met productiesecrets, actieve spellen laten eindigen, deploy, healthchecks |

Geen self-hosted deploymentjob op onbetrouwbare pull requests. Een mislukte test of migratie betekent geen geslaagde uitrol. Na een succesvolle merge kan de pipeline starten; alleen een **geslaagde pipeline** geldt als een succesvolle deployment.

## Wat is al gecontroleerd, en wat moet nog?

De prototypewijzigingen krijgen typecontrole, gerichte auth-/mailtests en een Sites-productiebuild. De broncode en assets worden met de exacte gepubliceerde SHA opgenomen. Live browser- en mailclientcontroles zijn in deze werkruimte niet beschikbaar: de visuele referentiebaseline moet op de development-VPS vanuit de meegeleverde originele bron worden vastgelegd.

Het pakket claimt geen live SMTP-bezorging, echte gebruikers, Colyseus-belastingtest, VPS-installatie of GitHub-deployment. Dat zijn expliciete bouw- en acceptatieopdrachten. Een configureerbare demo of een groen buildresultaat is daarvoor geen vervanging.

## Voorrang bij tegenstrijdigheden

1. De laatste concrete gebruikersinstructie: OTP per mail, eerste naamkeuze, exacte UI, Colyseus en de opgegeven branchflow.
2. De productiecontracten in deze overdracht voor veiligheid, data en echte werking.
3. De aangeleverde bron voor bestaande vormgeving en bediening.
4. Oudere documentatie in `source-sites/docs/` als achtergrond. Daar kunnen nog eerdere demoteksten in staan.

Een voorgestelde operationele grenswaarde (bijvoorbeeld reconnecttermijn) is herkenbaar als voorgestelde V1-default, geen historische gebruikersbeslissing. Maak die instelbaar en leg de gekozen waarde vast. Verander geen spelregels of visuele keuzes om implementatie eenvoudiger te maken.
