# Validation of TARGET operations scaffolds

Checked 2026-10-12 in the isolated authoring environment:

- Fourteen behavioral checks passed via `python3 ops/scripts/check-ops.py`.
- Checks cover normal ordering, drain timeout without game replacement, migration failure, health-triggered restoration, ambiguous resume retaining potentially active games, rollback without schema downgrade, unknown bootstrap containers, safe raw environment serialization, required values, 0600 permissions, strict TLS query validation, public URL credential rejection, secret-free parser errors and Python syntax.
- Compose and both workflow templates parse as YAML.
- No Docker daemon, Caddy server, GitHub Actions environment, VPS, email provider or production database was exercised. YAML parsing is not a deployment validation.
- The backup provider hook intentionally refuses deployment until a real provider integration is implemented. Native build output and application lifecycle endpoints are target contracts, not implemented by these scripts.

Before activation, run staging acceptance in `docs/07-VPS-GITHUB-EN-DEPLOY.md` with the real application, including end-to-end OTP, two-client games, live-game drain, restart recovery, a forced health failure and a genuine offsite restore drill.
