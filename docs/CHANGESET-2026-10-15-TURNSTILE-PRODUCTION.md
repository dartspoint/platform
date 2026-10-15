# Turnstile bij het inloggen op production

De bestaande widget blijft behouden. De publieke sitekey staat in de GitHub
Environment `production` als `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en wordt tijdens de
build in de browsercode opgenomen. Er is geen nieuwe widget aangemaakt.

## Verwerking

De login- en registratiepagina gebruiken dezelfde inlogcodeaanvraag. De knop
wacht op een Turnstile-token. De bestaande serverroute stuurt dat token door in
`signInWithOtp({ options: { captchaToken } })`. Supabase Auth voert de
serververificatie uit; een tweede Siteverify-aanroep in de applicatie zou het
eenmalige token verbruiken voordat Supabase het kan controleren.

De geheime sleutel van de widget hoort daarom in het productionproject van
Supabase, onder Authentication → Bot and Abuse Protection: CAPTCHA inschakelen,
provider Turnstile en de bijbehorende secret key opslaan. Deze sleutel hoort niet
in `NEXT_PUBLIC_*`, broncode, chat of een extra GitHub-variabele. In Cloudflare
moet de widget de productiehost `dartspoint.nl` toestaan; `www` verwijst naar die
host. De widget gebruikt de actie `login` voor deze gedeelde inlogcodeaanvraag.

## Wijziging in de browser

- Eén gedeelde SDK-aanvraag voorkomt dubbele scripts bij opnieuw openen of
  React StrictMode.
- Bij een laadfout verschijnt een begrijpelijke melding met opnieuw proberen.
- Verlopen, mislukte en te lang durende controles maken het token ongeldig.
- Afgebroken widgets kunnen geen oud token meer teruggeven.
- Bij een ander e-mailadres begint een nieuwe controle.
- Op smalle schermen past de compacte widget binnen de inlogkaart.

De bestaande e-mailbezorging, inlogcode, resendlimiet en sessieverwerking blijven
behouden.

## Controle

De browserregressie gebruikt de echte React-componenten met een gesimuleerde SDK
op een lokale testserver. Daarmee worden onder andere laden, opnieuw proberen,
verloop, afgebroken callbacks en de knopblokkering gecontroleerd. Dit bewijst geen
succesvolle verificatie bij Cloudflare of Supabase.

Voor volledige productieacceptatie moet Supabase CAPTCHA actief zijn en moet
een echte browser een verse controle voltooien, waarna de bestaande aanvraag
voor een inlogcode slaagt en hergebruik van hetzelfde token wordt geweigerd.
Een weigering van een geautomatiseerde browser door Cloudflare is geen bewijs
dat de geheime sleutel of de toegestane hostnamen verkeerd zijn ingesteld.

Bronnen: [Cloudflare existing-widget flow](https://developers.cloudflare.com/turnstile/spin/prompt.md),
[Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha) en
[eenmalige Turnstile-tokens](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
