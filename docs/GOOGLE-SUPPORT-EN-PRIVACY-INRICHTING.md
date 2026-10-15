# Google, support en privacy — eenmalige inrichting

De nieuwe inrichting gaat eerst naar staging. De aangeleverde juridische teksten blijven interne werkversies totdat de eigenaar de werking heeft beoordeeld en de externe instellingen aantoonbaar zijn gecontroleerd. Productie blijft op de bestaande release tot die beoordeling.

## Onderneming

DG Webservices, Markenseplein 1, 2583 KR Den Haag, KvK 88135713, info@dgwebservices.nl. Support: support@dartspoint.nl. Er wordt geen btw-nummer toegevoegd aan de drie documenten.

## Google

Maak in [Google Auth Platform](https://console.cloud.google.com/auth/clients) twee OAuth-clients van het type **Web application**. Gebruik uitsluitend `openid`, `email` en `profile`; geen Gmail-, Drive- of contactrechten. De officiële Google-flow wordt gestart na een bewuste klik, zonder One Tap.

| Omgeving | Authorized JavaScript origin | Authorized redirect URI in Google |
| --- | --- | --- |
| staging | `https://staging.dartspoint.nl` | `https://kwxbjrokaxrbqjonyxid.supabase.co/auth/v1/callback` |
| production | `https://dartspoint.nl` | `https://dfuzryafyyfyaaxluhkr.supabase.co/auth/v1/callback` |

Sla per Supabaseproject onder Authentication → Sign In / Providers → Google de bijbehorende **Client ID en Client Secret** op. Deze geheimen horen niet in de browser, chat of GitHub-variables.

Voeg onder Authentication → URL Configuration de eigen terugkeerroute toe:

- staging: `https://staging.dartspoint.nl/api/auth/google/callback?flow=*`
- production: `https://dartspoint.nl/api/auth/google/callback?flow=*`

De wildcard geldt alleen voor de willekeurige flowwaarde op die exacte host en route. Gebruik geen wildcard voor de host of alle paden. De server controleert de flowcookie daarnaast zelf en accepteert alleen interne terugkeerbestemmingen. Behoud de bestaande Site URL en alle andere noodzakelijke, expliciete authroutes.

Stel de Google branding, contactadressen, geverifieerd hoofddomein en openbare voorwaarden-/privacy-URL in. Gebruik gedurende de stagingtest expliciete testgebruikers. Publiceer de Google-app pas samen met de beoordeelde productie-inrichting. Zet daarna de GitHub Environment-variable `GOOGLE_AUTH_ENABLED=true` voor de omgeving waarvan de provider daadwerkelijk is geconfigureerd; anders `false`.

Controleer handmatig met hetzelfde bevestigde e-mailadres via OTP en Google dat hetzelfde profiel, de spelersnaam, rechten en sancties behouden blijven. Verschillende e-mailadressen worden niet vanzelf samengevoegd.

Bron: [Supabase Google Auth](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Hostnet en Resend

Hostnet blijft de bestaande mailbox `support@dartspoint.nl` ontvangen. Vervang de MX-records van `dartspoint.nl` niet.

1. Voeg bij Resend een apart ontvangstdomein `ontvangen.dartspoint.nl` toe en activeer ontvangst.
2. Voeg uitsluitend de door Resend getoonde DNS-records voor dat subdomein toe. Neem de exacte waarden uit het dashboard over; regio-/providerwaarden worden niet gegokt.
3. Test tijdens de stagingcontrole rechtstreeks naar `support@ontvangen.dartspoint.nl`. Activeer de Hostnet-doorsturing van het echte adres `support@dartspoint.nl` pas na de productiebeoordeling, wanneer de productie-webhook klaarstaat. Zo komen echte klantvragen niet in staging terecht. Stel in Mijn Hostnet bij Diensten → domein → E-mail → de drie puntjes naast de supportmailbox → Doorsturen het doeladres in. Bewaar eventuele mailboxkopieën niet langer dan 30 dagen na verwerking in een ticket; controleer de mailboxretentie daadwerkelijk.
4. Maak bij Resend een webhook voor ontvangen e-mail en afleverproblemen. Gebruik voor de stagingtest `https://staging.dartspoint.nl/api/support/inbound`. Voor productie later `https://dartspoint.nl/api/support/inbound`. Voorkom dat dezelfde echte aanvraag in beide omgevingen wordt verwerkt.
5. Selecteer de events `email.received`, `email.bounced`, `email.failed`, `email.delivery_delayed` en `email.complained`. Sla het webhook signing secret uitsluitend op als GitHub Environment-secret `RESEND_WEBHOOK_SECRET`.
6. Zet open- en kliktracking uit op het Resend-verzenddomein. Vul de bijbehorende Resend-domain-ID in als `SUPPORT_RESEND_DOMAIN_ID`; de supportmailer controleert die instellingen voordat hij verzendt.

De bestaande `RESEND_API_KEY` moet ook ontvangen berichten en domeininstellingen kunnen lezen. Een sleutel met alleen verzendrechten volstaat niet. De staging-webhook wordt pas bereikbaar na de beheerde hostupdate; die stelt uitsluitend de ondertekende POST-route open.

Binnenkomende mail wordt eerst duurzaam opgeslagen. Alleen originele provider-gecontroleerde afzenderauthenticatie, passende oorspronkelijke berichtreferenties en de bevestigde mailbox kunnen een bestaand dossier koppelen. Een onderwerpnummer, CC-adres of geldige webhook alleen geeft geen toegang. Onzekere berichten komen in afgeschermde triage.

Bronnen: [Resend ontvangstdomeinen](https://resend.com/docs/dashboard/receiving/custom-domains), [webhookverificatie](https://resend.com/docs/webhooks/verify-webhooks-requests), [Hostnet-doorsturing](https://helpdesk.hostnet.nl/hc/nl-nl/articles/360015137638-E-mailforward-instellen).

## Nieuwe GitHub Environment-instellingen

Voeg per gebruikte omgeving toe. De bestaande database-, mail- en backupcredentials blijven in gebruik.

| Type | Naam | Waarde / herkomst |
| --- | --- | --- |
| Secret | `TURNSTILE_SECRET_KEY` | Geheime sleutel van de widget bij de sitekey van deze omgeving; servervalidatie van het openbare supportformulier. De bestaande geheime sleutel blijft ook in Supabase Auth staan voor OTP. |
| Secret | `RESEND_WEBHOOK_SECRET` | Signing secret van de betreffende Resend-webhook. |
| Variable | `SUPPORT_INBOUND_ADDRESS` | `support@ontvangen.dartspoint.nl` na DNS-verificatie en Hostnet-forwarding. |
| Variable | `SUPPORT_RESEND_DOMAIN_ID` | ID van het bestaande, geverifieerde Resend-verzenddomein met tracking uit. |
| Variable | `GOOGLE_AUTH_ENABLED` | `false` totdat de Google-client en Supabase-provider zijn ingesteld; daarna `true`. |

Google Client Secret blijft uitsluitend in Supabase. Publiceer geen geheimen als `NEXT_PUBLIC_…`.

## Privacy, malwarecontrole en herstel

De hostupdate installeert een afzonderlijke supportwerkservice en een afgeschermde ClamAV-scanner. Bestanden blijven in quarantaine zolang inhoudscontrole of malwarecontrole niet is geslaagd; een niet-beschikbare scanner geeft geen schone uitslag. Er worden geen bestanden naar een externe scanleverancier gestuurd.

De erasure-ledger wordt versleuteld met Restic in de bestaande private Hetzner S3-repository opgeslagen en teruggelezen vóór definitieve verwijdering. Databaseback-ups worden op werkelijke kalenderleeftijd opgeschoond. Het minimale herstelregister wordt apart bewaard en heeft een maximale leeftijd van 37 dagen. Een herstel met oude gegevens mag pas worden vrijgegeven nadat de ledger en verlopen bewaartermijnen zijn toegepast. Een herstelpunt zonder benodigde privacyfuncties wordt geblokkeerd voor afzonderlijke offline migratiebeoordeling.

Controleer daarnaast de **werkelijke Supabase-back-up- en PITR-bewaarinstellingen**, Hostnet-kopieën, logretentie en verwerkersafspraken. De applicatie kan deze externe instellingen niet afleiden uit een databaseverbinding. Registreer bewijs in het juridische beheerscherm voordat de bijbehorende privacyverklaring wordt gepubliceerd.
