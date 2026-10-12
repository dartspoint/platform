# Operationele validatie — 12 oktober 2026

`python3 ops/scripts/check-ops.py`: **14 checks geslaagd**. Dit omvat juiste releasevolgorde, echte countervoorwaarden, twintig-minutendrain zonder vervanging bij timeout, migrationfail, rollback bij healthfail, onduidelijke resume zonder gevaarlijke automatische rollback, schema behouden bij rollback, onbekende bootstrapcontainers weigeren, raw envserialization, vereiste waarden, 0600-permissies, TLS-queryvalidatie, originvalidatie en secretvrije fouten.

Daarnaast zijn alle drie echte Docker-images lokaal gebouwd en gestart met echte PostgreSQL/Auth/Redis en workerheartbeat. Next standalone-symlinks zijn gecontroleerd op relatieve targets binnen het image. `/readyz` toont dezelfde SHA, workerhealth en loopbackcontrol werken, runtimes draaien als niet-root en bevatten geen env-/referentiebestanden. Een echte lokale database-dump is succesvol hersteld in een disposable PG17-container, inclusief Auth, RLS en Elo-integriteit. Native runtime-drain laat een reeds verzegelde inslag afwerken en geeft pas een veilige stop bij drie nulcounters.

De echte Restic/S3-backupgate is geïmplementeerd, inclusief consistente snapshots en teruggelezen offsite restore. Externe S3/SMTP/CAPTCHA-credentials en de staginghost zijn hier niet geconfigureerd. Caddy/DNS/TLS, GitHub self-hosted deployment en een daadwerkelijke VPS-rollback worden op staging geaccepteerd. Geen YAML-parse of mocktest wordt als bewijs voor die externe rollout gepresenteerd.

Zie `../docs/LOCAL-ACCEPTANCE.md` voor scope en reproduceerbare commands en `../docs/GITHUB-STAGING.md` voor de exacte environmentinventory.
