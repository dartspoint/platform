# Aparte QA-runner onderhouden

De eenmalige QA-installatie op `dartspoint-vps1` is op 13 oktober 2026 bevestigd voor `runner-qa` (UID 1005), met een echte rootless-resourceproef en ongewijzigde bestaande services. Een volledige succesvolle CI-run blijft voor iedere release-SHA verplicht. Gebruik voor een installatie uitsluitend een gereviewd operatorblok met gecontroleerde installerchecksum. Het korte GitHub-registratietoken wordt eenmalig versleuteld overgedragen en tijdelijk in het geheugen gebruikt; zet het niet in dit document, shellhistory, logs of repositorysecrets.

## Vaste identiteit en isolatie

| Instelling | Waarde |
|---|---|
| Account en home | `runner-qa`, `/home/runner-qa` |
| Runnernaam / custom label | `dartspoint-qa-01` / `dartspoint-qa` |
| Systeemunit | `actions.runner.dartspoint-platform.dartspoint-qa-01.service` |
| Runnerinstallatie | `/home/runner-qa/actions-runner` |
| Exacte repositoryworkspace | `/home/runner-qa/actions-runner/_work/platform/platform` |
| Rootless Docker-socket | `unix:///run/user/<UID-van-runner-qa>/docker.sock` |
| Docker-CLI-config | `/home/runner-qa/.docker` |
| Docker-daemonconfig / data-root | `/home/runner-qa/.config/docker/daemon.json` / `/home/runner-qa/.local/share/docker` |
| Runtime-directory | `/run/user/<UID-van-runner-qa>` |
| Gereviewde versies | Runnerinstallatie `2.338.0`; CI-Node `24.18.0`; Playwright `1.58.2`, standaard Chromium headless-shell `145.0.7632.6`, build `1208` |

Account en daemon gebruiken cgroup v2/systemd. De runnerunit en zijn eigen rootless daemon vallen onder dezelfde `user-<UID>.slice`: `MemoryHigh=5G`, `MemoryMax=6G`, `CPUWeight=10`, `IOWeight=10`, zonder CPU-quota. Gewichten geven QA een lagere prioriteit bij concurrentie; ze bewijzen geen haalbare werplatentie.

Het QA-account krijgt geen algemene sudo, Docker-groep, deploymentgroep, app-socket of staging/production Environmentsecrets. CI maakt uitsluitend tijdelijke lokale providercredentials. `scripts/qa-runner-context.py` controleert de feitelijke account-UID, home, workspace, eigen socket, data-root, rootless SecurityOptions en cgroup. De socketgroep moet de eigen primaire groep zijn of vallen binnen de exclusieve eigen, root-owned `/etc/subgid`-toewijzing; de eigenaar-UID en private runtime-directory blijven verplicht. Container-user `0:0` wordt alleen op deze geverifieerde rootless daemon gebruikt en correspondeert daar met het QA-account op de host. Browserbibliotheken worden eenmalig door de beheerder geïnstalleerd; de QA-job installeert geen apt-packages.

## Routering

Een afzonderlijke Chrome-inputdiagnose is uitsluitend toegestaan na de normale
suite op een vertrouwde `main`-push. Repositoryvariabele
`DARTSPOINT_QA_INPUT_DIAGNOSTIC=true` vereist een lokale RSA-3072 privésleutel en
de bijbehorende SPKI-publieke sleutel in
`DARTSPOINT_QA_INPUT_PROFILE_PUBLIC_KEY_BASE64`. Alleen versleutelde archieven
worden geüpload; de privésleutel blijft bij de operator. Zet
`DARTSPOINT_QA_INPUT_DIAGNOSTIC_TARGET=observer` voor dezelfde drie gebruikerscontexten,
zes native stops en oorspronkelijke assertions van de toeschouwertest. De
standaard `game` behoudt de bestaande werpdiagnose. Het gekozen normale scenario
moet eerst bereikt zijn; opname en uitvoer komen in een afzonderlijke private
sandbox. Normale spel-, oefen-, chat- en toeschouwerbewijzen worden vóór en na
de diagnose op inhoud en aanwezigheid gecontroleerd. Het nog lopende
capaciteitsmeetbestand is hiervan uitgesloten. De observeropname gebruikt geen
screenshots en meet ook de zichtbare eigen cgroup-ancestors vóór en na de opname.
Een profileresultaat vervangt nooit een normale acceptatietest en bewijst geen
fysieke schermpresentatie. Schakel de opt-in na het onderzoek weer uit.

Zet repositoryvariabele `DARTSPOINT_QA_ON_VPS` op de exacte tekst `true` nadat installatie en status zijn gecontroleerd. Alleen vertrouwde pushes naar `main` en `staging` kiezen dan de labels `[self-hosted, Linux, X64, dartspoint-qa]`. De herbruikbare staging-CI gebruikt de oorspronkelijke pushcontext. Houd precies één QA-runnerinstantie; die voert de toegewezen main- en stagingjobs na elkaar uit.

