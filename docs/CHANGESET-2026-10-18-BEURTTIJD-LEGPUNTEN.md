# Beurttijd, DP per leg en opgave — 18 oktober 2026

Na twee bestaande waarschuwingen leidt de derde beurttijdoverschrijding tot een keuze voor de wachtende speler: **Wedstrijd beëindigen** of **1 minuut extra wachten**. De wedstrijd eindigt niet door het onbeantwoord laten van die keuze. Elke verlenging geeft 60 seconden vanaf de serverbeslissing; daarna verschijnt dezelfde keuze opnieuw. Alleen de andere wedstrijdspeler kan kiezen. Toeschouwers en de speler met de verlopen beurt kunnen dit niet. Versies, fasetokens, writer fencing en duurzame command receipts blijven gelden.

Nieuwe wedstrijden gebruiken ratingbeleid 2. Iedere afgemaakte leg boekt direct één zero-sum Elo-mutatie met de bestaande K=32-formule. Legwinst en cumulatieve worpstatistieken worden in dezelfde database-transactie opgeslagen. Het afsluiten van de wedstrijd maakt alleen het bestaande samenvattende ledger en de matchteller; er volgt geen extra Elo-mutatie voor de hele partij. Bestaande historische resultaten en beleid 1 worden niet herberekend.

Bij opgave of een eenzijdige verbindingsuitval telt de lopende leg één keer als verlies voor de opgever. Eerdere legresultaten en DP blijven staan. Deze administratieve leg verzint geen worp, finish, dart, gescoorde punten of gemiddelde. Een gestart duel kan dus ook zonder worp worden opgegeven; een onbevestigde no-show blijft buiten deze legboekingen. Bij tweezijdige uitval blijven al afgemaakte legs bewaard zonder een extra leg toe te kennen.

Een nieuwe leg begint altijd met een nieuwe beurttimer, ook als de legwinnaar daarna zelf begint. Een bestaande timeoutkeuze en toegekende extra minuut worden niet stilzwijgend door de reconnect-afhandeling vervangen.

De private, onveranderbare legboekingen bewaren alleen wedstrijd-ID, seat, legnummer en numerieke ratinggegevens. Er zijn geen browserrechten of runtime UPDATE/DELETE-rechten. De bestaande historische deelnemersminimalisatie na 24 maanden verwijdert ook de bijbehorende legboekingen; verwijdering van een testwedstrijd ruimt ze via de foreign key op.

## Verificatie

- Unitproeven voor drie overschrijdingen zonder automatisch verlies, herhaalde volledige minuten en opgave zonder fictieve worpen.
- Echte databaseproeven voor bevoegdheden, command-retries, minuutdeadline, directe DP/statistieken na leg één, dezelfde starter en beëindigen in leg twee zonder dubbele boeking.
- Native browserproef voor waarschuwingen, keuzevenster, extra minuut en beëindiging; bestaande stop- en geometriegrenzen blijven gelden.
- Typecontroles, oorspronkelijke spelregelproeven, bronpariteit en productiebuild.

De beschermde workflow `reconcile-match.yml` kan één historische opgavewedstrijd inspecteren en gericht corrigeren. Inspectie gebruikt een alleen-lezen transactie. Herstel vereist exact gamenummer, de vooraf gelezen resultaathash en de actieve gereviewde release. De oorspronkelijke ratingledger blijft intact; de correctie heeft een onveranderbare auditregistratie en bewaart latere ratingwijzigingen. Herhaalde uitvoering past niets opnieuw toe. Toernooi- en divisiecorrecties worden door deze actie geweigerd.

Herstel van een eerder gespeelde productiewedstrijd vereist het betreffende gamenummer of een ondubbelzinnige combinatie van spelers en tijdstip. Deze wijziging past geen onbekende historische accounts of wedstrijden aan.
