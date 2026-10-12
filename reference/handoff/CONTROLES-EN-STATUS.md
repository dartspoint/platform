# Controles en opleverstatus

Datum: 12 oktober 2026. De exacte gepubliceerde bron-SHA, versiereferentie en bestandslijst staan in `MANIFEST.json`.

## Uitgevoerd voor deze wijziging

| Controle | Resultaat |
|---|---|
| Gerichte OTP-prototypetests (`scripts/check-demo-auth.mjs`) | Geslaagd: codevorm, verificatie, limieten, geldigheid, naamregels en lokale profielopslag |
| Mailrenderertests (`emails/check.mjs`) | Geslaagd: HTML/plaintext, escaping, codecontract en veilige links |
| TypeScript (`tsc --noEmit --incremental false`) | Geslaagd voor de geïntegreerde bron |
| `git diff --check` | Geslaagd |
| Sites-productiebuild | Geslaagd; login, registratie en mailvoorbeelden opgenomen |
| Publicatie | Native Sites-deployment geslaagd; bestaande besloten doelgroep behouden |
| Operationsscaffold | 14 geïsoleerde gedragscontroles geslaagd en drie YAML-bestanden parsebaar; zie `ops/VALIDATION.md` |
| Bronexport | Uit exact dezelfde Git-commit als de gepubliceerde prototypeversie; per bestand SHA-256 vastgelegd |
| ZIP | CRC en volledige inhoud/hashmanifest gecontroleerd tijdens bundeling |

## Niet als uitgevoerd geclaimd

- Geen echte OTP-mail verstuurd; Sites gebruikt een lokale demomail.
- Geen Supabase-project, Resend-account, DNS of VPS voor DartsPoint aangemaakt.
- Geen Colyseus-productieserver gebouwd of live belast; de volledige opdracht en contracten zijn meegeleverd.
- Geen GitHub-workflow geactiveerd en geen runner geïnstalleerd. Templates staan buiten een actieve `.github/workflows`-map.
- Geen echte eigenaar aangemaakt. De procedure wacht bewust op het expliciet bedoelde geverifieerde account.
- Geen echte browser-, fysieke telefoon-, PWA-installatie- of mailclientacceptatie uitgevoerd in deze werkruimte.
- Geen productiebackup of hersteltest uitgevoerd. De deployhook weigert juist te doen alsof deze bewijsstukken aanwezig zijn.

## Nog in te vullen bij uitvoering

De geverifieerde doelrepository en VPS-toegang; het bedoelde owner-e-mailadres; staging/production-Supabaseprojecten; DNS/toegankelijke domeinen; geverifieerde mailafzenders en providerkeys; Turnstile sitekey en providerconfiguratie; GitHub Environment-secrets en variabelen; runnerlabels; gepinde image-digests; daadwerkelijk werkende backup/restorevoorziening.

De bron is voldoende om de exacte UI over te nemen. “Productierijp” ontstaat pas wanneer de echte integraties én de acceptatiecriteria uit deze overdracht aantoonbaar zijn voltooid.
