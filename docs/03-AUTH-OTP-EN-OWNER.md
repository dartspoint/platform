# DartsPoint — e-mail-OTP, eerste gebruikersnaam en owner

Besluitdatum en broncontrole: 12 oktober 2026. Dit is het productiecontract. De Sites-flow toont hetzelfde gedrag als prototype; echte mailbezorging, identiteit en rechten ontstaan pas na onderstaande implementatie en integratietests met de doelomgeving.

## 1. Gebruikersflow

Er is één passwordless accountflow voor nieuwe en bestaande spelers. De publieke CTA mag “Registreren” heten, maar beide ingangen komen op dezelfde e-mailstap. Geen wachtwoordveld, geen wachtwoordreset en geen verzonnen demo-e-mailadres in de productie-login.

1. Speler voert zijn e-mailadres in en kiest **Stuur mijn code**.
2. Het scherm toont het adres, een knop **E-mailadres wijzigen**, het codeveld en een duidelijke herzendtimer. De speler blijft op de website; er hoeft geen magische inloglink te worden geopend.
3. De e-mail bevat een eenmalige code. Invoer ondersteunt plakken, mobiel numeriek toetsenbord en `autocomplete="one-time-code"`.
4. De code wordt bij Supabase geverifieerd. Alleen een geldige sessie brengt de speler verder.
5. Is er nog geen afgerond profiel, dan kiest hij verplicht zijn gebruikersnaam. Dit gebeurt **na** e-mailverificatie en **vóór** lobby, roomjoins, uitnodigingen, chat of gameplay.
6. Een bestaande speler met afgerond profiel gaat naar de veilige gewenste bestemming, standaard de lobby. Een nieuw profiel begint op Elo 1500, voorlopige status, witte ratingkleur en de gewone spelersrol.

“Nieuw” wordt vastgesteld aan de hand van de serverstatus van het profiel, niet met een browserflag, de aanwezigheid van localStorage of het feit dat deze browser nog nooit is gebruikt.

Normaliseer het ingevoerde e-mailadres consequent met trim en lowercase, zoals in de prototypeflow, en stuur hetzelfde adres bij aanvraag en verificatie. Verwijder geen punten of plus-tags en voeg geen providerafhankelijke aliasregels toe. Het publieke profiel bevat geen e-mailadres; de uiteindelijke accountidentiteit blijft de geverifieerde Auth-UUID.

## 2. Auth-provider en codecontract

