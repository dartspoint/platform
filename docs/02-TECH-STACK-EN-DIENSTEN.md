# DartsPoint — tech-stack en benodigde diensten

Besluitdatum en broncontrole: 12 oktober 2026. Dit document beschrijft de doelarchitectuur die Codex op de development-VPS moet bouwen. Het is geen verklaring dat deze diensten al zijn ingericht. Behoud de meegeleverde Sites-interface exact; vervang de prototype-opslag en sessies achter die interface door onderstaande productievoorzieningen.

## 1. Besluit

Gebruik **Next.js + React + TypeScript voor de website, beheerschermen en PWA; managed Supabase voor e-mail-OTP, PostgreSQL en objectopslag; Colyseus op een eigen Node.js-proces voor het spel en de live community; Redis voor tijdelijke coördinatie; Resend voor e-mail; Caddy als reverse proxy**. Deploy via GitHub Actions naar afzonderlijke staging- en productieomgevingen, met een eigen self-hosted runner en GitHub Environment per omgeving.

Dit is een bewuste verdeling: Supabase beheert identiteit en duurzame gegevens. Colyseus is de autoriteit voor de actieve wedstrijd. De browser tekent het spel, verwerkt invoer en speelt animaties af, maar beslist nooit zelf over geldige worpen, resterende scores, winnaar, Elo of moderatierechten.

Start eenvoudig: per omgeving één Next.js-proces, één Colyseus-proces, één achtergrondworker en één private Redis-instantie. De database en authenticatie staan bij Supabase. Deze inrichting heeft geen hoge beschikbaarheid; databaseherstel, wedstrijdhervatting en gecontroleerde deployments worden wel direct ontworpen. Meer gameprocessen komen pas na metingen en een geteste routeringsstrategie.

## 2. Concrete onderdelen

| Onderdeel | Keuze voor V1 | Verantwoordelijkheid |
|---|---|---|
| Webapp | Native Next.js App Router, React, TypeScript | Publieke website, OTP-flow, lobby, spel-UI, vrienden, profiel en platformbeheer |
| Styling | Exact bestaande Tailwind, CSS, Radix/shadcn-componenten, Motion en lettertype-assets | Visuele en gedragsmatige overeenkomst met het prototype |
| Game-runtime | Colyseus op Node.js, apart van Next.js | Kamers, geautoriseerde joins, actieve wedstrijden, serverklok, inputvalidatie, aanwezigheid, live chat |
| Identiteit | Supabase Auth | E-mailadres, OTP-uitgifte, OTP-controle, sessies, refresh tokens |
| Database | Managed Supabase PostgreSQL | Profielen, rollen, vrienden, chatgeschiedenis, wedstrijden, worpen, Elo, toernooien, seizoenen, audit en outbox |
| Databasetoegang | Versiebeheerde SQL-migraties; getypeerde repositories met `pg` | Expliciete transacties, uniqueness, locking en toegangsgrenzen; geen tweede ORM-migratiebron |
| Tijdelijke coördinatie | Redis per rootless omgeving op de gedeelde doel-VPS, alleen intern bereikbaar | Rate limits, presence/matchmaking, tijdelijke leases en notificatiepub/sub; geen enige opslag voor uitslagen |
| E-mail | Resend SMTP voor Supabase Auth; Resend API voor app-mails | OTP-bezorging plus dezelfde DartsPoint-huisstijl voor welkomst-, uitnodigings- en operationele mails |
| Botbescherming | Cloudflare Turnstile via Supabase Auth, verplicht voor publieke V1 | Verminderen van geautomatiseerde OTP-aanvragen, naast server-rate-limits; sitekey via GitHub Environment, secret in Supabase Auth |
| Worker | Apart Node.js-proces met PostgreSQL-outbox | Betrouwbare e-mailtaken, herinneringen, planning, deadlineverwerking en herhaalbare onderhoudstaken |
| Bestanden | Supabase Storage, alleen indien uploads actief worden | Avatars en toegestane uploads met bucketbeleid; geen publiek toegankelijke moderatiebijlagen |
| TLS/routering | Caddy op de host | HTTPS, webroutering, WebSocket-proxy en veilige headers |
| Packaging | Docker Compose, afzonderlijke web/realtime/worker-services | Reproduceerbare runtime op VPS; Caddy en runners blijven afzonderlijke voorzieningen |
| CI/CD | GitHub Actions + GitHub Environments | Verificatie, releases op exacte commit-SHA, secretinjectie, deploymentstatus en rollback |
| Monitoring | Gestructureerde logs, health/readiness, externe uptimecontrole; Sentry optioneel | Foutdiagnose en zicht op OTP, websockets, wachtrijen en databaseverbindingen |

