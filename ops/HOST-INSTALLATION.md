# Eenmalige installatie door de beheerder

Deze stappen zijn voor **de nieuwe doel-VPS**, als `nick` met bestaande beheerdersrechten (of de feitelijk aanwezige beheerder). Development en andere projecten blijven ongemoeid. Een workflow voert deze installatie nooit uit. Maak eerst een hostinventaris/backup; bekijk bestaande gebruikers, rootless daemons, services, poorten, Caddy, schijf/RAM en paden. Verander SSH, Tailscale of firewall niet vanuit een release.

## 1. Accounts en dependencies

Ubuntu 24.04, amd64, cgroup v2/systemd; Python 3, ca-certificates, sudo/visudo, native Caddy, Docker Engine met rootless extras, Compose >=2.30 en een bewust gecontroleerde recente Restic-versie die `restore --verify` ondersteunt. Volg de officiële Docker-package/rootlessinstallatie en verifieer versies en leverancierschecksums. PostgreSQL-clients krijgen het echte host-CA-bundle expliciet read-only gemount; een eventuele provider-CA wordt daaraan toegevoegd. Geen algemene Docker-groep/root-Docker-socket voor app of runner. [Rootless installeren](https://docs.docker.com/engine/security/rootless/), [resourcegrenzen](https://docs.docker.com/engine/security/rootless/tips/).

De managed helpers gebruiken bewust `PATH=/usr/bin:/bin`. Installeer de gecontroleerde Restic-binary daarom root-owned als `/usr/bin/restic`, met `0755`, en controleer `/usr/bin/restic version` en `/usr/bin/restic restore --help` op `--verify`. Een binary uitsluitend in een administrator-home of `/usr/local/bin` wordt door deze helpers niet gebruikt.

Controleer eerst `getent passwd`/`id`; maak alleen ontbrekende accounts. Voor nieuwe accounts:

```sh
sudo useradd --create-home --shell /bin/bash dartspoint-staging
sudo useradd --create-home --shell /bin/bash dartspoint-production
sudo useradd --create-home --shell /bin/bash runner-staging
sudo useradd --create-home --shell /bin/bash runner-production
sudo chmod 0700 /home/dartspoint-staging /home/dartspoint-production /home/runner-staging /home/runner-production
sudo loginctl enable-linger dartspoint-staging
sudo loginctl enable-linger dartspoint-production
```

App-gebruikers moeten ieder minimaal 65536 **niet-overlappende** subordinate UIDs/GIDs hebben in `/etc/subuid` en `/etc/subgid`. Normale Ubuntu-useradd kent doorgaans ranges toe; inspecteer dit werkelijk en wijs ontbrekende ranges als beheerder toe. Gebruik nooit de development-UID. Accounts hebben geen SSH-password of algemene sudo; SSH-beheer blijft via bestaande `nick`-sleutels over Tailscale.

Log als beheerder in de context van elk app-account in (`sudo -iu dartspoint-staging`, vervolgens production), controleer HOME en `/run/user/$(id -u)`, en installeer `dockerd-rootless-setuptool.sh install`. Start/enable de gebruikersunit `systemctl --user enable --now docker`. Gebruik `DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock` en `XDG_RUNTIME_DIR=/run/user/$(id -u)` bij beheercommando's. Controleer `docker info`: rootless, cgroup 2, systemd; verifieer daadwerkelijke limieten. Behoud Ubuntu's nodige AppArmor-profiel voor RootlessKit; zet geen globale beveiligingsmaatregel uit als workaround. Runners hebben geen toegang tot die sockets en krijgen geen Docker-daemon.

## 2. Gereviewde managed bestanden installeren

**Op de development-VPS:** inspecteer diff/tests en archiveer de exacte gereviewde main-commit met git archive. Draag dat archive via de bestaande Tailscale/OpenSSH-verbinding over. **Op de doel-VPS:** controleer de checksum/commit, pak het uit in een beheerder-owned werkdirectory en voer uitsluitend na review uit:

```sh
sudo python3 ops/scripts/install-host.py /pad/naar/public-config.json
```

Maak vooraf als beheerder een JSON volgens `ops/host-public-config.example.json` met de vijf werkelijke publieke GitHub-waarden per omgeving. Die worden root-owned onder `/etc/dartspoint/<env>/public.json` geïnstalleerd; de apphelper weigert een afwijkend project/key/sitekey in een manifest. Beide Supabaseprojecten moeten verschillend zijn. Je mag production nog uit het JSON weglaten zolang die niet is ingericht; de productionhelper weigert dan tot een bewuste latere installatie van zijn policy. Dit zijn publieke waarden, geen secrets.

De installer vereist bestaande vier aparte accounts. Hij weigert onverwachte runtimeownership/symlinks, zet appdirectories `0700`, houdt parentdirectories/scripts root-owned, installeert vaste Compose/config/pins en valideert sudoers met `visudo`. Hij maakt geen providers, Docker-daemons, SSH-, firewall- of Caddywijzigingen en start geen release/timer.

| Pad | Eigendom/rechten |
|---|---|
| `/srv/dartspoint` | root:root 0755 |
| `/srv/dartspoint/staging` en releases | dartspoint-staging 0700 |
| `/srv/dartspoint/production` en releases | dartspoint-production 0700 |
| `/usr/local/libexec/dartspoint` + Python helpers | root:root, directory 0755, files 0644 |
| `/usr/local/libexec/dartspoint-deploy-staging` / production | root:root 0755 |
| `/etc/dartspoint/<env>/compose.yml` en image-pins.json | root:root 0644, root-owned parents |
| `/var/lib/dartspoint-delivery/<env>` | betreffende runner:betreffende appgroep 2750 |
| tijdelijke pending.json | betreffende runner:appgroep 0640; verwijderd na de handeling |
| release-envfiles / private logs | betreffende app, 0600, private parent |

De sudoersregels staan onder `/etc/sudoers.d/dartspoint-<env>`:

```sudoers
Defaults:runner-staging !setenv
runner-staging ALL=(dartspoint-staging) NOPASSWD: /usr/local/libexec/dartspoint-deploy-staging ""
Defaults:runner-production !setenv
runner-production ALL=(dartspoint-production) NOPASSWD: /usr/local/libexec/dartspoint-deploy-production ""
```

De `""` verlangt nul argumenten. Geen shell, wildcards, root, sudo-as-andere-omgeving, systemd- of Caddyrechten. Controleer `sudo -l -U runner-staging` en production: verwijder eerdere brede rechten alleen als expliciete beheerderhandeling. Helpers/pins worden uitsluitend via dit gereviewde beheerproces bijgewerkt; gewone releases dragen geen uitvoerbare scripts/Compose over.

## 3. Twee dedicated GitHub runners

**In GitHub:** regel eerst branch/environment/runnergroepbeperkingen volgens de inventaris. Gebruik de officiële registratie-instructies en checksum voor de actuele amd64 runner; bewaar registratie-tokens buiten logs/history en verwijder tijdelijke tokens. Maak als beheerder alleen de benodigde installatiedirectories en geef ze aan de corresponderende runner. Registreer/start de stagingrunner als `runner-staging`, production als `runner-production`:

| Instelling | Staging | Production |
|---|---|---|
| directory | /opt/actions-runner-dartspoint-staging | /opt/actions-runner-dartspoint-production |
| naam | dartspoint-staging-01 | dartspoint-production-01 |
| custom label | dartspoint-staging | dartspoint-production |
| aanvullend | self-hosted, Linux, X64 | self-hosted, Linux, X64 |

Installeer de afzonderlijke runner-systemdservices volgens GitHubs instructie, expliciet met de bijbehorende runner-user. Installeer daarna als beheerder `ops/systemd/runner-limits.conf` als drop-in `limits.conf` onder `/etc/systemd/system/<werkelijke-runnerunit>.d/` voor beide units; verkrijg de echte unitnamen uit svc.sh/systemctl. Voer daemon-reload uit en start de runnerunits gecontroleerd opnieuw vóór ingebruikname. Controleer met systemctl show de effectieve CPUQuota/MemoryMax/TasksMax. Dit begrenst ook de host-Resticprocessen en downloadactie van deployments; de rootless Docker-containers hebben daarnaast hun eigen afgedwongen limieten. Een runner-temp/werkdirectory blijft runner-owned en afgescheiden; er komt geen sourcecheckout/runtime op die directory. Restrict packages access voor `dartspoint/platform` bij private GHCR-images. Beide sudo wrappers moeten zonder pending.json weigeren; een extra argument en de wrapper van de andere omgeving moeten worden afgewezen. Geen privilege-test die een echte release start.

## 4. DNS, Tailscale en één native Caddy

**Bij DNS:** vier A-records `@`, `staging`, `realtime`, `realtime.staging` naar hetzelfde publieke doel-VPS-IP. AAAA alleen na werkende IPv6-test. **Voor stagingtesters:** bestaand Tailscale-netwerk plus split DNS/hosts voor de twee staginghosts naar de Tailscale-IP. Dit verandert geen Tailscale/SSH-config vanuit een workflow.

**Op de doel-VPS:** voeg de vier betrokken siteblocks uit de twee Caddyfiles aan de bestaande native Caddyconfig toe, behoud alle overige sites. Valideer de volledige configuratie met `sudo caddy validate --config /etc/caddy/Caddyfile`; reload één keer gecontroleerd via `sudo systemctl reload caddy`. Een applicatierelease doet geen globale reload. Optioneel `www` later apart redirecten na zijn DNS/certificaatinrichting. Controleer dat publiek 80/443 bereikbaar zijn voor HTTPS/ACME; beheer uitsluitend via bestaande Tailscale/OpenSSH-sleutels. Geen publieke Docker/DB/Redis/app-poorten.

## 5. Eerste lege database en nieuwe backuprepository

**Bij Supabase:** kies de geteste PostgreSQL 17/directe of sessionconnecties. Maak drie afzonderlijke loginrollen. App-login is `NOSUPERUSER NOBYPASSRLS` en krijgt `GRANT dartspoint_app` zodra de expand-migrations die rol hebben gemaakt. Maak migration- en backupcredentials bewust apart; backup krijgt volledige SELECT/sequence/schema/functionrechten op de te dumpen schema's en gecontroleerde RLS-bypass voor deze backuprol. Grant ook toekomstige migratietabellen via passende default privileges van de echte objecteigenaren. Een gewone app-login krijgt nooit deze rechten. Verifieer de feitelijke providerrechten met de gate, niet alleen rolelabels.

**In GitHub:** vul Environmentwaarden in, merge zelf naar staging/production. Hosted builds leveren de images; de eerste deployment kan bewust stoppen vóór backup/appstart omdat er nog geen domeintabellen of geen geïnitialiseerde Resticrepository zijn. De helper behoudt een private release onder `/srv/dartspoint/<env>/releases/<sha>-<run>-<attempt>`. Verkrijg dat release-ID zonder envfiles te printen.

**Op de doel-VPS als beheerder:** gebruik de juiste app-context. Bijvoorbeeld voor staging (vervang alleen RELEASE_ID door de werkelijk behouden ID):

```sh
sudo -u dartspoint-staging /usr/bin/python3 -I /usr/local/libexec/dartspoint/operator-actions.py staging bootstrap RELEASE_ID staging:first-database
sudo -u dartspoint-staging /usr/bin/python3 -I /usr/local/libexec/dartspoint/operator-actions.py staging init-backup RELEASE_ID staging:new-backup
```

Bootstrap controleert over verify-full TLS dat profiles/matches/migratieregistratie/private-schema nog ontbreken, dat geen current/bootstrapped-marker bestaat, en voert alleen de checksummed expand-only migratierunner uit. Geen algemene backupbypass. Hij verwijdert migration.env na gebruik en laat admissions gesloten. Grant daarna bij de provider `dartspoint_app` aan de echte app-login. Init-backup initialiseert alleen de bewust al gemaakte bucket en weigert een bestaande repository. Voor production: dezelfde stappen met production-account, -omgeving en -confirmation.

**In GitHub:** rerun de normale workflow als nieuwe attempt nadat database, rolgrant en repository klaar zijn. Vanaf die poging zijn de echte app-role/TLS-check, volledige offsitebackup, geïsoleerde restore, drain/migratie en readiness verplicht. Ook de eerste openstelling komt uitsluitend na die normale gate. Onbekende bestaande containers zonder current worden geweigerd. Een half-mislukte bootstrap vraagt aparte operatorinspectie/herstel, geen reset of ruimere bypass.

## 6. Eerste echte owner

**Op de website:** laat de echte eigenaar via OTP in het juiste project verifiëren en onboarding afronden. **Bij Supabase:** verkrijg zijn echte Auth-UUID en email. **Als beheerder/app-user:** maak buiten checkout/artifacts een tijdelijk owner-only bestand met de al gebruikte server/app-DB-config, publieke Supabase-URL, `APP_ENV`, `BOOTSTRAP_OWNER_USER_ID`, `BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_CONFIRM=<environment>:<UUID>`. Gebruik geen shell-source en geen secrets in procesargumenten.

Ownerbootstrap bereikt de echte Auth- en DB-provider via de eigen rootless daemon met gewone uitgaande netwerktoegang. Lees alleen de workerimage-digest uit release.json en gebruik `docker run --rm --cpus 0.5 --memory 256m --pids-limit 128 --env-file <private-bestand> <worker-digest> node scripts/owner-bootstrap.mjs`. De env-filepath/digest zijn geen secretwaarden; het bestand zelf blijft 0600. Verwijder het tijdelijke bestand altijd. De bestaande CLI controleert echte geverifieerde Auth-identiteit en volledig profiel, lockt exclusief, schrijft audit en weigert herhaling/bestaande owner. Geen ownerbootstrap in gewone workflow.

## 7. Timers, herstel en onderhoud

Pas **na de eerste gezonde release**, als beheerder:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now dartspoint-backup-staging.timer dartspoint-retention-staging.timer
sudo systemctl enable --now dartspoint-backup-production.timer dartspoint-retention-production.timer
sudo systemctl list-timers 'dartspoint-*'
```

Activeer elke omgeving pas wanneer die bestaat. Controleer de timer/service-resultaten, laatste backup-evidence en cloudrepository; verbind je bestaande monitoring met failures en achterstallige backups. De installer verstuurt geen berichten/monitoringkeys.

Status/drain/resume als beheerder, bijvoorbeeld `sudo -u dartspoint-staging /usr/bin/python3 -I /usr/local/libexec/dartspoint/operator-actions.py staging status`. Rollback: dezelfde context met `rollback <retained-release-id>`, na gate/drain; geen DB-downgrade. Bewaar oude digests in GHCR en lokale images zolang hun rollbackperiode loopt. Geen `compose down -v` of ongerichte prune. Oude release-envconfig bevat historische secrets; ruim die alleen op volgens bewust retentie/herstelbeleid, nooit de current of laatste bewezen rollbackrelease. Deploy-tokenrotatie per omgeving apart plannen: sluit admissions, drain, wijzig token op alle relevante behouden/current configs, accepteer control/readiness en hervat; een gewone release met veranderde token wordt geweigerd.

## 8. Als /opt/dartspoint al in gebruik is

Dit is een afzonderlijk onderhoudsplan; de installer verplaatst/verwijdert niets automatisch.

1. Inventariseer exacte current/release-SHA's, gebruikers/socket, volumes/mounts, Redis-AOF, envfiles, hooks, running matches, Caddy/poorten en providerconfig. Leg herstel-SHA/config vast en maak een werkelijke offsitebackup + geïsoleerde restoreproef. Behoud `/opt/dartspoint` en bestaande daemons.
2. Bereid de vier afgesproken accounts/daemons en managed bestanden voor. Zet nog geen deploymentrunner/timers aan. Old local tags zijn geen geverifieerde GHCR-digests: bouw de exacte bron op hosted runners met de juiste public values; registreer echte manifest/digests.
3. Plan een onderhoudsmoment. Drain de oude omgeving en controleer alle drie nulcounters; stop oude appcontainers pas daarna. Inventariseer/exporteer operationele Redis-AOF/data afzonderlijk als die nodig zijn. Kopieer nooit live Docker dataroot tussen gebruikers; neem een gecontroleerde Redis-backup en importeer die met juiste ownership in de nieuwe daemon, of documenteer herstel van ephemere Redisstaat uit de database met admissions gesloten.
4. Kopieer alleen gereviewde rolconfig naar app-owned 0700/0600 nieuwe releaseconfig via het nieuwe deliverymodel; vervang oude absolute paden en poorten, neem geen runner-owned Compose/hooks over. Externe database blijft dezelfde en wordt niet gereset. Activeer nieuwe normale release met backup/restore/migratie/readinessgate; pas Caddy bij dit ene onderhoudsmoment gecontroleerd aan.
5. Accepteer Auth, realtime/reconnect, rolegrenzen, resources, backup/rollback en beide omgevingen. Bij fout: houd nieuwe admissions gesloten, stop nieuwe apps veilig, herstel oude Caddy/daemon/config en resume de oude bewezen release. Oude games mogen niet tegelijk met nieuwe writers actief worden.
6. Verwijder oude installatie/volumes pas na expliciete beheerderacceptatie en bewaartermijn. Er is geen automatische dataverwijderende migratie/reset. Deel de geïnstalleerde manifest/pins niet blind met oude lokale tags.