Gebruik Supabase Auth. `signInWithOtp` verzorgt in deze productkeuze zowel terugkerend inloggen als nieuwe aanmelding; zet `shouldCreateUser: true`. Gebruik `verifyOtp` met `type: 'email'` voor de ingevoerde e-mailcode. De aanvraag geeft nog geen ingelogde sessie. Pas na succesvolle verificatie mag een sessie worden gebruikt. [Bron: Supabase passwordless e-mail](https://supabase.com/docs/guides/auth/auth-email-passwordless).

Conceptueel SDK-contract, uit te werken met de gekozen server-/browseradapters:

```ts
await supabase.auth.signInWithOtp({
  email,
  options: { shouldCreateUser: true, captchaToken },
});

await supabase.auth.verifyOtp({
  email,
  token: code,
  type: 'email',
});
```

Voor de publieke V1 is **Cloudflare Turnstile verplicht** en wordt de geldige `captchaToken` bij iedere OTP-aanvraag meegestuurd. De frontend gebruikt de publieke `NEXT_PUBLIC_TURNSTILE_SITE_KEY` uit de juiste GitHub Environment; de geheime Turnstile-key wordt uitsluitend ingesteld in de betreffende Supabase Auth-providerconfiguratie. Development en geïsoleerde stagingtests mogen passende testkeys gebruiken; production weigert testkeys. Geen providergeheim in clientcode. Het profiel of een gewenste ownerrol wordt nooit meegestuurd als vrij invulbare authmetadata.

DartsPoint kiest voor V1 een **zescijferige code, 10 minuten geldigheid en 60 seconden herzendpauze**. Dit zijn expliciete productinstellingen. De officiële CLI-configuratie ondersteunt een OTP-lengte van 6–10 cijfers. Configureer de lengte/duur in het gekozen hosted Auth-project en houd UI, validatie, mailtekst en tests gelijk. Controleer de daadwerkelijk ontvangen code; leid de lengte niet af uit een voorbeeldtemplate en kap een langere code nooit af. [Bron: Supabase CLI-configuratie](https://supabase.com/docs/guides/local-development/cli/config).

Lokale ontwikkelconfiguratie onder `[auth.email]`:

```toml
otp_length = 6
otp_expiry = 600
max_frequency = "1m"
```

Deze lokale instellingen worden niet automatisch toegepast op een managed Supabase-project. Configureer en verifieer de equivalente hosted instellingen afzonderlijk bij staging en production.

Supabase deelt instellingen tussen meerdere email-linkflows. Verifieer daarom ook uitnodigingen en eventuele e-mailadreswijziging nadat de OTP-duur is ingesteld. De loginflow zelf gebruikt codes, geen klikbare authenticatietoken-URL.

## 3. E-mails correct configureren

`signInWithOtp` verstuurt standaard niet noodzakelijk de gewenste codeweergave: de inhoud van de Auth-template bepaalt wat de speler ontvangt. Neem **`{{ .Token }}`** op in de OTP-template. Houd de code uit onderwerp, previewtekst, URL, analytics, application logs en screenshots. Gebruik de meegeleverde DartsPoint-mails als visuele bron.

Configureer en test de relevante Supabase-templates voor een **nieuw adres én een bestaand adres**, met name Magic Link/OTP en Confirm signup indien die voor de gekozen instellingen wordt gebruikt. Zet `{{ .ConfirmationURL }}` niet als alternatieve hoofdingang in deze loginmail. Het templatevoorbeeld met `.Token` is door Supabase ondersteund. [Bron: Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

Configureer custom SMTP in Supabase Auth. De standaard ingebouwde verzenddienst is bedoeld voor beperkt testen en is ongeschikt als publiek loginverzendkanaal. Stem project-mailquota, providerquota, resendpauze en piekverkeer op elkaar af. [Bron: Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

Gebruik bijvoorbeeld Resend via `smtp.resend.com`, username `resend`, API-key als SMTP-wachtwoord en een geverifieerde DartsPoint-afzender. Kies TLS en controleer aflevering; voeg een afzonderlijke API-key toe voor app-notificaties. De authmail wordt door Supabase verstuurd, dus een `RESEND_API_KEY` in alleen de VPS-omgeving configureert Supabase SMTP nog niet. [Bron: Resend SMTP](https://resend.com/docs/send-with-smtp).

Alle mails gebruiken dezelfde huisstijl: donker groen, warm wit, rood accent, herkenbaar logo, goed leesbare tekst en een eenvoudige footer. De OTP-mail houdt één doel en bevat geen toernooipromotie. App-mails mogen dezelfde basislayout uitbreiden met een knop of een klein informatieblok. Neem een plain-textvariant op. Voor Supabase-templates gebruikt de build Go-templatevariabelen; voor gewone app-mails getypeerde velden en HTML-escaping. Zet nooit ongeëscapete gebruikersnamen, chatinhoud of moderatietekst in HTML.

## 4. UX-states en fouten

| Situatie | Vereist gedrag |
|---|---|
| Leeg/ongeldig e-mailadres | Inline fout; focus blijft logisch; geen netwerkaanvraag |
| Codeaanvraag loopt | Dubbele submit blokkeren; geen dubbele mails door snelle taps |
| Aanvraag geaccepteerd | Codeveld tonen; adres en herzendtimer zichtbaar |
| Verzendstoring/providerlimiet | Heldere melding en servergestuurde wachttijd; geen succesclaim |
| Verkeerde of verlopen code | “Deze code is ongeldig of verlopen”; veld blijft herstelbaar |
| Opnieuw sturen | Pas na toegestane wachttijd; serverlimit blijft leidend bij refresh |
| Adres wijzigen | Vorige lokale challengecontext wissen; terug naar e-mailstap |
| Code hergebruiken | Afwijzen; geen tweede sessie door dezelfde gebruikte code |
| Netwerk weg tijdens verify | Niet alvast inloggen; hercontrole of nieuwe poging aanbieden |
| Opnieuw openen na OTP, vóór username | Geauthenticeerd blijven; verplichte profielstap opnieuw tonen |
| Gebruikersnaam bezet | In hetzelfde scherm tonen en alternatieven toestaan; niets overschrijven |
| Geblokkeerd account | Geen toegang tot kamer/spel; neutrale accountmelding en supportpad |
| Reeds ingelogd | Profielstatus controleren en veilig doorsturen |

Gebruik voor het codeveld bij voorkeur één echte input met visuele vakverdeling. Dit werkt beter met plakken, schermlezers en automatisch invullen dan zes losse verborgen inputs. Toon statusmeldingen via een rustige live-region; laat de herzendtimer niet iedere seconde de schermlezer onderbreken. Respecteer reduced motion en behoud voldoende contrast en aanraakruimte.

Een tab of apparaat met een oude aanvraag mag niet bepalen welke providercode nog geldig is. Laat Supabase dat controleren. Het verwachte gedrag bij twee achtereenvolgende aanvragen wordt in integratietests vastgelegd en in de foutmelding opgevangen.

## 5. Misbruikbeperking

Voeg een servergestuurde limiet toe per e-mailadres en vertrouwd vastgestelde client-IP, naast Supabase-limieten. Het UI-aftellen is uitsluitend presentatie. Een limiet op alleen de DartsPoint-API is te omzeilen door het publieke Supabase Auth-endpoint rechtstreeks te benaderen. Configureer daarom ook de providerlimieten en CAPTCHA bij Supabase en test directe aanvragen tegen dat endpoint. Beperk verificatiepogingen en pas oplopende wachttijd toe zonder een permanent door derden te veroorzaken accountslot. Stem waarden af op werkelijk spelersverkeer en log alleen gebeurtenistype, grove foutklasse en gepseudonimiseerde sleutels.

Activeer Cloudflare Turnstile in beide hosted Supabase Auth-projecten en configureer uitsluitend de bedoelde origins. Laat de challenge zo min mogelijk normale spelers hinderen, maar keur een ontbrekende, verlopen of hergebruikte challenge niet stilzwijgend goed. Behoud e-mailverificatie ook bij bezorgproblemen; schakel niet over op onbevestigde accounts. Gebruik dezelfde neutrale reactie voor nieuwe en bestaande adressen om accountenumeratie te beperken. Oppervlakkige clientchecks zijn nooit voldoende. [Bronnen: Supabase rate limits](https://supabase.com/docs/guides/auth/rate-limits), [bot detection](https://supabase.com/docs/guides/auth/auth-captcha).

Authverkeer en ingelogde pagina's krijgen `Cache-Control: private, no-store`. Sla OTP's en volledige authheaders niet op in analytics, Sentry-events of requestlogs. Een debug-login of vaste prototypecode mag uitsluitend in een expliciet geïsoleerde testadapter bestaan en nooit in staging/production geactiveerd kunnen worden.

## 6. Username en profiel

Het definitieve beleid is exact hetzelfde als de afgewerkte prototypeflow: trim voor- en achterliggende witruimte, valideer vervolgens exact **`[A-Za-z0-9_-]{3,20}`** en bereken `username_key` door de geldige ASCII-naam naar lowercase om te zetten. Gebruik dezelfde centrale functie in UI en backend en dezelfde gereserveerde namenlijst als het prototype. Voeg geen Unicode-, NFKC- of locale-afhankelijke alternatieve normalisatie toe. De database-uniquenessconstraint blijft leidend, ook als een eerdere beschikbaarheidscheck positief was.

Databasebasis:

| Veld | Betekenis |
|---|---|
| `profiles.id` | De geverifieerde Supabase `auth.users.id`; geen door client te kiezen eigenaar-ID |
| `profiles.username` | Zichtbare ASCII-naam, pas gevuld na geldige profielafronding |
| `profiles.username_key` | Unieke lowercase sleutel, databaseconstraint verplicht |
| `profiles.onboarded_at` | Servermoment van succesvolle afronding |
| `profiles.status` | Actieve of beperkte accountstatus volgens het databasedocument |
| `profiles.session_version` | Serverversie voor het intrekken van eerder toegelaten sessies/bevoegdheden |
| `profiles.created_at` / `profiles.updated_at` | Servergegenereerd |
| `player_ratings.rating` | Afzonderlijke ratingrij, start 1500, alleen gemuteerd door wedstrijddienst |
| `player_ratings.ranked_played` | Start 0; kleur/voorlopige status niet aan gekozen username gekoppeld |

De canonieke veldnamen en tabellen staan in `05-DATABASE-API-EN-MIGRATIE.md`. Bewaar Elo niet ook in `profiles`; er is één ratingbron en één resultaatledger.

Rollen staan apart van vrij bewerkbare profielgegevens. Een client mag dus niet tegelijk een username en `role: owner` opslaan. E-mailadres hoeft niet publiek in `profiles` te worden gedupliceerd. Publieke playercards tonen geen privé-identiteit.

Implementeer `POST /api/onboarding/username` met een gedeelde `completeOnboarding(username)`-dienst en database-transactie. Controleer token, bevestigd e-mailadres en status, valideer naam en gereserveerde namen, reserveer de unieke naam atomair, zet `profiles.onboarded_at`, initialiseer zo nodig exact één `player_ratings`-rij en plaats een eenmalige welkomstmail in de outbox. Twee gelijktijdige claims voor “Nick” mogen nooit beide slagen. Herhaling van dezelfde al afgeronde aanvraag is idempotent; een andere naam wijzigen hoort bij een afzonderlijk geautoriseerd wijzigproces.

De gereserveerde lowercase namen uit `lib/darts-demo-auth.ts` zijn `admin`, `administrator`, `moderator`, `mod`, `owner`, `eigenaar`, `support`, `system`, `dartspoint`, `beheer`, `beheerder`, `helpdesk`, `security` en `dartspointteam`. Neem deze versiebeheerbare lijst over in de gedeelde productievalidatie. Geef eigendom niet op basis van de naam `Nick`, de naamkleur of een clientflag.

## 7. Sessies in Next.js

Gebruik `@supabase/supabase-js` en `@supabase/ssr` met browser- en serverclient en de bij de gepinde Next.js-versie passende cookie-refreshlaag. Bij Next.js 16 heet de middlewareconventie `proxy.ts`; oudere versies gebruiken `middleware.ts`. Gebruik de complete actuele cookie-/headerafhandeling van de officiële integratie en pin de helperversie. [Bron: Supabase SSR-client](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

Serverautorisatie gebruikt geverifieerde claims; `getSession()` alleen leest sessiemateriaal en bewijst niet zelfstandig identiteit. Vraag waar een actuele account- of sessietoestand noodzakelijk is de gebruiker op bij Auth en controleer DartsPoint-accountstatus/rollen in de database. Gewone logout beëindigt de huidige sessie expliciet; “Overal uitloggen” is een aparte actie. Test meerdere tabs en apparaten. [Bron: Supabase advanced SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

De SDK-browserclient heeft toegang tot sessiemateriaal nodig. Beloof daarom niet dat alle SDK-cookies HttpOnly zijn; wie voor uitsluitend HttpOnly servercookies kiest, moet een volledige BFF-sessielaag bouwen en de frontendadapter daarop aanpassen. Voor deze V1 is de officiële Supabase SSR-integratie de keuze, met HTTPS, correcte SameSite-instellingen, CSP, XSS-preventie en geen caching van sessieresponses.

Beveilig iedere servermutatie afzonderlijk. Een routeguard of verborgen beheermenu is alleen navigatie. Controleer Origin/CSRF voor cookie-gebaseerde mutaties en valideer alle payloads. `next`-redirects blijven een allowlist van interne routes; externe schema's, protocolrelative URL's en gecodeerde omwegen worden geweigerd. Stuur een nieuw account eerst naar onboarding, en pas daarna naar de veilige bedoelde route.

## 8. Colyseus-identiteit en reconnect

De browser verkrijgt zijn actuele Supabase access-JWT via de sessie-adapter en geeft die direct mee als `client.auth.token` aan de Colyseus-SDK. De V1 gebruikt geen eigen join-ticket, extra ticketsecret of tweede Colyseus-accountdatabase. De realtime-server verifieert de token in een eigen `static onAuth(token, options, context)`; roomtoewijzing en capaciteit worden opnieuw in `onJoin` gecontroleerd. Hij neemt identiteit nooit aan uit `playerName`, `role`, `userId` of een willekeurige joinoptie van de browser. Zie `04-COLYSEUS-SPEL-EN-DATA.md` voor het volledige contract.

Bij asymmetrische Supabase signing keys verifieert de server via de project-JWKS met een bewezen JWT-library zoals `jose`. Controleer minimaal signature, toegestane algoritmen, `iss`, `aud`, `exp`, subject en verwachte gebruikersrol; accepteer geen service-key als speler. De JWKS-URL is `SUPABASE_URL/auth/v1/.well-known/jwks.json`. Een HS256-project volgt Auth-serververificatie of wordt bewust naar asymmetrische keys gemigreerd; verspreid geen project signing secret naar clients. [Bron: Supabase JWT](https://supabase.com/docs/guides/auth/jwts).

Voer daarna de DartsPoint-checks uit: afgerond profiel, actieve accountstatus, roomtoegang, eventuele toernooi-inschrijving, matchdeelnemer of spectatorstatus, capaciteitslimiet, mute/ban en rechten. Herhaal relevante autorisatie bij gevoelige events; een joincheck alleen beschermt niet tegen een ban die tijdens de sessie wordt opgelegd.

Een correct ondertekend, nog niet verlopen JWT kan na een wijziging van de sessie of rol nog tijdelijk geldig zijn. Daarom moeten rolwijzigingen en bans actieve Colyseus-clients direct bijwerken/uitzetten via actuele serverdata en `profiles.session_version`. Vernieuw het access-token vóór nieuwe matchmaking. Langlopende sockets gebruiken het expliciete `auth.refresh`-commando: verifieer de nieuwe JWT, eis dezelfde `sub`, hercontroleer accountstatus en actualiseer de vervaldatum zonder de partij te resetten. Bij verlopen auth zijn nieuwe spel-/chatwrites geblokkeerd tot succesvolle refresh. De Supabase refresh-token blijft bij de authclient en gaat nooit naar Colyseus. Alleen sessie-ID of reconnecttoken kennen is geen recht om een andere speler over te nemen. Na reconnect wordt het actuele auth- en wedstrijdlidmaatschap opnieuw getoetst.

De authserver hoeft niet per animatieframe te worden geraadpleegd. Cache gecontroleerde identiteit kort waar passend, maar maak intrekking en invalidatie een expliciet onderdeel van het protocol. Test logout, ban, verlopen token en twee apparaten terwijl er een actieve wedstrijd loopt.

## 9. Eerste owner veilig aanmaken

**Nooit: de eerste aanmelder wordt owner. Nooit: iedere login met naam Nick wordt owner.**

1. Nick geeft het bedoelde e-mailadres via de veilige environment-/operatorconfiguratie op. Het pakket bevat geen geraden e-mailadres.
2. Nick voltooit de echte OTP-login en kiest zijn gebruikersnaam. Er bestaat nu een geverifieerde Supabase Auth-UUID met een normaal profiel.
3. De operator gebruikt een eenmalig CLI-commando zoals `owner:bootstrap --user-id <uuid>`. De exacte commandonaam wordt door Codex geïmplementeerd en gedocumenteerd.
4. De CLI vraagt de Auth-gebruiker server-side op, controleert bevestigd e-mailadres, vergelijkt met de geconfigureerde `BOOTSTRAP_OWNER_EMAIL` en controleert het afgeronde profiel.
5. Onder een database-transactielock wordt de eerste ownerrol aangemaakt en een auditrecord vastgelegd. Herhaling voor dezelfde UUID is veilig; herhaling voor een ander account of een al bezette bootstrap weigert. Staging en production hebben ieder een eigen bootstrapstatus.
6. Verwijder het bootstrapgeheim/configuratie uit de runtime en bewaar alleen het auditbewijs. Er is geen publiek bootstrapendpoint en geen voor eeuwig actieve “claim owner”-route.

Het feit dat een account al een bevestigd e-mailadres heeft, is niet voldoende om het willekeurig owner te maken: alleen de expliciet gekozen identiteit mag worden gebruikt. Een GitHub Environment met bootstraprechten is tijdelijk en niet toegankelijk vanuit pull-requestjobs.

Geef owners de afgesproken blauwe naamkleur, admins oranje, VIPs goud met kroon en normale spelers wit. Kleur is een representatie van een geautoriseerde rol/entitlement. VIP geeft geen moderatierechten. Een eventuele moderator krijgt expliciete beperkte capabilities; introduceer daarvoor niet ongemerkt een nieuwe kleur als die niet in het UI-canon staat.

Voorkom verwijderen/degraderen van de laatste actieve owner. Rollen wijzigen, bans en beheeracties worden geaudit met actor, doel, reden, tijd en wijziging. Bescherm accountwijzigingen en kritieke owneracties met recente herauthenticatie. Extra TOTP-MFA voor eigenaren/beheerders is een aanbevolen hardeningstap; het vervangt de afgesproken e-mail-OTP-login voor spelers niet.

## 10. Acceptatie vóór staging en productie

| Test | Moet bewezen zijn |
|---|---|
| Nieuw e-mailadres | Werkelijke code ontvangen → verifiëren → username verplicht → lobby |
| Bestaand e-mailadres | Werkelijke code ontvangen → direct naar bestaande speler en veilige bestemming |
| Verkeerde/verlopen/hergebruikte code | Geen sessie/toegang, begrijpelijke herstelroute |
| Opnieuw sturen | Provider- en applimiet werken ook na paginarefresh, snelle dubbele tap en direct benaderen van Supabase Auth |
| Code plakken/autofill | Werkt op Android Chrome en iPhone Safari/PWA |
| Dubbele username | Gelijktijdige claims leveren precies één winnaar op |
| Onvoltooid profiel | Geen omweg via `/spelen`, API, WebSocket, uitnodiging of privéchat |
| JWT-validatie | Vervalste, verlopen, andere-project- en verkeerde-audience-token afgewezen |
| Sessierestart | Refresh, terugknop, tweede tab en hervatten op mobiel behouden correcte gebruiker |
| Gescheiden accounts | Twee browsers/tabs krijgen nooit elkaars sessie door caching |
| Ban/rolwijziging | Direct effect in serveracties en actieve Colyseus-verbindingen |
| Ownerbootstrap | Alleen bedoelde geverifieerde UUID; herhaling veilig; tweede identiteit geweigerd |
| SMTP | Gmail/Outlook/Apple Mail leesbaar, code selecteerbaar, SPF/DKIM/DMARC gecontroleerd |
| Mailstoring | Gebruiker kan herstellen; geen codelek in logs; monitoring meldt fout |
| Stagingisolatie | Geen productieaccounts, secrets, mails of databasewijzigingen |
| Bron-/UI-pariteit | De gepolijste Sites-schermen behouden layout, CSS, assets en interacties |

Deze tests worden uitgevoerd met echte stagingcredentials en gecontroleerde testmailadressen. Een groene mocktest bewijst geen werkelijke mailbezorging; een geslaagde SMTP-response bewijst op zichzelf geen plaatsing in de inbox. Leg het testresultaat en eventuele resterende beperkingen vast voordat de prototype-aanduiding verdwijnt.