Pull requests en production-verificatie blijven op `ubuntu-24.04`. Configuration- en publishjobs behouden hun bestaande hosted route; deployments behouden de aparte staging- en productionrunners. Er zijn geen extra providersecrets nodig. Alle bestaande tests en harde werpgrenzen blijven verplicht. De eerste echte QA-CI moet ook de browserdependencies, containerlimieten en `test-host-capacity.json` bewijzen; een installatiecontrole vervangt die acceptatie niet.

De private runner-umask kan een uitgecheckte publieke OTP-template als `0600` aanmaken. Voor lokale Supabase-start maakt de QA-helper uitsluitend de vaste, eigen `supabase/templates/otp.html` leesbaar als `0644`, na vergelijking met HEAD en controle op symlinks/hardlinks. Envfiles en homedirectories behouden hun private rechten. Een afzonderlijke preflight verifieert vervolgens beide door CLI `2.109.1` geconfigureerde template-endpoints vanuit de eigen Auth-container: HTTP 200, de tokenmacro en volledige bytegelijkheid met de publieke bron zijn verplicht. Loginpolling blijft 40 pogingen met 100 ms wachttijd; bij falen worden alleen aantallen, statussen en booleans gelogd.

## Status controleren

Als beheerder op de VPS:

```sh
qa_uid=$(id -u runner-qa)
sudo systemctl status actions.runner.dartspoint-platform.dartspoint-qa-01.service --no-pager
sudo systemctl show actions.runner.dartspoint-platform.dartspoint-qa-01.service --property=User,Group,Slice,ActiveState,SubState
sudo systemctl show "user-${qa_uid}.slice" --property=MemoryHigh,MemoryMax,CPUWeight,IOWeight,CPUQuotaPerSecUSec
sudo -iu runner-qa env XDG_RUNTIME_DIR="/run/user/${qa_uid}" DOCKER_HOST="unix:///run/user/${qa_uid}/docker.sock" DOCKER_CONFIG=/home/runner-qa/.docker docker info --format '{{json .SecurityOptions}} {{.CgroupVersion}} {{.CgroupDriver}} {{.DockerRootDir}}'
```

Op een beheerwerkstation met bestaande GitHub-authenticatie:

```sh
gh api repos/dartspoint/platform/actions/runners --jq '.runners[] | select(.name == "dartspoint-qa-01") | {id,name,status,busy,labels: [.labels[].name]}'
```

Print geen environmentbestanden, tokens, Docker-containerconfig of private testlogs voor een statuscontrole.

## Cleanup en uitschakelen

Preclean verwijdert alleen de eigen Supabase-projectresources `dartspoint-development` en de expliciet gelabelde Redis-container `dartspoint-development-redis` op de geverifieerde QA-daemon. Supabase wordt met `stop --no-backup --project-id dartspoint-development` gestopt; als dependencies nog ontbreken, gebruikt de helper dezelfde exacte naam-/labelcontrole voor achtergebleven resources. Geen algemene Docker-prune of cleanup van andere accounts.

De integration-EXIT sluit uitsluitend zijn eigen native processen af, gecontroleerd op oorspronkelijke PID-starttijd en parent. Bij falen ruimt hij ook de QA-stack op. Bij succes blijft de database beschikbaar voor de volgende echte TLS-/restoretest. Na die test en de veilige artifactupload ruimt de `always()`-stap de stack op en daarna uitsluitend de exacte repositoryworkspace. Bij een mislukte scope- of cleanupcontrole worden workspacebestanden behouden. Een afgebroken job krijgt bij de volgende start opnieuw preclean; de poortprobe gebruikt `SO_REUSEADDR` voor achtergebleven TCP TIME_WAIT, terwijl actieve listeners geweigerd blijven. Bezette onbekende testpoorten veroorzaken een fout met alleen het poortnummer, geen willekeurige proceskill.

Voor uitschakelen:

```sh
gh variable set DARTSPOINT_QA_ON_VPS --repo dartspoint/platform --body false
```

Nieuwe jobs kiezen dan de hosted fallback. Reeds toegewezen jobs veranderen niet automatisch van runner. Wacht tot de QA-run voltooid en de runner `busy: false` is, of annuleer alleen de betreffende run en bevestig de afronding. Stop daarna als beheerder uitsluitend:

```sh
sudo systemctl stop actions.runner.dartspoint-platform.dartspoint-qa-01.service
```

Stop geen andere runners, appservices of rootless daemons. Een latere herstart van deze ene unit vereist opnieuw een statuscontrole voordat de opt-in wordt ingeschakeld.
