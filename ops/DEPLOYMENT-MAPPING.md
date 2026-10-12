# Mapping vóór de aanpassing (12 oktober 2026)

| Onderdeel | Aangetroffen | Gewenst |
|---|---|---|
| Doelhost | Documentatie: twee VPS'en | Eén Ubuntu 24.04 amd64 VPS; development elders |
| Build | Checkout, npm en Docker-build op self-hosted runner | Hosted verificatie en GHCR-images met digest |
| Runtime | Runner-owned `/opt/dartspoint/<env>` | App-owned `/srv/dartspoint/<env>` |
| Docker | Runner gebruikt zijn daemon | Eigen rootless daemon per applicatiegebruiker |
| Overdracht | Runner schrijft direct releases en Compose | Private JSON-overdracht, vaste root-owned helper, beperkte sudo als appgebruiker |
| Poorten | Beide omgevingen 4300 / 42567 | Staging 3001 / 2568; production 3000 / 2567; alles loopback |
| Services | Web, realtime, worker, Redis; tijdelijke migrate-service | Alle services behouden; drie applicatie-images, Redis apart gepind |
| Caddy | Afzonderlijke hostinstructies | Vier siteblokken op dezelfde native Caddy |
| Backup | Restic + snapshotdump + echte geïsoleerde restore | Behouden, Hetzner-regio expliciet, periodiek en begrensd |
| Secrets | Gescheiden app/migration/backup-envfiles | Behouden; geen privileged credentials in runtimecontainers |

De oorspronkelijke git-status was schoon; uitgangscommit `38087440c373df00c7680f5ddcbe73e7fd16ce1b`. Dit is een code-inventaris, geen controle van de nieuwe doel-VPS. `reference/handoff/` blijft het ongewijzigde oorspronkelijke overdrachtsarchief.
