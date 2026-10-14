# 14 oktober 2026 — eerste productionvrijgave

De productionomgeving gebruikt een afzonderlijk Supabaseproject en een aparte Hetzner-backuprepository. `DATABASE_CA_CERT_BASE64` is toegevoegd met de gevalideerde publieke Supabase CA. De ongeldige eerste `INTERNAL_DEPLOY_TOKEN` is vervangen door 32 willekeurige bytes in base64url-formaat; secretwaarden blijven buiten de repository en logs.

De VPS-beheerder heeft de vijf publieke productioninstellingen vast geïnstalleerd. Het afzonderlijke beheerscript schakelt Caddy pas om na readiness van de verwachte release en een recente geslaagde offsitebackup met restorebewijs. Staging en de afzonderlijke landingspagina behouden hun eigen hostblokken.

De eerste volledige productioncontrole ontdekte een browserfout bij het verbinden van de persoonlijke chat. De server stuurt daar ook een lege `chat.changed {}`. Zolang een bekeken kanaal nog wordt opgezocht, kon `undefined === undefined` onterecht als overeenkomst gelden en daarna `message.id` lezen zonder bericht.

De client vereist nu een werkelijk kanaal-ID voordat een notificatie kan matchen, en een werkelijk bericht voordat de snelle berichtprojectie wordt gebruikt. Metadata-notificaties voor een bekend kanaal blijven de geschiedenis ophalen. Reconnect, polling, verwijderingen, leesposities en werpverwerking blijven hetzelfde contract gebruiken. De productionworkflow doorloopt de normale controles; de eerdere tijdelijke testuitzondering voor de stagingrelease wordt niet hergebruikt.