Next.js ondersteunt self-hosting op Node.js. Public `NEXT_PUBLIC_*`-variabelen worden in de clientbundel ingebakken tijdens de build. Daarom bouwt de pipeline per doelomgeving vanuit dezelfde gecontroleerde commit met de juiste publieke configuratie. Runtime-geheimen worden afzonderlijk geïnjecteerd. Verander deze aanpak alleen met een expliciet geteste runtime-configuratievoorziening. [Bron: Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting).

## 3. Waarom managed Supabase

De gebruiker wil op een development-VPS ontwikkelen en via eigen runners uitrollen. Dat betekent niet dat ook e-mailauthenticatie, databaseback-ups en identity-infrastructuur zelf moeten worden beheerd. Managed Supabase beperkt dat beheer terwijl PostgreSQL een goed overdraagbare gegevensbasis blijft.

Gebruik bij voorkeur twee volledig gescheiden Supabase-projecten: staging en production. Development gebruikt de Supabase CLI lokaal of een afzonderlijk development-project met uitsluitend testgegevens. Kies een beschikbare Europese regio dicht bij de VPS. Staging mag nooit productiegebruikers, dezelfde Auth-projectkeys of productiedatabasecredentials gebruiken.

Zelf Supabase hosten is mogelijk, maar is hier geen V1-keuze: het voegt onderhoud van Auth, API-services, opslag, upgrades en herstel toe. Alleen heroverwegen bij een concrete hosting- of gegevensvereiste. Een losse PostgreSQL-database met zelfgeschreven OTP-authenticatie is eveneens onnodig werk voor deze V1.

## 4. Supabase is niet de gameserver

| Gegeven of actie | Autoriteit | Gedrag |
|---|---|---|
| Is deze bezoeker ingelogd? | Supabase Auth | Server verifieert token en accountstatus |
| Heeft deze speler een username en mag hij spelen? | PostgreSQL-profiel + autorisatieservice | Alle HTTP- en room-acties controleren dit |
| Waar staat een bewegende richtindicator? | Colyseus-klok en gedeelde deterministische logica | Browser rendert vloeiend, server bepaalt toegestane invoer |
| Heeft een dart het bord geraakt en welke score telt? | Colyseus + gedeelde spelregels | Server accepteert worp; UI past score bij de impactfase aan |
| Eindstand, Elo, ladder en statistieken | PostgreSQL-transactie | Eenmalige afhandeling per afgeronde wedstrijd |
| Typ-indicator en online aanwezigheid | Colyseus/Redis | Tijdelijk; herstel bij reconnect |
| Chatbericht en leesstatus | PostgreSQL + Colyseus-distributie | Eerst autoriseren en opslaan, daarna bezorgen; eigen message-id dedupliceren |
| Push/e-mailherinnering | Worker/outbox | Idempotent; voorkeuren en ontvangercontrole toepassen |

Gebruik niet daarnaast Supabase Realtime als tweede autoriteit voor dezelfde wedstrijd. Dat levert dubbele toestandsstromen en lastig oplosbare races op. Voor V1 loopt realtime spel- en communityverkeer via Colyseus. Een later read-only database-abonnement kan nuttig zijn, maar moet een aantoonbaar eigen doel krijgen.

## 5. Colyseus: implementatie- en deploymentgrenzen

Colyseus ondersteunt eigen authenticatie in room-authenticatiehooks. Gebruik daarin Supabase-identiteit; activeer geen tweede accountdatabase of parallelle e-mail/wachtwoordlogin van Colyseus. De ingebouwde Colyseus-beheertools mogen alleen intern of achter owner-authenticatie beschikbaar zijn. DartsPoint-platformbeheer blijft de officiële beheerinterface. [Bron: Colyseus authentication](https://docs.colyseus.io/auth).

Hanteer afzonderlijke logische roomtypen: kamer/lobby-overzicht, wedstrijd met spelers en toeschouwers, en geautoriseerde privékanalen. Een DartsPoint-kamer met maximaal 50 aanwezige spelers is niet hetzelfde als een virtueel wedstrijdbord. Een speler kan in de communitykamer aanwezig blijven terwijl zijn actieve wedstrijd in een eigen matchroom loopt.

Bewaar een duurzaam wedstrijdrecord met configuratie, deelnemers, versienummer, worpgebeurtenissen, beurtstatus en herstelbare snapshot. Laat een crash niet stilzwijgend een fictieve winnaar of Elo-mutatie veroorzaken. Bij herstel reconstrueert de server de laatst vastgelegde toestand en geeft hij spelers een duidelijke herverbindingsstatus. Beslis expliciet welke fase hervatbaar is en hoe een onafgeronde vlieganimatie wordt afgerond.

Een enkel Colyseus-proces kan een lokale presence en driver gebruiken. Zodra meerdere processen meedoen, zijn gedeelde presence/driver en correcte procesroutering nodig. RedisPresence en RedisDriver verzorgen die gedeelde informatie, maar bewaren niet automatisch alle actieve game-state duurzaam. Begin niet met willekeurige round-robin load balancing of Node cluster zonder het Colyseus-routeringsmodel. [Bronnen: presence](https://docs.colyseus.io/server/presence), [driver](https://docs.colyseus.io/server/driver), [scalability](https://docs.colyseus.io/scalability).

Bij een deployment: zet de game-runtime op draining, stop nieuwe wedstrijden, laat bestaande wedstrijden gecontroleerd aflopen of checkpoint/hervat volgens het herstelcontract, en schakel daarna pas de runtime om. De standaard shutdownhook is niet hetzelfde als een bewezen gebruikersvriendelijke zero-downtime-migratie van actieve rooms. Voeg health/readiness en een intern geauthenticeerd drain-endpoint toe. [Bron: Colyseus deployment](https://docs.colyseus.io/deployment).

## 6. Databasetoegang, schema en migraties

Gebruik één migratiegeschiedenis onder `supabase/migrations`. Databasetriggers, indexen, constraints, RLS-policies en privileges horen in dezelfde versiecontrole. Gebruik geen handmatig aangepaste productie-schema's als ongedocumenteerde waarheid.

Serverrepositories gebruiken een eigen beperkte PostgreSQL-applicatierol, niet continu de hoofdbeheerder. Scheid minimaal migratierechten, runtime-schrijfrechten en publieke leesprojecties. Als een backend direct verbinding maakt, betekent een ontvangen HTTP-cookie niet dat PostgreSQL automatisch `auth.uid()` kent: applicatieautorisatie en eventuele transactiegebonden JWT-context moeten expliciet worden geregeld. Ga niet uit van RLS-bescherming onder een rol die RLS omzeilt.

Beveilig alle Data-API-exposed tabellen met de juiste grants én RLS. Geen browsermutaties op Elo, wedstrijduitslagen, rollen, bans of toernooibeslissingen. De service/secret key blijft server-only en is geen gewone browserkey. Geef openbare marketinggegevens via beperkte, gepubliceerde projecties; expose geen e-mailadressen of moderatieredenen. [Bron: Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Voor een lang draaiende VPS-backend: gebruik een directe PostgreSQL-verbinding als IPv6 beschikbaar is; op een IPv4-only VPS de session-pooler. Transaction-pooling is niet de standaard voor deze langlevende processen. Gebruik begrensde pools per proces en TLS met servercertificaatverificatie waar ondersteund. Kopieer de verbindingsstring uit het projectdashboard en test connectiviteit vóór de eerste migratie; verzin geen poolerhost uit de regio. [Bron: databaseverbindingen](https://supabase.com/docs/guides/database/connecting-to-postgres).

De worker gebruikt een PostgreSQL-outbox met status, beschikbaar-op, aantal pogingen en foutclassificatie. Selecteer taken met een lease/lock; gebruik unieke business-sleutels zoals `welcome:user-id` of `reminder:match-id:window`. Redis helpt bij snelle coördinatie, maar een Redis-restart mag geen officiële wedstrijd of noodzakelijke mailtaak verwijderen.

## 7. E-maildiensten en domeinen

Supabase Auth maakt en controleert de OTP. De mail wordt via custom SMTP verstuurd. Gebruik Resend als SMTP-provider en voor app-mails via zijn API. Zo blijft er één e-mailprovider en één huisstijl, zonder zelf codes te verzinnen of tokens naar een eigen mailendpoint te kopiëren.

Een Resend-account, geverifieerd verzenddomein en beperkte API-key zijn nodig. SMTP: `smtp.resend.com`, gebruiker `resend`, wachtwoord de Resend API-key; kies een ondersteunde TLS-poort, bijvoorbeeld 465 of 587, en verifieer die instelling. Supabase SMTP-configuratie staat in het Auth-project, niet alleen in de VPS-omgeving. [Bron: Resend SMTP](https://resend.com/docs/send-with-smtp).

Voorstel domeinverdeling:

| Doel | Production | Staging |
|---|---|---|
| Website en PWA | `https://dartspoint.nl` | `https://staging.dartspoint.nl` |
| Colyseus HTTP + secure WebSocket | `https://realtime.dartspoint.nl` / `wss://realtime.dartspoint.nl` | `https://realtime.staging.dartspoint.nl` / `wss://realtime.staging.dartspoint.nl` |
| Auth-afzender | `DartsPoint <login@auth.dartspoint.nl>` | `DartsPoint Staging <login@auth-staging.dartspoint.nl>` |
| App-notificaties | `DartsPoint <meldingen@notify.dartspoint.nl>` | Apart staging-subdomein, testontvangers |
| Reacties/support | Nog vast te leggen beheerde mailbox | Testmailbox |

Verifieer voor gekozen afzenders de providerrecords voor SPF/DKIM en richt DMARC in. Gebruik geen trackingpixels of kliktracking in inlogmails. Afzonderlijke subdomeinen beperken vermenging van reputatie tussen login en promotionele berichten. Staging gebruikt een ontvangersallowlist voor niet-Auth-app-mails en duidelijk gemarkeerde onderwerpen. Resend beveelt geverifieerde subdomeinen aan voor scheiding van mailsoorten. [Bron: Resend verified domains](https://resend.com/docs/dashboard/domains/introduction).

`dartspoint.app` wordt later toegevoegd en verwijst aanvankelijk met een 301-redirect naar `.nl`. Een afzonderlijke PWA-origin op `.app` is een latere expliciete keuze, met eigen sessiegedrag, toegestane Auth-URL's, CORS/originbeleid en deeplinktests. Cookies worden niet tussen `.nl` en `.app` gedeeld. Publiceer geen dubbele indexeerbare marketingkopie. Gebruik geen brede wildcard voor Auth-redirects; registreer alleen de bedoelde hosts en paden.

## 8. Aan te maken accounts en voorzieningen

| Voorziening | Nodig vóór | In te vullen door eigenaar/operator |
|---|---|---|
| GitHub-repository | Eerste gecontroleerde push | Definitieve organisatie/reponaam; geen bestaande repo raden |
| Development-VPS | Productiebouw | Toegang, vrije poorten/resources, aparte werkdirectory |
| Staging-VPS + runner | Staging-release | Runnerlabels, beperkt deployaccount, GitHub Environment `staging` |
| Production-VPS + runner | Publieke release | Eigen runner/account en Environment `production` |
| Supabase-project staging | Auth-integratietests | EU-regio, project-URL, publishable key, DB-runtime- en migratiecredentials |
| Supabase-project production | Productieacceptatie | Eigen project, backups/herstelinstellingen, eigen keys |
| Resend | Werkelijke OTP-bezorging | Gevalideerde domeinen, gescheiden keys, SMTP-instellingen |
| Turnstile-configuratie | Publieke OTP-flow, verplichte V1-voorziening | Toegestane domeinen, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in elke GitHub Environment, geheime providerkey uitsluitend in het bijbehorende Supabase Auth-project; geen testkeys in production |
| DNS-toegang | TLS + mailverificatie | A/AAAA, afzenderrecords en later `.app` |
| Owner-identiteit | Eenmalige bootstrap | Door Nick opgegeven e-mailadres; na OTP de bijbehorende Auth-UUID |
| Monitoring en back-updoel | Publieke release | Alertontvanger, bewaartermijnen, hersteltest en budgetwaarschuwingen |

GitHub Environments beheren omgevinggebonden secrets en toegestane deploymentbranches. Die voorzieningen vervangen geen runnerisolatie. Laat de productie-runner geen willekeurige pull-request-code uitvoeren. Verifieer welke protection-functies op het gekozen GitHub-abonnement/repositorytype beschikbaar zijn. [Bronnen: environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [secure use](https://docs.github.com/en/actions/reference/security/secure-use).

Caddy ondersteunt WebSocket-proxying. Configureer origins en trusted proxies bewust, bind interne services uitsluitend aan loopback/private netwerken en test lange verbindingen plus Caddy-herladen. Beloof geen ononderbroken socket door een proxyreload zonder die configuratie en test. [Bron: Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## 9. Wat is nog niet nodig

Geen Colyseus Cloud-abonnement zolang zelfhosting bewust gekozen blijft. Geen Kubernetes, dedicated Kubernetes-ingress, afzonderlijk realtime SaaS-abonnement, tweede authprovider of betaalde PWA-dienst voor V1. Een native wrapper, appstores, pushgateway en betaalprovider zijn afzonderlijke vervolgkeuzes als die functies daadwerkelijk worden uitgebracht.

Een gratis dienstniveau is geen productiegarantie. De kosten worden bepaald door VPS-capaciteit, Supabase-projecten/database/MAU/opslag/egress/backups, e-mailvolume en eventuele monitoring. Controleer actuele abonnementen en limieten vóór bestelling. In dit pakket staan daarom geen snel verouderende of onbevestigde maandprijzen.

## 10. Versies en releasevolgorde

1. Neem de meegeleverde bron, assets, fonts en lockfile eerst exact over en leg de referentie-SHA vast.
2. Vervang Sites/Vinext/Cloudflare-specifieke runtime-aanpassingen door native Next.js-hosting; wijzig daarbij geen visueel ontwerp.
3. Pin een actuele ondersteunde Node.js LTS-versie en onderling compatibele Colyseus server/client/schema-versies. Gebruik geen `latest`-image in een release.
4. Leg Supabase SDK- en SSR-versies vast. De SSR-helperdocumentatie vermeldt nog API-instabiliteit; dependency-upgrades krijgen eigen sessie-/cookietests.
5. Bouw auth, database en realtime achter adapters, voer functionele en visuele pariteitstests uit en lever pas daarna main op.
6. Main valideert de bron. Een geslaagde merge naar staging start de staging-release; een geslaagde merge naar production de productie-release. Zie het deploymentdocument voor uitvoerbare scaffolds en checks.

Deze stackbeslissing is een ontwerpkeuze op basis van het bestaande DartsPoint-prototype, de gewenste VPS-werkwijze en de hierboven gelinkte primaire documentatie. Het is geen claim dat Supabase of Colyseus op zichzelf anti-cheat, wedstrijdherstel of correcte toernooilogica leveren; die DartsPoint-logica moet Codex expliciet bouwen en testen.
